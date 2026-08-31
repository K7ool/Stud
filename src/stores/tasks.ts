/**
 * Task + queue store.
 *
 * Persists to the server (api/chat/tasks) and mirrors in memory for instant
 * UI updates. The store is the single source of truth for what the user sees
 * in the TaskPanel.
 *
 * Important invariants:
 *   - Only ONE task can be `running` at a time.
 *   - `running` is automatically marked `needs_resume` when the page unloads.
 *   - On hydrate, the UI re-prompts the user to resume any `needs_resume`.
 */

import { create } from "zustand";
import {
  apiCreateTask,
  apiDeleteTask,
  apiListActiveTasks,
  apiListTasks,
  apiPatchTask,
  apiReorderQueue,
  apiTaskAction,
  type Task,
  type TaskEffort,
  type TaskMode,
  type TaskPriority,
  type TaskStatus,
  type TaskStep,
} from "@/lib/chat/api";

/** User-facing effort setting; allows "auto" so the agent picks based on the task. */
export type UserEffort = TaskEffort | "auto";

export interface TaskQueueSettings {
  mode: TaskMode; // user override
  effort: UserEffort; // user override
  autoQueue: boolean; // when busy, auto-queue new explicit action requests
}

export interface TaskState {
  tasks: Task[];
  hydrated: boolean;
  settings: TaskQueueSettings;

  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshActive: () => Promise<void>;

  enqueue: (
    input: Omit<Task, "userId" | "queuePosition" | "progress" | "currentStep" | "steps" | "retryCount" | "updatedAt" | "status"> & {
      steps?: TaskStep[];
      status?: TaskStatus;
    }
  ) => Promise<Task | null>;

  patch: (id: string, patch: Partial<Task>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setStatus: (id: string, status: TaskStatus, opts?: { error?: string }) => Promise<void>;
  startStep: (taskId: string, stepId: string) => Promise<void>;
  completeStep: (taskId: string, stepId: string, result?: string) => Promise<void>;
  failStep: (taskId: string, stepId: string, error: string) => Promise<void>;
  setProgress: (taskId: string, progress: number, currentStep?: string) => Promise<void>;
  reorder: () => Promise<void>;
  cancel: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  startTask: (id: string) => Promise<void>;

  // Settings
  setMode: (mode: TaskMode) => void;
  setEffort: (effort: UserEffort) => void;
  setAutoQueue: (v: boolean) => void;

  // Selectors
  currentTask: () => Task | null;
  queue: () => Task[];
  history: () => Task[];
  isBusy: () => boolean;
}

const STORAGE_KEY = "stud-task-settings";
const PERSIST_KEY = "stud-task-cache";

/**
 * Single task runner. The chat UI registers a function that knows how to
 * actually execute a task (stream a prompt, mark the task done, etc.). The
 * store invokes it whenever a task is started via `startTask` or the auto
 * queue — this keeps "flip status to running" and "actually run the chat" in
 * one place, so the Tasks panel, "continue" keywords and auto-advance all
 * behave the same way.
 */
type TaskRunner = (taskId: string) => void | Promise<void>;
let _taskRunner: TaskRunner | null = null;
export function registerTaskRunner(fn: TaskRunner | null): void {
  _taskRunner = fn;
}

function readSettings(): TaskQueueSettings {
  if (typeof localStorage === "undefined")
    return { mode: "auto", effort: "auto", autoQueue: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: "auto", effort: "auto", autoQueue: true };
    const j = JSON.parse(raw);
    return {
      mode: j.mode || "auto",
      effort: j.effort || "auto",
      autoQueue: j.autoQueue !== false,
    };
  } catch {
    return { mode: "auto", effort: "auto", autoQueue: true };
  }
}

function writeSettings(s: TaskQueueSettings) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function readCache(): Task[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw);
    return Array.isArray(j.tasks) ? j.tasks : [];
  } catch {
    return [];
  }
}

function writeCache(tasks: Task[]) {
  if (typeof localStorage === "undefined") return;
  try {
    // Cap cache to last 100 tasks for size
    const capped = tasks.slice(0, 100);
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ tasks: capped }));
  } catch {
    /* ignore */
  }
}

