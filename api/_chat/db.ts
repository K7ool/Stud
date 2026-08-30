/**
 * Conversation / message / memory persistence.
 *
 * Uses Upstash Redis (KV) when KV_REST_API_URL is configured; falls back to
 * per-instance memory otherwise. The same backing store is already used by
 * the stud relay (api/stud/cache.ts), so no new infrastructure is required.
 *
 * All keys are namespaced by userId so the same Vercel KV database can be
 * shared safely. userId is supplied by the caller — the API routes authenticate
 * the request and reject missing/invalid ids.
 *
 * Lives in api/_chat/db.ts so it can be imported by sibling Edge Functions
 * without being deployed as a route itself (Vercel ignores files in
 * directories prefixed with `_`).
 */

import { cacheGet, cacheSet, cacheDel } from "../stud/cache";

export type Role = "user" | "assistant" | "system" | "tool";

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  toolCalls?: Array<{ id: string; name: string; args: unknown; result?: unknown; status: string; error?: string }>;
  createdAt: number;
}

export interface Conversation {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  status: "active" | "archived";
}

export type MemoryScope = "global" | "project" | "session";
export type MemoryCategory =
  | "USER_PREFERENCES"
  | "PROJECT_CONTEXT"
  | "CODING_PREFERENCES"
  | "WORKFLOW_PREFERENCES"
  | "IMPORTANT_FACTS"
  | "ACTIVE_GOALS"
  | "COMMON_PATTERNS"
  | "IMPORTANT_DECISIONS";

export interface Memory {
  id: string;
  userId: string;
  projectId: string | null;
  scope: MemoryScope;
  category: MemoryCategory;
  key: string;
  value: string;
  confidence: number;
  sourceConversationId?: string;
  createdAt: number;
  updatedAt: number;
}

const now = () => Date.now();

const k = {
  convList: (uid: string) => `chat:list:${uid}`,
  conv: (uid: string, id: string) => `chat:conv:${uid}:${id}`,
  msgs: (uid: string, cid: string) => `chat:msgs:${uid}:${cid}`,
  memoryList: (uid: string) => `chat:memlist:${uid}`,
  memory: (uid: string, id: string) => `chat:mem:${uid}:${id}`,
};

const CONV_TTL = 60 * 60 * 24 * 30;
const MSG_TTL = 60 * 60 * 24 * 30;
const MEM_TTL = 60 * 60 * 24 * 90;

// ----- conversations -------------------------------------------------------

export async function listConversations(userId: string): Promise<Conversation[]> {
  const ids = (await cacheGet<string[]>(k.convList(userId))) || [];
  const out: Conversation[] = [];
  for (const id of ids) {
    const c = await cacheGet<Conversation>(k.conv(userId, id));
    if (c) out.push(c);
  }
  return out.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export async function getConversation(userId: string, id: string): Promise<Conversation | null> {
  return cacheGet<Conversation>(k.conv(userId, id));
}

export async function createConversation(
  userId: string,
  projectId: string,
  id: string,
  title = "New chat",
): Promise<Conversation> {
  const ts = now();
  const conv: Conversation = {
    id,
    userId,
    projectId,
    title,
    createdAt: ts,
    updatedAt: ts,
    lastMessageAt: ts,
    status: "active",
  };
  await cacheSet(k.conv(userId, id), conv, CONV_TTL);
  const ids = (await cacheGet<string[]>(k.convList(userId))) || [];
  if (!ids.includes(id)) {
    ids.unshift(id);
    await cacheSet(k.convList(userId), ids.slice(0, 500), CONV_TTL);
  }
  return conv;
}

export async function patchConversation(
  userId: string,
  id: string,
  patch: Partial<Pick<Conversation, "title" | "status" | "projectId" | "lastMessageAt">>,
): Promise<Conversation | null> {
  const conv = await getConversation(userId, id);
  if (!conv) return null;
  const updated = { ...conv, ...patch, updatedAt: now() };
  if (patch.lastMessageAt) updated.lastMessageAt = patch.lastMessageAt;
  await cacheSet(k.conv(userId, id), updated, CONV_TTL);
  return updated;
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  await cacheDel(k.conv(userId, id));
  await cacheDel(k.msgs(userId, id));
  const ids = (await cacheGet<string[]>(k.convList(userId))) || [];
  const next = ids.filter((x) => x !== id);
  await cacheSet(k.convList(userId), next, CONV_TTL);
}

// ----- messages ------------------------------------------------------------

export async function listMessages(userId: string, conversationId: string): Promise<StoredMessage[]> {
  return (await cacheGet<StoredMessage[]>(k.msgs(userId, conversationId))) || [];
}

export async function appendMessages(
  userId: string,
  conversationId: string,
  messages: StoredMessage[],
): Promise<void> {
  const existing = await listMessages(userId, conversationId);
  const merged = mergeMessages(existing, messages);
  await cacheSet(k.msgs(userId, conversationId), merged, MSG_TTL);
  await patchConversation(userId, conversationId, { lastMessageAt: now() });
}

export async function setMessages(
  userId: string,
  conversationId: string,
  messages: StoredMessage[],
): Promise<void> {
  await cacheSet(k.msgs(userId, conversationId), messages, MSG_TTL);
  await patchConversation(userId, conversationId, { lastMessageAt: now() });
}

function mergeMessages(existing: StoredMessage[], incoming: StoredMessage[]): StoredMessage[] {
  const byId = new Map<string, StoredMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt);
}

