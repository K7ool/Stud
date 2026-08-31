/**
 * TODO / task-plan state machine.
 *
 * Central, single source of truth for how steps may change status. Both the
 * agent's update_task_plan tool and the UI (TaskPanel) go through these
 * helpers so the state machine is enforced in exactly one place instead of
 * being re-derived ad-hoc.
 *
 * Design goals (per product spec):
 *   - The TODO is structured, real state — it controls + reflects execution,
 *     never inferred from free-text chat.
 *   - Steps support the full lifecycle: pending -> in_progress -> completed /
 *     failed / skipped, plus blocked <-> in_progress, and cancelled.
 *   - dependsOn[] expresses prerequisites; a step may only start once all its
 *     dependencies are completed (blocked otherwise).
 *   - Progress is derived from completed/total (optionally weighted), not
 *     guessed.
 */

import type { StepPriority, StepStatus, TaskStep } from "@/lib/chat/api";

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

/** Idempotent transitions are always allowed (e.g. mark completed twice). */
const TERMINAL_OR_EQUAL: Record<string, StepStatus[]> = {
  completed: ["completed"],
  failed: ["failed"],
  skipped: ["skipped"],
  cancelled: ["cancelled"],
  blocked: ["blocked"],
};

/**
 * Validate a step status transition.
 * @param from current status
 * @param to   requested next status
 * @param deps met dependencies (step ids already completed) — only consulted
 *             when moving INTO in_progress so a blocked start fails loudly.
 */
export function canTransition(
  from: StepStatus,
  to: StepStatus,
  opts?: { depsMet?: boolean },
): TransitionResult {
  if (from === to) return { ok: true };
  if (TERMINAL_OR_EQUAL[to]?.includes(to)) {
    // falling through lets equal-case be handled above; nothing else needed
  }
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: `Cannot move a step from "${from}" to "${to}"`,
    };
  }
  if (to === "in_progress" && opts?.depsMet === false) {
    return { ok: false, reason: "Dependencies are not yet completed" };
  }
  return { ok: true };
}

/** Returns the step ids among `deps` that are already completed. */
export function metDependencies(steps: TaskStep[], step: TaskStep): string[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  return step.dependsOn.filter((d) => byId.get(d)?.status === "completed");
}

/** True if every dependency of `step` is completed. */
export function dependenciesMet(steps: TaskStep[], step: TaskStep): boolean {
  return metDependencies(steps, step).length === step.dependsOn.length;
}

/**
 * Recompute overall task progress and the current (in-progress) step id from
 * a step list. completed/total gives a monotonic 0..1 figure; empty plans
 * yield 0.
 */
export function computeProgress(
  steps: TaskStep[],
): { progress: number; currentStep: string } {
  if (!steps || steps.length === 0) return { progress: 0, currentStep: "" };
  const done = steps.filter((s) => s.status === "completed").length;
  const active = steps.find((s) => s.status === "in_progress");
  return {
    progress: Math.min(1, done / steps.length),
    currentStep: active?.id ?? "",
  };
}

/**
 * Find the next eligible step: pending and not blocked by unmet dependencies.
 * This is what "advance" uses to pick what should run next.
 */
export function nextPendingStep(steps: TaskStep[]): TaskStep | undefined {
  return steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .find((s) => s.status === "pending" && dependenciesMet(steps, s));
}

/**
 * Walk all steps and re-derive their effective status. A pending step whose
 * dependencies aren't met is auto-blocked; a blocked step whose deps are now
 * met returns to pending. Returns a new array (no mutation).
 */
export function reEvaluateBlocking(steps: TaskStep[]): TaskStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  return steps.map((s) => {
    const depsMet = s.dependsOn.every((d) => byId.get(d)?.status === "completed");
    if (s.status === "pending" && !depsMet) {
      return { ...s, status: "blocked" as const, blockedReason: "Waiting on a prerequisite step" };
    }
    if (s.status === "blocked" && depsMet && wipAllowed(steps, byId)) {
      return { ...s, status: "pending" as const, blockedReason: undefined };
    }
    return s;
  });
}

/** Only start a new step when there is no other step already running. */
function wipAllowed(steps: TaskStep[], byId: Map<string, TaskStep>): boolean {
  void byId;
  return !steps.some((s) => s.status === "in_progress");
}

/** Normalise a step's priority string to a known value. */
export function normalizePriority(p?: string): StepPriority {
  if (p === "high" || p === "low") return p;
  return "normal";
}
