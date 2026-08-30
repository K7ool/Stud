/**
 * Chat state store.
 *
 * Backed by the persistent server API (api/chat/*) and mirrored to
 * localStorage for instant cold-start. Streaming/pending state is held in
 * memory only and is intentionally NOT persisted.
 *
 * - hydrateFromServer() runs on app start to fetch the full conversation
 *   list and any in-flight conversation messages from the server.
 * - Persist writes are throttled (1.5s) and flushed on pagehide. The
 *   "currentSessionId" and "sessions[]" are written to localStorage
 *   immediately so the sidebar paints instantly on reload.
 * - The first message in a conversation triggers an async title-generation
 *   call that does not block the response stream.
 */

import { create } from "zustand";
import {
  apiAppendMessages,
  apiCreateConversation,
  apiDeleteConversation,
  apiGetMessages,
  apiListConversations,
  apiPatchConversation,
  apiSetMessages,
  getClientUserId,
  type StoredMessage as ServerMessage,
} from "@/lib/chat/api";

const STORAGE_KEY = "stud-chat-storage";
const PROJECT_ID_DEFAULT = "default";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "running" | "complete" | "error" | "waiting";
  error?: string;
  duration?: number; // duration in ms
  requestId?: string;
}

export interface ExecutionIssue {
  stepId?: string;
  message: string;
  reason?: string;
  retryable?: boolean;
  target?: string;
}

export interface ExecutionResult {
  taskId?: string;
  status: "completed" | "partial" | "failed" | "blocked" | "cancelled" | "in_progress";
  title: string;
  summary: string;
  progress?: {
    completed: number;
    total: number;
  };
  changes?: string[];
  verification?: string[];
  issues?: ExecutionIssue[];
  nextAction?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  executionResult?: ExecutionResult;
  contextChips?: string[];
  attachments?: Attachment[];
  createdAt: Date;
}

export interface QuestionOption {
  label: string;
  value?: string;
  imageUrl?: string;
  description?: string;
}

export interface Question {
  question: string;
  options?: (string | QuestionOption)[];
  type: "single" | "multi" | "text";
}

export interface PendingQuestion {
  id: string;
  toolCallId: string;
  messageId: string;
  questions: Question[];
  answers?: (string | string[])[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: number;
  status?: "active" | "archived";
}

export interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  isStreaming: boolean;
  error: string | null;
  pendingQuestion: PendingQuestion | null;
  questionResolver: ((answers: (string | string[])[]) => void) | null;
  pendingAttachments: Attachment[];
  hydrated: boolean;

  createSession: (title?: string, options?: { projectId?: string }) => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  archiveSession: (id: string) => void;
  getCurrentMessages: () => Message[];
  addMessage: (message: Omit<Message, "id" | "createdAt">) => string;
  updateMessage: (id: string, content: string) => void;
  addToolCall: (messageId: string, toolCall: Omit<ToolCall, "status">) => void;
  updateToolCall: (messageId: string, toolCallId: string, update: Partial<ToolCall>) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  addAttachment: (attachment: Omit<Attachment, "id">) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  setPendingQuestion: (question: PendingQuestion | null) => void;
  setQuestionResolver: (resolver: ((answers: (string | string[])[]) => void) | null) => void;
  answerQuestion: (answers: (string | string[])[]) => void;
  hydrateFromServer: () => Promise<void>;
}

interface PersistedShape {
  sessions: ChatSession[];
  currentSessionId: string | null;
}

function readPersisted(): PersistedShape | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sessions)) return null;
    return { sessions: parsed.sessions, currentSessionId: parsed.currentSessionId || null };
  } catch {
    return null;
  }
}

function writePersisted(value: PersistedShape) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

// ---- persistence throttling ----------------------------------------------

const PERSIST_DEBOUNCE_MS = 1_500;
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function schedulePersist(sessions: ChatSession[], currentSessionId: string | null) {
  if (typeof window === "undefined") return;
  for (const t of persistTimers.values()) clearTimeout(t);
  persistTimers.clear();
  const t = setTimeout(() => {
    writePersisted({ sessions, currentSessionId });
    persistTimers.delete("__all__");
  }, PERSIST_DEBOUNCE_MS);
  persistTimers.set("__all__", t);
}

function flushPersist() {
  for (const t of persistTimers.values()) clearTimeout(t);
  persistTimers.clear();
  const persisted = useChatStore.getState();
  writePersisted({ sessions: persisted.sessions, currentSessionId: persisted.currentSessionId });
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPersist);
  window.addEventListener("beforeunload", flushPersist);
}

// ---- server sync ----------------------------------------------------------

const serverFlushQueue = new Map<string, ReturnType<typeof setTimeout>>();
const SERVER_DEBOUNCE_MS = 800;

function scheduleServerSync(kind: "all" | "append" | "meta", sessionId: string) {
  const key = `${kind}:${sessionId}`;
  if (serverFlushQueue.has(key)) clearTimeout(serverFlushQueue.get(key)!);
  const t = setTimeout(async () => {
    serverFlushQueue.delete(key);
    await syncNow(kind, sessionId);
  }, SERVER_DEBOUNCE_MS);
  serverFlushQueue.set(key, t);
}

