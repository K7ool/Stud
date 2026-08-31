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
  taskList: (uid: string) => `chat:tasklist:${uid}`,
  task: (uid: string, id: string) => `chat:task:${uid}:${id}`,
};

const CONV_TTL = 60 * 60 * 24 * 30;
const MSG_TTL = 60 * 60 * 24 * 30;
const MEM_TTL = 60 * 60 * 24 * 90;
const TASK_TTL = 60 * 60 * 24 * 14;

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

// ----- tasks / queue ------------------------------------------------------

export type TaskStatus =
  | "pending"      // queued, not yet started
  | "running"      // actively executing
  | "paused"       // user paused; safe to resume
  | "completed"
  | "failed"
  | "cancelled"
  | "needs_resume";// was running when the page closed / connection dropped

export type TaskPriority = "high" | "normal" | "low";
export type TaskMode = "instant" | "auto" | "plan";
export type TaskEffort = "low" | "medium" | "high";
export type StepStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "skipped";

export interface TaskStep {
  id: string;
  title: string;
  status: StepStatus;
  order: number;
  dependsOn: string[]; // step ids
  startedAt?: number;
  completedAt?: number;
  error?: string;
  result?: string; // short summary, e.g. "Created PetService ModuleScript"
}

export interface Task {
  id: string;
  userId: string;
  projectId: string;
  conversationId: string;
  title: string;
  prompt: string; // original user message
  status: TaskStatus;
  priority: TaskPriority;
  mode: TaskMode;
  effort: TaskEffort;
  // queue ordering: the position within the user-scoped queue
  queuePosition: number;
  // progress
  progress: number; // 0..1
  currentStep: string; // step id currently active, or ""
  steps: TaskStep[];
  // timestamps
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  // results
  result?: {
    summary: string;
    filesChanged: string[];
    toolsUsed: string[];
    verification: string;
    duration: number;
  };
  error?: string;
  retryCount: number;
}

export async function listTasks(userId: string): Promise<Task[]> {
  const ids = (await cacheGet<string[]>(k.taskList(userId))) || [];
  const out: Task[] = [];
  for (const id of ids) {
    const t = await cacheGet<Task>(k.task(userId, id));
    if (t) out.push(t);
  }
  return out.sort((a, b) => a.queuePosition - b.queuePosition);
}

export async function getTask(userId: string, id: string): Promise<Task | null> {
  return cacheGet<Task>(k.task(userId, id));
}

async function saveTask(task: Task): Promise<void> {
  task.updatedAt = now();
  await cacheSet(k.task(task.userId, task.id), task, TASK_TTL);
  const ids = (await cacheGet<string[]>(k.taskList(task.userId))) || [];
  if (!ids.includes(task.id)) {
    // Insert sorted by queuePosition (smaller first).
    const next = [...ids, task.id];
    next.sort((a, b) => 0); // we re-sort by reloading below
    await cacheSet(k.taskList(task.userId), next.slice(-500), TASK_TTL);
  }
}

async function removeTaskFromIndex(userId: string, id: string): Promise<void> {
  const ids = (await cacheGet<string[]>(k.taskList(userId))) || [];
  const next = ids.filter((x) => x !== id);
  await cacheSet(k.taskList(userId), next, TASK_TTL);
}

export async function createTask(
  userId: string,
  partial: Omit<
    Task,
    "updatedAt" | "queuePosition" | "progress" | "currentStep" | "steps" | "retryCount"
  > & {
    steps?: TaskStep[];
  },
): Promise<Task> {
  const existing = (await cacheGet<string[]>(k.taskList(userId))) || [];
  const maxPos = await listTasks(userId).then((all) =>
    all.length ? Math.max(...all.map((t) => t.queuePosition)) : 0
  );
  const task: Task = {
    id: partial.id,
    userId,
    projectId: partial.projectId,
    conversationId: partial.conversationId,
    title: partial.title,
    prompt: partial.prompt,
    status: partial.status,
    priority: partial.priority,
    mode: partial.mode,
    effort: partial.effort,
    queuePosition: partial.priority === "high" ? maxPos + 0.5 : maxPos + 1,
    progress: 0,
    currentStep: "",
    steps: partial.steps || [],
    createdAt: partial.createdAt,
    updatedAt: now(),
    startedAt: partial.startedAt,
    completedAt: partial.completedAt,
    result: partial.result,
    error: partial.error,
    retryCount: 0,
  };
  await saveTask(task);
  if (!existing.includes(task.id)) {
    const next = [...existing, task.id];
    await cacheSet(k.taskList(userId), next.slice(-500), TASK_TTL);
  }
  return task;
}

export async function patchTask(
  userId: string,
  id: string,
  patch: Partial<Task>,
): Promise<Task | null> {
  const cur = await getTask(userId, id);
  if (!cur) return null;
  const next: Task = { ...cur, ...patch, updatedAt: now() };
  await saveTask(next);
  return next;
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  await cacheDel(k.task(userId, id));
  await removeTaskFromIndex(userId, id);
}

/** Re-number the queue so positions are dense 1..N based on priority + creation. */
export async function reorderQueue(userId: string): Promise<Task[]> {
  const tasks = await listTasks(userId);
  tasks.sort((a, b) => {
    const order: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };
    const pa = order[a.priority];
    const pb = order[b.priority];
    if (pa !== pb) return pa - pb;
    return a.createdAt - b.createdAt;
  });
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].queuePosition !== i + 1) {
      tasks[i] = { ...tasks[i], queuePosition: i + 1, updatedAt: now() };
      await cacheSet(k.task(userId, tasks[i].id), tasks[i], TASK_TTL);
    }
  }
  return tasks;
}

export async function getRunningAndQueued(userId: string): Promise<Task[]> {
  const all = await listTasks(userId);
  return all.filter(
    (t) =>
      t.status === "pending" ||
      t.status === "running" ||
      t.status === "paused" ||
      t.status === "needs_resume"
  );
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
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required. Provide a valid X-User-Id or ?uid=.",
        retryable: false,
      },
    }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }
  );
}
