/**
 * Effort → model parameter mapping.
 *
 * IMPORTANT: This module NEVER fabricates parameters the underlying provider
 * doesn't support. Each provider has a different real contract for "thinking"
 * / "reasoning effort":
 *
 *   - OpenAI (gpt-5.x family, including "gpt-5.6-luna" on the OpenAI
 *     endpoint): providerOptions.openai.reasoningEffort = "low" | "medium" | "high"
 *   - Anthropic (claude-sonnet-4, claude-3.5-haiku): providerOptions.anthropic
 *     .thinking = { type: "enabled", budgetTokens: N } — token-budget thinking
 *   - OpenRouter (used via createOpenAI({ baseURL: openrouter }) — same
 *     OpenAI-shaped transport): OpenRouter only forwards reasoning_effort
 *     for reasoning-capable models. We only send it for those.
 *   - Codex OAuth (ChatGPT Plus/Pro): client cannot shape request — effort
 *     is best-effort. The UI surfaces a notice.
 *
 * If the selected model is NOT reasoning-capable, we deliberately omit
 * reasoning params so we never send invalid data to the API.
 */

import type { ProviderType } from "./providers";

export type EffortLevel = "none" | "low" | "medium" | "high" | "auto";

/** Models that accept OpenAI-style `reasoning_effort`. */
const OPENAI_REASONING_FAMILIES = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-pro",
  "gpt-5.1",
  "gpt-5.2",
  "gpt-5.6-luna",
  "o1",
  "o1-mini",
  "o1-pro",
  "o3",
  "o3-mini",
  "o3-pro",
  "o4",
];

function isReasoningCapable(modelId: string): boolean {
  const m = modelId.toLowerCase();
  if (OPENAI_REASONING_FAMILIES.some((f) => m.startsWith(f))) return true;
  if (m.includes("reasoning")) return true;
  return false;
}

/** Convert a normalized effort to a provider value (never "auto"). */
function normalize(effort: EffortLevel): "none" | "low" | "medium" | "high" | null {
  if (effort === "none" || effort === "low" || effort === "medium" || effort === "high") return effort;
  return null;
}

/** Anthropic thinking budgets per effort level. */
const ANTHROPIC_BUDGET: Record<"low" | "medium" | "high", number> = {
  low: 1024,
  medium: 4096,
  high: 16384,
};

/**
 * Build the `providerOptions` to pass to streamText/generateText for a given
 * (provider, model, effort) tuple.
 *
 * Auto-think / effort shaping is disabled: we always return {} so no
 * `reasoning_effort` or Anthropic `thinking` parameters are sent. Some
 * provider/model/account combinations reject those parameters with
 * "no remaining credits" or similar billing errors, and shaping isn't worth
 * breaking requests for. The UI effort selector remains as a no-op so existing
 * saved settings and the selector still load; the API just gets clean requests.
 */
export function buildProviderOptions(
  _provider: ProviderType,
  _modelId: string,
  _effort: EffortLevel,
): Record<string, unknown> {
  return {};
}

/**
 * Determine whether the current (provider, model) actually supports effort
 * shaping. Used by the UI to display a notice when the selector is read-only.
 */
export function supportsEffortShaping(
  provider: ProviderType,
  modelId: string,
): boolean {
  if (provider === "codex") return false;
  if (provider === "openai" || provider === "openrouter") {
    return isReasoningCapable(modelId);
  }
  if (provider === "anthropic") {
    return modelId.toLowerCase().startsWith("claude");
  }
  return false;
}

/**
 * Human-readable label for the currently effective effort the user is
 * running with (used in the UI footer).
 */
export function describeEffort(
  provider: ProviderType,
  modelId: string,
  effort: EffortLevel,
): string {
  if (effort === "auto") return "Auto";
  if (!supportsEffortShaping(provider, modelId)) {
    return `${effort[0].toUpperCase()}${effort.slice(1)} (no native support — using defaults)`;
  }
  return `${effort[0].toUpperCase()}${effort.slice(1)}`;
}
