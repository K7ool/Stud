/**
 * OpenCode Zen Model Fetcher
 * Fetches models from the OpenCode Zen gateway (https://opencode.ai/zen).
 * Zen exposes a curated, OpenAI-compatible catalog with several free models
 * (Big Pickle, MiMo-V2.5 Free, DeepSeek V4 Flash Free, etc.).
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { DisplayModel } from "./types";

const OPENCODE_ZEN_API = "https://opencode.ai/zen/v1";
const CACHE_KEY = "stud_opencode_models_cache";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface OpenCodeModelsCache {
  models: DisplayModel[];
  timestamp: number;
}

export interface OpenCodeZenModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
}

// Popular free models on OpenCode Zen. Big Pickle is the flagship free
// showroom model; the rest are free for a limited time.
export const FALLBACK_OPENCODE_MODELS: DisplayModel[] = [
  { id: "opencode/big-pickle", name: "Big Pickle", description: "Free flagship model with rotating capabilities", provider: "opencode", reasoning: true },
  { id: "opencode/mimo-v2.5-free", name: "MiMo-V2.5 Free", description: "Free coding model", provider: "opencode" },
  { id: "opencode/deepseek-v4-flash-free", name: "DeepSeek V4 Flash Free", description: "Free fast model", provider: "opencode" },
  { id: "opencode/north-mini-code-free", name: "North Mini Code Free", description: "Free code model", provider: "opencode" },
  { id: "opencode/nemotron-3-ultra-free", name: "Nemotron 3 Ultra Free", description: "Free NVIDIA model", provider: "opencode" },
];

function getCache(): OpenCodeModelsCache | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(models: DisplayModel[]): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ models, timestamp: Date.now() }));
}

export function clearOpenCodeCache(): void {
  localStorage.removeItem(CACHE_KEY);
}

export function getCachedOpenCodeModels(): DisplayModel[] {
  const cached = getCache();
  return cached?.models || FALLBACK_OPENCODE_MODELS;
}

export async function fetchOpenCodeModels(_apiKey?: string): Promise<DisplayModel[]> {
  const cached = getCache();
  if (cached) {
    console.log("[OpenCode] Using cached models");
    return cached.models;
  }

  try {
    console.log("[OpenCode] Fetching models from Zen API");
    const response = await tauriFetch(`${OPENCODE_ZEN_API}/models`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.warn("[OpenCode] API error:", response.status);
      return FALLBACK_OPENCODE_MODELS;
    }

    const data = await response.json() as { data: OpenCodeZenModel[] };
    const models: DisplayModel[] = Array.isArray(data.data)
      ? data.data.map((m) => ({
          id: m.id.startsWith("opencode/") ? m.id : `opencode/${m.id}`,
          name: m.name || m.id.replace("opencode/", "").replace(/-/g, " ") || m.id,
          description: m.description,
          provider: "opencode",
        }))
      : [];

    if (models.length > 0) {
      saveCache(models);
      return models;
    }

    return FALLBACK_OPENCODE_MODELS;
  } catch (error) {
    console.error("[OpenCode] Fetch failed:", error);
    return FALLBACK_OPENCODE_MODELS;
  }
}
