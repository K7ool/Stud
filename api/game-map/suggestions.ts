/**
 * POST /api/game-map/suggestions
 * Body: { featureName, featureDescription?, provider, model, projectContext? }
 * Headers: x-api-key: <user's provider API key>
 *
 * Returns 4 AI-generated, project-aware child feature options for the given
 * feature. Used by the Game Map panel so suggestions are real, contextual
 * ideas (not a static keyword map).
 */
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

export const config = { runtime: "edge" };

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Api-Key, X-Provider, X-Model"
  );
  return res;
}

function jsonResponse(body: unknown, status = 200): Response {
  return cors(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

const SUGGESTION_SYSTEM = `You are a senior Roblox game designer helping plan a project.
The user is building a feature inside a Roblox game. Suggest 4 concrete, distinct child features
or follow-up ideas that would naturally belong under it.

Rules:
- Each option must be a real, buildable Roblox feature (script, system, UI, model, mechanic).
- They must be SPECIFIC to the given feature, not generic ("add save system" is not specific enough).
- Vary the options: one could be a core mechanic, one a UI, one a system/persistence, one a content/polish item.
- Keep names short (2-5 words). Descriptions are one short sentence (10-18 words).
- Return ONLY a JSON array of exactly 4 objects: [{"label":"...","description":"..."}, ...]
- No prose, no markdown, no code fences. JSON only.`;

interface RequestBody {
  featureName: string;
  featureDescription?: string;
  parentChain?: string[];
  projectContext?: string;
  provider?: string;
  model?: string;
}

function buildPrompt(body: RequestBody): string {
  const chain = body.parentChain?.length
    ? `Path in game map: ${body.parentChain.join(" > ")} > ${body.featureName}`
    : `Feature: ${body.featureName}`;
  const desc = body.featureDescription
    ? `\nDescription: ${body.featureDescription}`
    : "";
  const project = body.projectContext
    ? `\nOverall project: ${body.projectContext}`
    : "";
  return `Suggest 4 child features for the following Roblox game feature.\n${chain}${desc}${project}`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST required" }, 405);
  }

  const apiKey = req.headers.get("x-api-key")?.trim();
  if (!apiKey) {
    return jsonResponse({ error: "Missing X-Api-Key header" }, 401);
  }

  const provider = (req.headers.get("x-provider") || "").trim().toLowerCase();
  const model = (req.headers.get("x-model") || "").trim();

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body.featureName || typeof body.featureName !== "string") {
    return jsonResponse({ error: "featureName is required" }, 400);
  }

  // Resolve model + provider
  const resolvedProvider = provider || body.provider || "openai";
  let resolvedModel =
    model ||
    body.model ||
    (resolvedProvider === "anthropic" ? "claude-3-5-haiku-20241022" : "gpt-4o-mini");

  // If GPT-5.6 Luna is requested on standard OpenAI provider, normalize or handle
  if (resolvedModel === "gpt-5.6-luna" && resolvedProvider === "openai") {
    // OpenAI API doesn't officially expose gpt-5.6-luna directly on standard key endpoints yet; fallback to gpt-4o
    resolvedModel = "gpt-4o";
  }

  let modelInstance;
  try {
    if (resolvedProvider === "anthropic") {
      modelInstance = createAnthropic({ apiKey })(resolvedModel);
    } else if (resolvedProvider === "openrouter") {
      modelInstance = createOpenAI({
        apiKey,
        baseURL: OPENROUTER_API_BASE,
      })(resolvedModel);
    } else {
      // default: openai-compatible
      modelInstance = createOpenAI({ apiKey })(resolvedModel);
    }
  } catch (err) {
    return jsonResponse(
      { error: `Failed to init provider: ${(err as Error).message}` },
      500
    );
  }

  try {
    const result = await generateText({
      model: modelInstance,
      system: SUGGESTION_SYSTEM,
      prompt: buildPrompt(body),
      temperature: 0.8,
    });

    const raw = result.text.trim();
    const parsed = parseSuggestions(raw);
    if (!parsed) {
      return jsonResponse(
        { error: "Model did not return valid JSON", raw },
        502
      );
    }

    return jsonResponse({
      options: parsed,
      provider: resolvedProvider,
      model: resolvedModel,
    });
  } catch (err) {
    return jsonResponse(
      { error: `AI request failed: ${(err as Error).message}` },
      502
    );
  }
}

function parseSuggestions(raw: string): Array<{ label: string; description: string }> | null {
  // Strip code fences if the model wrapped the JSON.
  let text = raw;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  // Find the JSON array in the response.
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);

  let arr: unknown;
  try {
    arr = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;

  const cleaned: Array<{ label: string; description: string }> = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const label =
      typeof obj.label === "string"
        ? obj.label.trim()
        : typeof obj.name === "string"
        ? obj.name.trim()
        : "";
    const description =
      typeof obj.description === "string"
        ? obj.description.trim()
        : typeof obj.desc === "string"
        ? obj.desc.trim()
        : "";
    if (label) cleaned.push({ label, description });
  }

  if (cleaned.length < 2) return null;
  return cleaned.slice(0, 4);
}