function updateLocal(set: (partial: Partial<TaskState>) => void, get: () => TaskState, updated: Task) {
  const tasks = get().tasks.map((t) => (t.id === updated.id ? updated : t));
  set({ tasks });
  writeCache(tasks);
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: readCache(),
  hydrated: false,
  settings: readSettings(),

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const list = await apiListTasks();
      // Merge server list with local-only tasks.
      const local = get().tasks;
      const localById = new Map(local.map((t) => [t.id, t]));
      const merged: Task[] = list.map((srv) => {
        const l = localById.get(srv.id);
        if (!l) return srv;
        return l.updatedAt >= srv.updatedAt ? l : srv;
      });
      for (const l of local) {
        if (!list.find((s) => s.id === l.id)) merged.unshift(l);
      }
      merged.sort((a, b) => a.queuePosition - b.queuePosition);
      set({ tasks: merged, hydrated: true });
      writeCache(merged);
    } catch {
      set({ hydrated: true });
    }
  },

  refresh: async () => {
    try {
      const list = await apiListTasks();
      set({ tasks: list });
      writeCache(list);
    } catch {
      /* keep local */
    }
  },

  refreshActive: async () => {
    try {
      const active = await apiListActiveTasks();
      const byId = new Map(get().tasks.map((t) => [t.id, t]));
      for (const t of active) byId.set(t.id, t);
      const all = Array.from(byId.values()).sort((a, b) => a.queuePosition - b.queuePosition);
      set({ tasks: all });
      writeCache(all);
    } catch {
      /* keep local */
    }
  },

  enqueue: async (input) => {
    const task = await apiCreateTask({
      ...input,
      status: input.status || "pending",
    });
    if (task) {
      set((s) => ({ tasks: [...s.tasks.filter((t) => t.id !== task.id), task] }));
      writeCache(get().tasks);
    }
    return task;
  },

  patch: async (id, patch) => {
    const next = { ...get().tasks.find((t) => t.id === id), ...patch, updatedAt: Date.now() } as Task;
    // optimistic local update
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)) }));
    writeCache(get().tasks);
    const server = await apiPatchTask(id, patch);
    if (server) updateLocal(set, get, server);
  },

  remove: async (id) => {
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    writeCache(get().tasks);
    await apiDeleteTask(id).catch(() => {});
  },

  setStatus: async (id, status, opts) => {
    const patch: Partial<Task> = { status };
    if (status === "running") patch.startedAt = Date.now();
    if (status === "completed" || status === "failed" || status === "cancelled") {
      patch.completedAt = Date.now();
      if (status === "completed") patch.progress = 1;
    }
    if (opts?.error) patch.error = opts.error;
    // optimistic
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t
      ),
    }));
    writeCache(get().tasks);
    const updated = await apiPatchTask(id, patch);
    if (updated) updateLocal(set, get, updated);
  },

  startStep: async (taskId, stepId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;
    const steps = task.steps.map((s) =>
      s.id === stepId ? { ...s, status: "in_progress" as const, startedAt: Date.now() } : s
    );
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, steps, currentStep: stepId } : t)),
    }));
    writeCache(get().tasks);
    const updated = await apiPatchTask(taskId, { steps, currentStep: stepId });
    if (updated) updateLocal(set, get, updated);
  },

  completeStep: async (taskId, stepId, result) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;
    const steps = task.steps.map((s) =>
      s.id === stepId
        ? { ...s, status: "completed" as const, completedAt: Date.now(), result }
        : s
    );
    const completed = steps.filter((s) => s.status === "completed").length;
    const total = steps.length || 1;
    const progress = Math.min(1, completed / total);
    const stillInProgress = steps.find((s) => s.status === "in_progress");
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, steps, progress, currentStep: stillInProgress ? stillInProgress.id : "" }
          : t
      ),
    }));
    writeCache(get().tasks);
    const updated = await apiPatchTask(taskId, { steps, progress, currentStep: stillInProgress ? stillInProgress.id : "" });
    if (updated) updateLocal(set, get, updated);
  },

  failStep: async (taskId, stepId, error) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;
    const steps = task.steps.map((s) =>
      s.id === stepId ? { ...s, status: "failed" as const, completedAt: Date.now(), error } : s
    );
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, steps, error } : t)),
    }));
    writeCache(get().tasks);
    const updated = await apiPatchTask(taskId, { steps, error });
    if (updated) updateLocal(set, get, updated);
  },

  setProgress: async (taskId, progress, currentStep) => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, progress, currentStep: currentStep !== undefined ? currentStep : t.currentStep, updatedAt: Date.now() }
          : t
      ),
    }));
    writeCache(get().tasks);
    const updated = await apiPatchTask(taskId, { progress, currentStep });
    if (updated) updateLocal(set, get, updated);
  },

  reorder: async () => {
    const list = await apiReorderQueue();
    set({ tasks: list });
    writeCache(list);
  },

  cancel: async (id) => {
    const updated = await apiTaskAction(id, "cancel", "Cancelled by user");
    if (updated) updateLocal(set, get, updated);
    else {
      // optimistic
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, status: "cancelled" as const, completedAt: Date.now() } : t
        ),
      }));
      writeCache(get().tasks);
    }
  },

  retry: async (id) => {
    const updated = await apiTaskAction(id, "retry");
    if (updated) updateLocal(set, get, updated);
  },

  // Flip a pending/paused/needs_resume task to running AND invoke the
  // registered runner so the chat actually streams. This is the single entry
  // point used by the Tasks panel, the "continue" chat keyword, and any
  // future "Run now" affordance. Without this, status flips to "running" but
  // the chat never starts — which is why the old panel button felt dead.
  startTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    // Refuse to start a second concurrent task; auto-advance will pick it up.
    if (get().isBusy() && task.status !== "running") return;
    if (task.status === "running") {
      // Already running — just make sure the runner is alive (idempotent).
      if (_taskRunner) void _taskRunner(id);
      return;
    }
    // Optimistically flip to running so the UI updates immediately.
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, status: "running" as const, startedAt: t.startedAt || Date.now(), updatedAt: Date.now() } : t
      ),
    }));
    writeCache(get().tasks);
    try {
      await apiPatchTask(id, { status: "running" });
    } catch {
      /* best-effort */
    }
    if (_taskRunner) void _taskRunner(id);
  },

  setMode: (mode) => {
    set((s) => ({ settings: { ...s.settings, mode } }));
    writeSettings(get().settings);
  },
  setEffort: (effort) => {
    set((s) => ({ settings: { ...s.settings, effort } }));
    writeSettings(get().settings);
  },
  setAutoQueue: (v) => {
    set((s) => ({ settings: { ...s.settings, autoQueue: v } }));
    writeSettings(get().settings);
  },

  currentTask: () => {
    const running = get().tasks.find((t) => t.status === "running");
    if (running) return running;
    const next = get().tasks
      .filter((t) => t.status === "pending" || t.status === "needs_resume")
      .sort((a, b) => {
        const order: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };
        const pa = order[a.priority];
        const pb = order[b.priority];
        if (pa !== pb) return pa - pb;
        return a.queuePosition - b.queuePosition;
      })[0];
    return next || null;
  },
  queue: () =>
    get()
      .tasks.filter(
        (t) =>
          t.status === "pending" ||
          t.status === "paused" ||
          t.status === "needs_resume"
      )
      .sort((a, b) => a.queuePosition - b.queuePosition),
  history: () =>
    get()
      .tasks.filter(
        (t) =>
          t.status === "completed" ||
          t.status === "failed" ||
          t.status === "cancelled"
      )
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
      .slice(0, 30),
  isBusy: () => !!get().tasks.find((t) => t.status === "running"),
}));

/**
 * Wire page-unload safety: any running task is marked `needs_resume` so the
 * next visit can ask the user to continue.
 */
if (typeof window !== "undefined") {
  const onUnload = () => {
    const state = useTaskStore.getState();
    const running = state.tasks.find((t) => t.status === "running");
    if (running) {
      // Best-effort, fire-and-forget.
      try {
        navigator.sendBeacon?.(
          `/api/chat/tasks/${running.id}/needs_resume`,
          new Blob([JSON.stringify({})], { type: "application/json" })
        );
      } catch {
        /* ignore */
      }
      // Locally mark so the UI reflects it on next hydrate
      state.patch(running.id, { status: "needs_resume" });
    }
  };
  window.addEventListener("pagehide", onUnload);
  window.addEventListener("beforeunload", onUnload);
}
