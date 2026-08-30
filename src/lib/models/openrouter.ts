/**
 * OpenRouter Model Fetcher
 * Fetches free models from OpenRouter API
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { DisplayModel } from "./types";

const OPENROUTER_API = "https://openrouter.ai/api/v1";
const CACHE_KEY = "stud_openrouter_models_cache";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface OpenRouterModelsCache {
  models: DisplayModel[];
  timestamp: number;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    prompt: number;
    completion: number;
  };
  context_length: number;
  free?: boolean;
}

// Popular free models on OpenRouter
export const FALLBACK_FREE_MODELS: DisplayModel[] = [
  { id: "google/gemini-2.0-flash-thinking-exp:free", name: "Gemini 2.0 Flash Thinking", description: "Fast reasoning", provider: "openrouter", reasoning: true },
  { id: "deepseek/deepseek-chat-v3:free", name: "DeepSeek V3", description: "Fast chat", provider: "openrouter" },
  { id: "qwen/qwen3-8b:free", name: "Qwen 3 8B", description: "Efficient large model", provider: "openrouter" },
  { id: "anthropic/claude-3.5-haiku:free", name: "Claude 3.5 Haiku", description: "Fast and compact", provider: "openrouter" },
  { id: "meta-llama/llama-3.2-11b-vision-instruct:free", name: "Llama 3.2 Vision", description: "Vision support", provider: "openrouter", attachment: true },
  { id: "mistralai/mistral-nemo:free", name: "Mistral Nemo", description: "Balanced performance", provider: "openrouter" },
  { id: "microsoft/phi-4:free", name: "Microsoft Phi-4", description: "Compact reasoning", provider: "openrouter" },
  { id: "google/gemini-pro-1.5:free", name: "Gemini Pro 1.5", description: "Long context", provider: "openrouter" },
  { id: "openai/chatgpt-4o-latest:free", name: "ChatGPT-4o (Free)", description: "Latest GPT-4o", provider: "openrouter" },
  { id: "anthropic/claude-3-opus:free", name: "Claude 3 Opus (Free)", description: "Most capable", provider: "openrouter" },
  { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1", description: "Advanced reasoning", provider: "openrouter", reasoning: true },
  { id: "qwen/qwen2.5-72b:free", name: "Qwen 2.5 72B", description: "Large efficient model", provider: "openrouter" },
];

function getCache(): OpenRouterModelsCache | null {
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
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    models,
    timestamp: Date.now(),
  }));
}

function clearCache(): void {
  localStorage.removeItem(CACHE_KEY);
}

export async function fetchOpenRouterModels(apiKey: string): Promise<DisplayModel[]> {
  // Check cache first
  const cached = getCache();
  if (cached) {
    console.log("[OpenRouter] Using cached models");
    return cached.models;
  }

  if (!apiKey) {
    console.log("[OpenRouter] No API key, using fallback models");
    return FALLBACK_FREE_MODELS;
  }

  try {
    console.log("[OpenRouter] Fetching models from API");
    const response = await tauriFetch(`${OPENROUTER_API}/models`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://stud.ai",
        "X-Title": "Stud",
      },
    });

    if (!response.ok) {
      console.warn("[OpenRouter] API error:", response.status);
      return FALLBACK_FREE_MODELS;
    }

    const data = await response.json() as { data: OpenRouterModel[] };

    // Filter for free models and transform to DisplayModel
    const freeModels: DisplayModel[] = data.data
      .filter(m => m.free || (m.pricing && m.pricing.prompt === 0 && m.pricing.completion === 0))
      .slice(0, 50) // Limit to top 50 free models
      .map(m => ({
        id: m.id,
        name: m.name || m.id.split("/").pop()?.replace(/-/g, " ") || m.id,
        description: m.description?.slice(0, 100) || undefined,
        provider: "openrouter",
        attachment: true, // Most OpenRouter models support attachments
      }));

    if (freeModels.length > 0) {
      saveCache(freeModels);
      return freeModels;
    }

    return FALLBACK_FREE_MODELS;
  } catch (error) {
    console.error("[OpenRouter] Fetch failed:", error);
    return FALLBACK_FREE_MODELS;
  }
}

export function clearOpenRouterCache(): void {
  clearCache();
}

export function getCachedOpenRouterModels(): DisplayModel[] {
  const cached = getCache();
  return cached?.models || FALLBACK_FREE_MODELS;
}
