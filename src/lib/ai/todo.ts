/**
 * TODO / task-plan state machine.
 *
 * Central, single source of truth for how steps may change status. Both the
 * agent's todowrite / update_task_plan tool and the UI (TaskPanel / TodoCard)
 * go through these helpers so the state machine is enforced in exactly one place.
 */

import type { StepPriority, StepStatus, TaskProgress, TaskStep, TaskEvent } from "@/lib/chat/api";

export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Statuses a step can legally move to from a given current status. */
const ALLOWED: Record<StepStatus, StepStatus[]> = {
  pending: ["in_progress", "skipped", "cancelled", "blocked"],
  in_progress: ["completed", "failed", "skipped", "blocked", "pending", "cancelled"],
  blocked: ["in_progress", "pending", "cancelled", "skipped"],
  completed: ["pending", "in_progress"], // allow re-open / replan
  failed: ["in_progress", "pending", "skipped", "cancelled", "blocked"],
  skipped: ["pending", "in_progress", "blocked"],
  cancelled: ["pending", "in_progress"],
};

/**
 * Validate a step status transition.
 */
export function canTransition(
  from: StepStatus,
  to: StepStatus,
  opts?: { depsMet?: boolean },
): TransitionResult {
  if (from === to) return { ok: true };
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: `Cannot move a step from "${from}" to "${to}"`,
    };
  }
  if (to === "in_progress" && opts?.depsMet === false) {
    return { ok: false, reason: "Prerequisite dependencies are not yet completed" };
  }
  return { ok: true };
}

/** Returns the step ids among `deps` that are already completed or skipped. */
export function metDependencies(steps: TaskStep[], step: TaskStep): string[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  return step.dependsOn.filter((d) => {
    const s = byId.get(d);
    return s?.status === "completed" || s?.status === "skipped";
  });
}

/** True if every dependency of `step` is completed (or skipped). */
export function dependenciesMet(steps: TaskStep[], step: TaskStep): boolean {
  return metDependencies(steps, step).length === step.dependsOn.length;
}

/**
 * Recompute overall task progress and the current in-progress step info.
 */
export function computeProgress(
  steps: TaskStep[],
): {
  progress: number;
  progressDetails: TaskProgress;
  currentStep: string;
  currentStepTitle: string;
} {
  if (!steps || steps.length === 0) {
    return {
      progress: 0,
      progressDetails: { completed: 0, total: 0, percent: 0 },
      currentStep: "",
      currentStepTitle: "",
    };
  }
  const done = steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
  const total = steps.length;
  const pct = Math.round((done / total) * 100);
  const active = steps.find((s) => s.status === "in_progress");

  return {
    progress: Math.min(1, done / total),
    progressDetails: {
      completed: done,
      total,
      percent: pct,
    },
    currentStep: active?.id ?? "",
    currentStepTitle: active?.title ?? "",
  };
}

/**
 * Find the next eligible step: pending and not blocked by unmet dependencies.
 */
export function nextPendingStep(steps: TaskStep[]): TaskStep | undefined {
  return steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .find((s) => s.status === "pending" && dependenciesMet(steps, s));
}

/**
 * Walk all steps and re-derive their effective status based on dependency states.
 */
export function reEvaluateBlocking(steps: TaskStep[]): TaskStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  return steps.map((s) => {
    const depsMet = s.dependsOn.every((d) => {
      const dep = byId.get(d);
      return dep?.status === "completed" || dep?.status === "skipped";
    });

    if (s.status === "pending" && !depsMet) {
      return {
        ...s,
        status: "blocked" as const,
        blockedReason: s.blockedReason || "Waiting on prerequisite step",
      };
    }
    if (s.status === "blocked" && depsMet && s.blockedReason === "Waiting on prerequisite step") {
      return {
        ...s,
        status: "pending" as const,
        blockedReason: undefined,
      };
    }
    return s;
  });
}

/** Normalise a step's priority string to a known value. */
export function normalizePriority(p?: string): StepPriority {
  if (p === "high" || p === "low") return p;
  return "normal";
}

/** Group steps by their optional `group` attribute (defaults to "General"). */
export function groupSteps(steps: TaskStep[]): Array<{ group: string; steps: TaskStep[] }> {
  const groups = new Map<string, TaskStep[]>();

  for (const step of steps) {
    const g = step.group || "General";
    if (!groups.has(g)) {
      groups.set(g, []);
    }
    groups.get(g)!.push(step);
  }

  return Array.from(groups.entries()).map(([group, sList]) => ({
    group,
    steps: sList.sort((a, b) => a.order - b.order),
  }));
}

/** Create a structured audit event for task execution history. */
export function createAuditTrailEvent(
  type: TaskEvent["type"],
  message: string,
  stepId?: string,
  details?: Record<string, unknown>
): TaskEvent {
  return {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    stepId,
    timestamp: Date.now(),
    message,
    details,
  };
}