async function syncNow(kind: "all" | "append" | "meta", sessionId: string) {
  const state = useChatStore.getState();
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  try {
    if (kind === "meta") {
      await apiPatchConversation(sessionId, {
        title: session.title,
        status: session.status,
      });
      return;
    }
    const messages = toServerMessages(session);
    if (kind === "all") {
      await apiSetMessages(sessionId, messages);
    } else {
      await apiAppendMessages(sessionId, messages);
    }
    await apiPatchConversation(sessionId, {
      title: session.title,
      status: session.status,
    });
  } catch {
    // best-effort: local cache still works; next sync will retry
  }
}

function toServerMessages(session: ChatSession): ServerMessage[] {
  return session.messages.map((m) => ({
    id: m.id,
    conversationId: session.id,
    role: m.role as ServerMessage["role"],
    content: m.content,
    toolCalls: m.toolCalls?.map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: tc.args,
      result: tc.result,
      status: tc.status,
      error: tc.error,
    })),
    createdAt: m.createdAt instanceof Date ? m.createdAt.getTime() : new Date(m.createdAt).getTime(),
  }));
}

function fromServerMessage(m: ServerMessage): Message {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    toolCalls: m.toolCalls?.map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: (tc.args ?? {}) as Record<string, unknown>,
      result: tc.result,
      status: tc.status as ToolCall["status"],
      error: tc.error,
    })),
    createdAt: new Date(m.createdAt),
  };
}

// ---- store ---------------------------------------------------------------

const persisted = readPersisted();

