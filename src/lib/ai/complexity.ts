/**
 * Task complexity classifier.
 *
 * Used by the chat submit flow to decide whether to:
 *   - skip task tracking (trivial, instant + low)
 *   - track a lightweight single-step task (small)
 *   - create a multi-step task (medium)
 *   - create a detailed dependency-aware plan (large)
 *
 * Decision is based on the prompt + a small set of heuristic signals plus
 * the user's selected mode (instant / auto / plan).
 *
 * NEVER delays the first AI response: classification runs synchronously and
 * the actual plan text (for LARGE) is generated in-flight by the AI itself
 * via the `update_task_plan` tool.
 */

import type { TaskMode, TaskEffort, TaskPriority } from "@/lib/chat/api";

export type Complexity = "trivial" | "small" | "medium" | "large";

export interface Classification {
  complexity: Complexity;
  reason: string;
  suggestedEffort: TaskEffort;
  suggestedPriority: TaskPriority;
  shouldCreateTask: boolean;
  shouldUsePlan: boolean;
}

const TRIVIAL_PATTERNS = [
  /^(is|are)\s+(studio|the bridge|the plugin)\s+(connected|running|up|online)\??$/i,
  /^(what|which)\s+(is|are)\s+(studio|the bridge)/i,
  /^(hi|hello|hey|thanks|thank you|thx|ok|okay)\b/i,
  /^rename\s+the\s+selection\b/i,
  /^\s*$/,
];

const LARGE_PATTERNS = [
  /\b(build|create|design|architect|implement)\s+(me\s+)?(a|an|the|my)?\s*(complete|full|entire|whole)\s+\w+/i,
  /\b(system|framework|infrastructure|architecture)\b/i,
  /\brefactor\s+the\s+(whole|entire|complete|whole)\b/i,
  /\b(analyze|scan|audit)\s+(the\s+)?(whole|entire|complete)?\s*(project|game|codebase)\b/i,
  /\bmulti[-\s]?step\b/i,
  /\b(build|create)\s+me\s+an?\s+(combat|inventory|shop|pet|economy|crafting|quest|save|ui|admin|currency|chat|trading|auction|skill|leveling|achievement|leaderboard)\b/i,
];

const SMALL_PATTERNS = [
  /^(rename|delete|create\s+a\s+part|make\s+a\s+part|create\s+one\s+part|set\s+the\s+position|move\s+the|add\s+a\s+script)\b/i,
  /^(fix|update|change)\s+(the\s+)?(name|color|position|size|material|transparency|anchored|cframe)\b/i,
  /^\/(create|delete|move|set)\b/i,
  /\bsingle\s+(part|script|value|change|edit)\b/i,
];

const LARGE_KEYWORDS = [
  "complete system",
  "full system",
  "framework",
  "infrastructure",
  "architecture",
  "combat system",
  "pet system",
  "inventory system",
  "economy system",
  "shop system",
  "save system",
  "trading system",
  "currency system",
  "leaderboard",
  "achievement system",
  "crafting system",
  "quest system",
  "leveling system",
  "admin panel",
  "auth system",
  "multiplayer",
  "multi-step",
];

const MEDIUM_KEYWORDS = [
  "make",
  "create",
  "add a",
  "build a",
  "implement a",
  "add a feature",
  "set up",
  "configure",
  "fix the",
  "debug the",
  "optimize",
  "improve",
  "refactor",
  "script",
  "system",
  "feature",
  "module",
  "service",
  "manager",
  "controller",
  "ui",
  "gui",
  "screen",
  "hud",
  "menu",
  "button",
];

export function classifyComplexity(prompt: string): Classification {
  const text = prompt.trim();
  if (!text) {
    return {
      complexity: "trivial",
      reason: "Empty input",
      suggestedEffort: "low",
      suggestedPriority: "normal",
      shouldCreateTask: false,
      shouldUsePlan: false,
    };
  }

  // Trivial
  for (const r of TRIVIAL_PATTERNS) {
    if (r.test(text)) {
      return {
        complexity: "trivial",
        reason: "Trivial pattern match",
        suggestedEffort: "low",
        suggestedPriority: "normal",
        shouldCreateTask: false,
        shouldUsePlan: false,
      };
    }
  }

  const lower = text.toLowerCase();
  const wordCount = text.split(/\s+/).length;

  // Large
  for (const r of LARGE_PATTERNS) {
    if (r.test(text)) {
      return {
        complexity: "large",
        reason: "Large system pattern",
        suggestedEffort: "high",
        suggestedPriority: "normal",
        shouldCreateTask: true,
        shouldUsePlan: true,
      };
    }
  }
  for (const kw of LARGE_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        complexity: "large",
        reason: `Large keyword: "${kw}"`,
        suggestedEffort: "high",
        suggestedPriority: "normal",
        shouldCreateTask: true,
        shouldUsePlan: true,
      };
    }
  }

  // Small
  for (const r of SMALL_PATTERNS) {
    if (r.test(text)) {
      return {
        complexity: "small",
        reason: "Small pattern match",
        suggestedEffort: "low",
        suggestedPriority: "normal",
        shouldCreateTask: false,
        shouldUsePlan: false,
      };
    }
  }

  // Medium by default for action verbs + medium keywords
  let mediumScore = 0;
  for (const kw of MEDIUM_KEYWORDS) {
    if (lower.includes(kw)) mediumScore++;
  }
  if (mediumScore >= 1 || wordCount >= 8) {
    return {
      complexity: mediumScore >= 3 || wordCount >= 25 ? "medium" : "small",
      reason: `Keyword score ${mediumScore}, ${wordCount} words`,
      suggestedEffort: mediumScore >= 3 ? "medium" : "low",
      suggestedPriority: "normal",
      shouldCreateTask: mediumScore >= 2 || wordCount >= 15,
      shouldUsePlan: false,
    };
  }

  return {
    complexity: "trivial",
    reason: "Question / no clear action",
    suggestedEffort: "low",
    suggestedPriority: "normal",
    shouldCreateTask: false,
    shouldUsePlan: false,
  };
}

/** Convert classification + user mode override into a final mode. */
export function resolveMode(
  classification: Classification,
  userMode: TaskMode,
): { mode: TaskMode; effort: TaskEffort; shouldCreateTask: boolean; shouldUsePlan: boolean } {
  if (userMode === "instant") {
    return {
      mode: "instant",
      effort: "low",
      shouldCreateTask: false,
      shouldUsePlan: false,
    };
  }
  if (userMode === "plan") {
    return {
      mode: "plan",
      effort: classification.suggestedEffort,
      shouldCreateTask: true,
      shouldUsePlan: true,
    };
  }
  // auto
  return {
    mode: "auto",
    effort: classification.suggestedEffort,
    shouldCreateTask: classification.shouldCreateTask,
    shouldUsePlan: classification.shouldUsePlan,
  };
}