// ----- memory --------------------------------------------------------------

export async function listMemories(userId: string): Promise<Memory[]> {
  const ids = (await cacheGet<string[]>(k.memoryList(userId))) || [];
  const out: Memory[] = [];
  for (const id of ids) {
    const m = await cacheGet<Memory>(k.memory(userId, id));
    if (m) out.push(m);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createMemory(
  userId: string,
  partial: Omit<Memory, "id" | "userId" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<Memory> {
  const id = partial.id || `mem_${now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ts = now();
  const mem: Memory = {
    id,
    userId,
    projectId: partial.projectId ?? null,
    scope: partial.scope,
    category: partial.category,
    key: partial.key,
    value: partial.value,
    confidence: partial.confidence,
    sourceConversationId: partial.sourceConversationId,
    createdAt: ts,
    updatedAt: ts,
  };
  await cacheSet(k.memory(userId, id), mem, MEM_TTL);
  const ids = (await cacheGet<string[]>(k.memoryList(userId))) || [];
  if (!ids.includes(id)) {
    ids.unshift(id);
    await cacheSet(k.memoryList(userId), ids.slice(0, 500), MEM_TTL);
  }
  return mem;
}

export async function patchMemory(
  userId: string,
  id: string,
  patch: Partial<Pick<Memory, "value" | "confidence" | "scope" | "category" | "key">>,
): Promise<Memory | null> {
  const list = await cacheGet<string[]>(k.memoryList(userId));
  if (!list || !list.includes(id)) return null;
  const cur = await cacheGet<Memory>(k.memory(userId, id));
  if (!cur) return null;
  const updated = { ...cur, ...patch, updatedAt: now() };
  await cacheSet(k.memory(userId, id), updated, MEM_TTL);
  return updated;
}

export async function deleteMemory(userId: string, id: string): Promise<void> {
  await cacheDel(k.memory(userId, id));
  const list = (await cacheGet<string[]>(k.memoryList(userId))) || [];
  await cacheSet(k.memoryList(userId), list.filter((x) => x !== id), MEM_TTL);
}

// ----- userId helpers -----------------------------------------------------

export function getUserId(req: Request): string | null {
  const h = req.headers.get("X-User-Id");
  if (h && h.length > 0 && h.length <= 128) return h.trim();
  try {
    const url = new URL(req.url);
    const u = url.searchParams.get("uid");
    if (u && u.length > 0 && u.length <= 128) return u.trim();
  } catch {}
  return null;
}

export function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
