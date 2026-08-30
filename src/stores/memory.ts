/**
 * Persistent memory store.
 *
 * Memory is structured (scoped, categorized) and stored in the server.
 * This store caches the list in memory and provides relevance-ranked
 * retrieval for the AI to consume.
 */

import { create } from "zustand";
import {
  apiCreateMemory,
  apiDeleteMemory,
  apiListMemories,
  apiPatchMemory,
  memoryToPromptLines,
  rankMemories,
  type Memory,
  type MemoryCategory,
  type MemoryScope,
} from "@/lib/chat/api";

const STORAGE_KEY = "stud-mem-cache";

interface PersistedShape {
  memories: Memory[];
}

function readPersisted(): PersistedShape | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.memories)) return null;
    return { memories: parsed.memories };
  } catch {
    return null;
  }
}

function writePersisted(value: PersistedShape) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export interface MemoryState {
  memories: Memory[];
  hydrated: boolean;
  hydratedAt: number;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  addMemory: (input: {
    scope: MemoryScope;
    category: MemoryCategory;
    key: string;
    value: string;
    confidence?: number;
    projectId?: string | null;
    sourceConversationId?: string;
  }) => Promise<Memory | null>;
  updateMemory: (id: string, patch: Partial<Pick<Memory, "value" | "confidence" | "scope" | "category" | "key">>) => Promise<void>;
  removeMemory: (id: string) => Promise<void>;
  forgetAll: () => Promise<void>;
  relevantFor: (query: string, limit?: number) => Memory[];
  toPromptLines: (memories: Memory[]) => string;
}

const persisted = readPersisted();

export const useMemoryStore = create<MemoryState>()((set, get) => ({
  memories: persisted?.memories || [],
  hydrated: false,
  hydratedAt: 0,

  hydrate: async () => {
    if (get().hydrated && Date.now() - get().hydratedAt < 30_000) return;
    await get().refresh();
  },

  refresh: async () => {
    try {
      const memories = await apiListMemories();
      set({ memories, hydrated: true, hydratedAt: Date.now() });
      writePersisted({ memories });
    } catch {
      set({ hydrated: true, hydratedAt: Date.now() });
    }
  },

  addMemory: async (input) => {
    const created = await apiCreateMemory(input);
    if (created) {
      set((state) => ({ memories: [created, ...state.memories] }));
      writePersisted({ memories: get().memories });
    }
    return created;
  },

  updateMemory: async (id, patch) => {
    const updated = await apiPatchMemory(id, patch);
    if (updated) {
      set((state) => ({ memories: state.memories.map((m) => (m.id === id ? updated : m)) }));
      writePersisted({ memories: get().memories });
    }
  },

  removeMemory: async (id) => {
    await apiDeleteMemory(id);
    set((state) => ({ memories: state.memories.filter((m) => m.id !== id) }));
    writePersisted({ memories: get().memories });
  },

  forgetAll: async () => {
    const all = get().memories.slice();
    await Promise.all(all.map((m) => apiDeleteMemory(m.id).catch(() => {})));
    set({ memories: [] });
    writePersisted({ memories: [] });
  },

  relevantFor: (query, limit = 6) => {
    return rankMemories(get().memories, query, limit);
  },

  toPromptLines: (memories) => memoryToPromptLines(memories),
}));

/**
 * Best-effort extraction: ask the AI to extract durable memories from the
 * latest exchange, then post them to the server. This is intentionally
 * non-blocking and never awaits before the user response continues.
 *
 * Implementation is in src/lib/ai/memory-extract.ts (calls providers)
 * — see that file for the actual LLM call. This store just records the
 * result and keeps the local cache fresh.
 */
export async function maybeExtractMemories(args: {
  userMessage: string;
  assistantMessage: string;
  conversationId: string;
  projectId?: string | null;
  runExtractor: (args: { userMessage: string; assistantMessage: string }) => Promise<Array<{
    scope: MemoryScope;
    category: MemoryCategory;
    key: string;
    value: string;
    confidence: number;
  }> | null>;
}) {
  try {
    const out = await args.runExtractor({
      userMessage: args.userMessage,
      assistantMessage: args.assistantMessage,
    });
    if (!out || out.length === 0) return;
    for (const m of out.slice(0, 3)) {
      await useMemoryStore.getState().addMemory({
        scope: m.scope,
        category: m.category,
        key: m.key,
        value: m.value,
        confidence: m.confidence,
        projectId: m.scope === "project" ? args.projectId || "default" : null,
        sourceConversationId: args.conversationId,
      });
    }
  } catch {
    /* best-effort; never block the user */
  }
}
