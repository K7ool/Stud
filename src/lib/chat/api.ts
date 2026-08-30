/**
 * Stable per-browser user id used by the persistent chat / memory system.
 *
 * Resolution order:
 *   1. Logged-in user (custom userAuth store) — keyed by UserAccount.id
 *   2. A random 32-char id minted once per browser and stored in localStorage
 *
 * The id is required by the server APIs (X-User-Id header). It is NOT a
 * security boundary — anyone with the id can read/write that account's data,
 * which is consistent with the rest of the app (no real auth today).
 */

const KEY = "stud:deviceId";

function mint(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 32; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `g_${id}`;
}

export function getClientUserId(): string {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "ssr";
  try {
    const authRaw = localStorage.getItem("stud-user-auth");
    if (authRaw) {
      const parsed = JSON.parse(authRaw);
      const cur = parsed?.state?.currentUser;
      if (cur?.id) return `u_${cur.id}`;
    }
  } catch {
    // ignore — fall through to device id
  }
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = mint();
    try { localStorage.setItem(KEY, id); } catch { /* private mode */ }
  }
  return id;
}

const headers = (): Record<string, string> => {
  const uid = getClientUserId();
  return { "X-User-Id": uid, "Content-Type": "application/json" };
};

function withQuery(url: string): string {
  const uid = getClientUserId();
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}uid=${encodeURIComponent(uid)}`;
}

export type Role = "user" | "assistant" | "system" | "tool";

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  toolCalls?: Array<{ id: string; name: string; args: unknown; result?: unknown; status: string; error?: string }>;
  createdAt: number;
}

export interface ConversationMeta {
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

const API = "/api/chat";

// ----- conversations ------------------------------------------------------

export async function apiListConversations(): Promise<ConversationMeta[]> {
  const r = await fetch(`${API}/conversations`, { headers: headers() });
  if (!r.ok) return [];
  const j = (await r.json()) as { conversations?: ConversationMeta[] };
  return j.conversations || [];
}

export async function apiCreateConversation(
  id: string,
  projectId: string,
  title: string,
): Promise<ConversationMeta | null> {
  const r = await fetch(`${API}/conversations`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ id, projectId, title }),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { conversation?: ConversationMeta };
  return j.conversation || null;
}

export async function apiPatchConversation(
  id: string,
  patch: Partial<Pick<ConversationMeta, "title" | "status" | "projectId">>,
): Promise<ConversationMeta | null> {
  const r = await fetch(`${API}/conversations/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { conversation?: ConversationMeta };
  return j.conversation || null;
}

export async function apiDeleteConversation(id: string): Promise<boolean> {
  const r = await fetch(`${API}/conversations/${id}`, { method: "DELETE", headers: headers() });
  return r.ok;
}

export async function apiGetMessages(id: string): Promise<StoredMessage[]> {
  const r = await fetch(`${API}/conversations/${id}/messages`, { headers: headers() });
  if (!r.ok) return [];
  const j = (await r.json()) as { messages?: StoredMessage[] };
  return j.messages || [];
}

export async function apiSetMessages(id: string, messages: StoredMessage[]): Promise<boolean> {
  const r = await fetch(`${API}/conversations/${id}/messages`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ messages }),
  });
  return r.ok;
}

export async function apiAppendMessages(id: string, messages: StoredMessage[]): Promise<boolean> {
  const r = await fetch(`${API}/conversations/${id}/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ messages }),
  });
  return r.ok;
}

// ----- memories ----------------------------------------------------------

export async function apiListMemories(): Promise<Memory[]> {
  const r = await fetch(`${API}/memories`, { headers: headers() });
  if (!r.ok) return [];
  const j = (await r.json()) as { memories?: Memory[] };
  return j.memories || [];
}

export async function apiCreateMemory(input: {
  projectId?: string | null;
  scope: MemoryScope;
  category: MemoryCategory;
  key: string;
  value: string;
  confidence?: number;
  sourceConversationId?: string;
}): Promise<Memory | null> {
  const r = await fetch(`${API}/memories`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(input),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { memory?: Memory };
  return j.memory || null;
}

export async function apiPatchMemory(
  id: string,
  patch: Partial<Pick<Memory, "value" | "confidence" | "scope" | "category" | "key">>,
): Promise<Memory | null> {
  const r = await fetch(`${API}/memories/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { memory?: Memory };
  return j.memory || null;
}

export async function apiDeleteMemory(id: string): Promise<boolean> {
  const r = await fetch(`${API}/memories/${id}`, { method: "DELETE", headers: headers() });
  return r.ok;
}

// ----- search across local cache (for sidebar) ---------------------------

/** Lightweight in-memory token search across cached conversations. */
export function filterConversationsByQuery(
  convs: ConversationMeta[],
  query: string,
  byId: Map<string, StoredMessage[]>,
): ConversationMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return convs;
  return convs.filter((c) => {
    if (c.title.toLowerCase().includes(q)) return true;
    const msgs = byId.get(c.id) || [];
    for (const m of msgs) {
      if (m.content && m.content.toLowerCase().includes(q)) return true;
    }
    return false;
  });
}

/** Group conversations by recency bucket for the sidebar. */
export interface Groupable {
  id: string;
  title: string;
  lastMessageAt?: number;
  updatedAt?: string | number;
  status?: "active" | "archived";
}

export function groupConversations<T extends Groupable>(
  convs: T[],
): Array<{ label: string; items: T[] }> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const today: T[] = [];
  const yesterday: T[] = [];
  const previous7: T[] = [];
  const older: T[] = [];
  for (const c of convs) {
    if (c.status === "archived") continue;
    const ts = c.lastMessageAt || (typeof c.updatedAt === "number" ? c.updatedAt : c.updatedAt ? new Date(c.updatedAt).getTime() : 0);
    const age = now - ts;
    if (age < day) today.push(c);
    else if (age < 2 * day) yesterday.push(c);
    else if (age < 7 * day) previous7.push(c);
    else older.push(c);
  }
  const groups: Array<{ label: string; items: T[] }> = [];
  if (today.length) groups.push({ label: "Today", items: today });
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday });
  if (previous7.length) groups.push({ label: "Previous 7 days", items: previous7 });
  if (older.length) groups.push({ label: "Older", items: older });
  return groups;
}

// ----- memory retrieval --------------------------------------------------

/**
 * Lightweight relevance score: number of overlapping tokens, plus a boost
 * when the key or category matches the query tokens. No embedding server
 * dependency; runs on the client over an already-paginated memory list.
 */
export function rankMemories(
  memories: Memory[],
  query: string,
  limit = 8,
): Memory[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    // No query: return most recently updated, scoped to project + global only.
    return memories.filter((m) => m.scope !== "session").slice(0, limit);
  }
  const tokens = new Set(q.split(/\W+/).filter((t) => t.length > 2));
  const scored = memories
    .filter((m) => m.scope !== "session")
    .map((m) => {
      const hay = `${m.key} ${m.value} ${m.category}`.toLowerCase();
      let score = 0;
      for (const t of tokens) if (hay.includes(t)) score += 1;
      if (m.scope === "project") score += 0.3;
      if (m.scope === "global") score += 0.1;
      score += m.confidence * 0.4;
      return { m, score };
    })
    .filter((x) => x.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m);
  return scored;
}

export function memoryToPromptLines(memories: Memory[]): string {
  if (memories.length === 0) return "";
  return memories
    .map((m) => {
      const scope = m.scope === "global" ? "global" : m.projectId ? `project(${m.projectId})` : "session";
      return `- [${m.category} • ${scope}] ${m.key}: ${m.value}`;
    })
    .join("\n");
}
