/**
 * Lightweight LLM call to extract durable memories from a user↔assistant
 * exchange. Uses the same provider infrastructure as the main chat but
 * without tools, and parses a strict JSON response.
 *
 * Intentionally runs on a different model and is best-effort: it never
 * blocks the user response, never throws upward, and is silently skipped
 * when no API key is configured.
 */

import { generateText } from "ai";
import { getProvider, type ProviderType } from "./providers";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { isAuthenticated as isCodexAuthenticated } from "@/lib/auth/codex";

const EXTRACTOR_SYSTEM_PROMPT = `You are a memory extractor for an AI coding assistant.
Given a user message and an assistant response, decide which durable facts
should be remembered for future conversations. Return strict JSON only.

Valid categories (pick one per memory):
  USER_PREFERENCES       - how the user wants responses (concise, formal, etc.)
  PROJECT_CONTEXT        - facts about the current Roblox project
  CODING_PREFERENCES     - code style / patterns the user prefers
  WORKFLOW_PREFERENCES   - how the user works (which tools, which order)
  IMPORTANT_FACTS        - non-coding facts that may be useful
  ACTIVE_GOALS           - ongoing multi-step goals the user is working toward
  COMMON_PATTERNS        - reusable patterns specific to the project
  IMPORTANT_DECISIONS    - architectural decisions the user has made

Valid scopes:
  global  - applies across all projects (e.g. "user prefers concise replies")
  project - applies to the current Roblox project only
  session - applies only to the current conversation (less valuable; skip if
            unsure)

Output schema (return ONLY this JSON, no prose):
{
  "memories": [
    {
      "scope": "global" | "project" | "session",
      "category": "...",
      "key": "short_key_lowercase_with_underscores",
      "value": "one or two sentence description",
      "confidence": 0.0..1.0
    }
  ]
}

Rules:
- DO NOT save greetings, status checks, or ephemeral debug output.
- DO NOT save things the user said "just for this chat" or similar.
- Prefer HIGH-QUALITY, durable facts. Save AT MOST 3 memories per exchange.
- If nothing is worth remembering, return {"memories": []}.
- If memory would be obvious from a fresh conversation (e.g. "user is using
  Roblox Studio"), do not save it.`;

export interface ExtractedMemory {
  scope: "global" | "project" | "session";
  category: string;
  key: string;
  value: string;
  confidence: number;
}

const VALID_CATEGORIES = new Set([
  "USER_PREFERENCES",
  "PROJECT_CONTEXT",
  "CODING_PREFERENCES",
  "WORKFLOW_PREFERENCES",
  "IMPORTANT_FACTS",
  "ACTIVE_GOALS",
  "COMMON_PATTERNS",
  "IMPORTANT_DECISIONS",
]);

function isValidExtracted(m: unknown): m is ExtractedMemory {
  if (!m || typeof m !== "object") return false;
  const x = m as Record<string, unknown>;
  if (typeof x.key !== "string" || x.key.length === 0 || x.key.length > 80) return false;
  if (typeof x.value !== "string" || x.value.length === 0 || x.value.length > 600) return false;
  if (typeof x.category !== "string" || !VALID_CATEGORIES.has(x.category)) return false;
  if (x.scope !== "global" && x.scope !== "project" && x.scope !== "session") return false;
  if (typeof x.confidence !== "number" || x.confidence < 0 || x.confidence > 1) return false;
  return true;
}

export async function extractMemories(args: {
  userMessage: string;
  assistantMessage: string;
}): Promise<ExtractedMemory[] | null> {
  const { selectedModel, selectedProvider, getApiKey } = useSettingsStore.getState();
  const { authMethod } = useAuthStore.getState();

  // Avoid an HTTP call for trivial exchanges.
  if (args.userMessage.length < 20 && args.assistantMessage.length < 60) return [];

  let provider: ProviderType = selectedProvider;
  let apiKey: string;
  let model = selectedModel;

  if (provider === "codex" || (authMethod === "oauth" && isCodexAuthenticated())) {
    // Codex OAuth route is complex to invoke for non-streaming text; skip
    // extraction when the user is on Codex. The user can still save memories
    // explicitly via the "Remember this" command.
    return null;
  }
  if (provider === "openrouter") apiKey = getApiKey("openrouter") || "";
  else apiKey = getApiKey(provider as "openai" | "anthropic") || "";
  if (!apiKey) return null;

  try {
    const providerInstance = getProvider(provider, apiKey);
    const prompt = `USER:\n${args.userMessage}\n\nASSISTANT:\n${args.assistantMessage}`;
    const result = await generateText({
      model: providerInstance(model),
      system: EXTRACTOR_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 600,
    });
    const text = result.text.trim();
    // Find the first JSON object in the response.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return [];
    const json = JSON.parse(text.slice(start, end + 1)) as { memories?: unknown[] };
    if (!Array.isArray(json.memories)) return [];
    const out: ExtractedMemory[] = [];
    for (const m of json.memories.slice(0, 3)) {
      if (isValidExtracted(m)) out.push(m);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Cheap title generator: same model, but with a tiny prompt that asks for
 * 2-7 words. Async, never blocks the main response.
 */
export async function generateConversationTitle(
  userMessage: string,
  assistantMessage: string,
): Promise<string | null> {
  const { selectedModel, selectedProvider, getApiKey } = useSettingsStore.getState();
  const { authMethod } = useAuthStore.getState();
  if (userMessage.length < 4) return null;

  let provider: ProviderType = selectedProvider;
  let apiKey: string;
  let model = selectedModel;

  if (provider === "codex" || (authMethod === "oauth" && isCodexAuthenticated())) {
    return null;
  }
  if (provider === "openrouter") apiKey = getApiKey("openrouter") || "";
  else apiKey = getApiKey(provider as "openai" | "anthropic") || "";
  if (!apiKey) return null;

  try {
    const providerInstance = getProvider(provider, apiKey);
    const result = await generateText({
      model: providerInstance(model),
      system:
        "Generate a 2-7 word title for this conversation. Return ONLY the title, no quotes, no punctuation at the end.",
      prompt: `USER: ${userMessage}\n\nASSISTANT: ${assistantMessage.slice(0, 400)}`,
      maxOutputTokens: 30,
    });
    const t = result.text
      .replace(/^["'`\s]+|["'`\s]+$/g, "")
      .replace(/[\.\!\?]+$/g, "")
      .trim();
    if (t.length === 0 || t.length > 60) return null;
    return t;
  } catch {
    return null;
  }
}