export const useChatStore = create<ChatState>()((set, get) => ({
  sessions: persisted?.sessions || [],
  currentSessionId: persisted?.currentSessionId || null,
  isStreaming: false,
  error: null,
  pendingQuestion: null,
  questionResolver: null,
  pendingAttachments: [],
  hydrated: false,

  createSession: (title, options) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    // Default to the current Studio siteId (one project per bridge). Falls
    // back to a stable "default" project for environments without a bridge.
    let projectId = options?.projectId;
    if (!projectId) {
      try {
        if (typeof localStorage !== "undefined") {
          const site = localStorage.getItem("stud:siteId");
          if (site) projectId = site;
        }
      } catch {}
      if (!projectId) projectId = PROJECT_ID_DEFAULT;
    }
    const sessionTitle = title || "New chat";
    const newSession: ChatSession = {
      id,
      title: sessionTitle,
      messages: [],
      createdAt: now,
      updatedAt: now,
      lastMessageAt: Date.now(),
      status: "active",
    };
    set((state) => ({
      sessions: [newSession, ...state.sessions],
      currentSessionId: id,
      pendingAttachments: [],
    }));
    schedulePersist(get().sessions, get().currentSessionId);
    // Best-effort server create. Failure is non-fatal (offline / no KV).
    apiCreateConversation(id, projectId, sessionTitle).catch(() => {});
    return id;
  },

  switchSession: (id) => {
    if (get().sessions.find((s) => s.id === id)) {
      set({ currentSessionId: id, pendingAttachments: [] });
      schedulePersist(get().sessions, get().currentSessionId);
    }
  },

  deleteSession: (id) => {
    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== id);
      let newCurrentId = state.currentSessionId;
      if (state.currentSessionId === id) {
        newCurrentId = newSessions.length > 0 ? newSessions[0].id : null;
      }
      return { sessions: newSessions, currentSessionId: newCurrentId };
    });
    schedulePersist(get().sessions, get().currentSessionId);
    apiDeleteConversation(id).catch(() => {});
  },

  updateSessionTitle: (id, title) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, title, updatedAt: new Date().toISOString() } : s
      ),
    }));
    schedulePersist(get().sessions, get().currentSessionId);
    scheduleServerSync("meta", id);
  },

  archiveSession: (id) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, status: "archived" as const, updatedAt: new Date().toISOString() } : s
      ),
    }));
    schedulePersist(get().sessions, get().currentSessionId);
    scheduleServerSync("meta", id);
  },

  getCurrentMessages: () => {
    const { sessions, currentSessionId } = get();
    return sessions.find((s) => s.id === currentSessionId)?.messages || [];
  },

  addMessage: (message) => {
    const id = crypto.randomUUID();
    if (!get().currentSessionId) {
      get().createSession();
    }
    let sessionId = "";
    set((state) => {
      const now = new Date().toISOString();
      const { pendingAttachments } = state;
      const cid = state.currentSessionId!;
      sessionId = cid;
      return {
        sessions: state.sessions.map((session) =>
          session.id === cid
            ? {
                ...session,
                messages: [
                  ...session.messages,
                  {
                    ...message,
                    id,
                    createdAt: new Date(),
                    attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
                  },
                ],
                updatedAt: now,
                lastMessageAt: Date.now(),
              }
            : session
        ),
        pendingAttachments: [],
      };
    });
    schedulePersist(get().sessions, get().currentSessionId);
    if (sessionId) scheduleServerSync("append", sessionId);
    return id;
  },

  updateMessage: (id, content) => {
    let sessionId = "";
    set((state) => {
      const now = new Date().toISOString();
      sessionId = state.currentSessionId || "";
      return {
        sessions: state.sessions.map((session) =>
          session.id === state.currentSessionId
            ? {
                ...session,
                messages: session.messages.map((msg) =>
                  msg.id === id ? { ...msg, content } : msg
                ),
                updatedAt: now,
              }
            : session
        ),
      };
    });
    schedulePersist(get().sessions, get().currentSessionId);
    if (sessionId) scheduleServerSync("all", sessionId);
  },

  addToolCall: (messageId, toolCall) => {
    // Tool-call mutations only affect in-memory state. We do NOT save on every
    // tool call; the "complete" event coalesces a full message save instead.
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === state.currentSessionId
          ? {
              ...session,
              messages: session.messages.map((msg) =>
                msg.id === messageId
                  ? {
                      ...msg,
                      toolCalls: [
                        ...(msg.toolCalls || []),
                        { ...toolCall, status: "pending" as const },
                      ],
                    }
                  : msg
              ),
            }
          : session
      ),
    }));
  },

  updateToolCall: (messageId, toolCallId, update) => {
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === state.currentSessionId
          ? {
              ...session,
              messages: session.messages.map((msg) =>
                msg.id === messageId
                  ? {
                      ...msg,
                      toolCalls: msg.toolCalls?.map((tc) =>
                        tc.id === toolCallId ? { ...tc, ...update } : tc
                      ),
                    }
                  : msg
              ),
            }
          : session
      ),
    }));
  },

  setStreaming: (streaming) => {
    set({ isStreaming: streaming });
    if (!streaming) {
      // Stream finished: persist the current session in full.
      const cid = get().currentSessionId;
      if (cid) scheduleServerSync("all", cid);
    }
  },

  setError: (error) => set({ error }),

  clearMessages: () => {
    let sessionId = "";
    set((state) => {
      sessionId = state.currentSessionId || "";
      return {
        sessions: state.sessions.map((session) =>
          session.id === state.currentSessionId
            ? { ...session, messages: [], updatedAt: new Date().toISOString(), lastMessageAt: Date.now() }
            : session
        ),
        pendingAttachments: [],
      };
    });
    schedulePersist(get().sessions, get().currentSessionId);
    if (sessionId) scheduleServerSync("all", sessionId);
  },

  addAttachment: (attachment) =>
    set((state) => ({
      pendingAttachments: [
        ...state.pendingAttachments,
        { ...attachment, id: crypto.randomUUID() },
      ],
    })),

  removeAttachment: (id) =>
    set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((a) => a.id !== id),
    })),

  clearAttachments: () => set({ pendingAttachments: [] }),

  setPendingQuestion: (question) => set({ pendingQuestion: question }),
  setQuestionResolver: (resolver) => set({ questionResolver: resolver }),

  answerQuestion: (answers) => {
    const { questionResolver, pendingQuestion } = get();
    if (questionResolver && pendingQuestion) {
      questionResolver(answers);
      set({ pendingQuestion: null, questionResolver: null });
    }
  },

  hydrateFromServer: async () => {
    if (typeof window === "undefined") return;
    if (get().hydrated) return;
    const uid = getClientUserId();
    if (!uid || uid === "ssr") {
      set({ hydrated: true });
      return;
    }
    try {
      const list = await apiListConversations();
      // Merge with any local-only sessions (e.g. just-created in this tab).
      const local = get().sessions;
      const localById = new Map(local.map((s) => [s.id, s]));
      const merged: ChatSession[] = list.map((c) => {
        const localSession = localById.get(c.id);
        if (localSession) {
          // Prefer the local copy (it has the latest in-progress messages).
          return {
            ...localSession,
            title: c.title,
            lastMessageAt: c.lastMessageAt,
            status: c.status,
          };
        }
        return {
          id: c.id,
          title: c.title,
          messages: [],
          createdAt: new Date(c.createdAt).toISOString(),
          updatedAt: new Date(c.updatedAt).toISOString(),
          lastMessageAt: c.lastMessageAt,
          status: c.status,
        };
      });
      // Add any local-only sessions the server doesn't know about yet.
      for (const s of local) {
        if (!list.find((c) => c.id === s.id)) merged.unshift(s);
      }
      merged.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

      // Eagerly load the most recent active conversation's messages if we
      // don't already have them locally (cold-start restore).
      const needsLoad = merged.filter((s) => s.messages.length === 0).slice(0, 5);
      await Promise.all(
        needsLoad.map(async (s) => {
          const msgs = await apiGetMessages(s.id);
          if (msgs.length > 0) s.messages = msgs.map(fromServerMessage);
        })
      );

      set({ sessions: merged, hydrated: true });
      schedulePersist(merged, get().currentSessionId);
    } catch {
      set({ hydrated: true });
    }
  },
}));
