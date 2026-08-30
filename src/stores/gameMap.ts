import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface GameFeature {
  id: string;
  name: string;
  description: string;
  status: "idea" | "in-progress" | "completed";
  children: GameFeature[];
  createdAt: string;
  completedAt?: string;
}

export interface FeatureSuggestion {
  label: string;
  description: string;
}

export interface SuggestionState {
  options: FeatureSuggestion[];
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
}

export interface GameMapState {
  features: GameFeature[];
  rootFeature: GameFeature | null;
  /** Map of featureId -> cached AI suggestions. */
  suggestions: Record<string, SuggestionState>;

  addFeature: (parentId: string | null, feature: Omit<GameFeature, "id" | "children" | "createdAt">) => string;
  updateFeature: (id: string, updates: Partial<GameFeature>) => void;
  deleteFeature: (id: string) => void;
  getFeature: (id: string) => GameFeature | undefined;
  setRootFeature: (feature: Omit<GameFeature, "id" | "children" | "createdAt">) => void;
  fetchSuggestions: (featureId: string) => Promise<void>;
  clearSuggestions: (featureId: string) => void;
  clearMap: () => void;
}

interface FetchSuggestionsInput {
  featureName: string;
  featureDescription?: string;
  parentChain: string[];
  projectContext?: string;
  provider: string;
  model: string;
  apiKey: string;
}

async function callSuggestionsApi(input: FetchSuggestionsInput): Promise<FeatureSuggestion[]> {
  const res = await fetch("/api/game-map/suggestions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": input.apiKey,
      "X-Provider": input.provider,
      "X-Model": input.model,
    },
    body: JSON.stringify({
      featureName: input.featureName,
      featureDescription: input.featureDescription,
      parentChain: input.parentChain,
      projectContext: input.projectContext,
      provider: input.provider,
      model: input.model,
    }),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const data = (await res.json()) as { options?: FeatureSuggestion[] };
  if (!data.options || !Array.isArray(data.options) || data.options.length === 0) {
    throw new Error("No suggestions returned");
  }
  return data.options;
}

function buildParentChain(
  features: GameFeature[],
  rootFeature: GameFeature | null,
  targetId: string
): string[] {
  const path: string[] = [];

  const walk = (node: GameFeature, ancestors: string[]): boolean => {
    const next = [...ancestors, node.name];
    if (node.id === targetId) {
      path.push(...next);
      return true;
    }
    for (const child of node.children) {
      if (walk(child, next)) return true;
    }
    return false;
  };

  if (rootFeature) {
    if (walk(rootFeature, [])) return path;
  }
  for (const f of features) {
    if (walk(f, [])) return path;
  }
  return path;
}

function getProjectContext(
  features: GameFeature[],
  rootFeature: GameFeature | null
): string {
  const root = rootFeature ?? features[0];
  if (!root) return "";
  return root.description ? `${root.name} — ${root.description}` : root.name;
}

export const useGameMapStore = create<GameMapState>()(
  persist(
    (set, get) => ({
      features: [],
      rootFeature: null,
      suggestions: {},

      addFeature: (parentId, feature) => {
        const id = crypto.randomUUID();
        const newFeature: GameFeature = {
          ...feature,
          id,
          children: [],
          createdAt: new Date().toISOString(),
        };

        set((state) => {
          if (!parentId) {
            return { features: [...state.features, newFeature] };
          }

          const addToParent = (features: GameFeature[]): GameFeature[] => {
            return features.map((f) => {
              if (f.id === parentId) {
                return { ...f, children: [...f.children, newFeature] };
              }
              if (f.children.length > 0) {
                return { ...f, children: addToParent(f.children) };
              }
              return f;
            });
          };

          return { features: addToParent(state.features) };
        });

        return id;
      },

      updateFeature: (id, updates) => {
        set((state) => {
          const updateInList = (features: GameFeature[]): GameFeature[] => {
            return features.map((f) => {
              if (f.id === id) {
                const updated = { ...f, ...updates };
                if (updates.status === "completed") {
                  updated.completedAt = new Date().toISOString();
                }
                return updated;
              }
              if (f.children.length > 0) {
                return { ...f, children: updateInList(f.children) };
              }
              return f;
            });
          };

          let rootUpdated = state.rootFeature;
          if (rootUpdated?.id === id) {
            rootUpdated = { ...rootUpdated, ...updates };
            if (updates.status === "completed") {
              rootUpdated.completedAt = new Date().toISOString();
            }
          }

          return {
            features: updateInList(state.features),
            rootFeature: rootUpdated,
          };
        });
      },

      deleteFeature: (id) => {
        set((state) => {
          const deleteFromList = (features: GameFeature[]): GameFeature[] => {
            return features
              .filter((f) => f.id !== id)
              .map((f) => ({
                ...f,
                children: deleteFromList(f.children),
              }));
          };

          return {
            features: deleteFromList(state.features),
            rootFeature: state.rootFeature?.id === id ? null : state.rootFeature,
          };
        });
      },

      getFeature: (id) => {
        const state = get();
        if (state.rootFeature?.id === id) return state.rootFeature;

        const findInList = (features: GameFeature[]): GameFeature | undefined => {
          for (const f of features) {
            if (f.id === id) return f;
            const found = findInList(f.children);
            if (found) return found;
          }
          return undefined;
        };

        return findInList(state.features);
      },

      setRootFeature: (feature) => {
        const id = crypto.randomUUID();
        const newRoot: GameFeature = {
          ...feature,
          id,
          children: [],
          createdAt: new Date().toISOString(),
        };
        set({ rootFeature: newRoot });
      },

      fetchSuggestions: async (featureId) => {
        const state = get();
        const feature = state.getFeature(featureId);
        if (!feature) return;

        // Resolve provider + api key from settings store (dynamic import to avoid circular deps).
        const { useSettingsStore } = await import("@/stores/settings");
        const settings = useSettingsStore.getState();
        const provider = settings.selectedProvider;
        const model = settings.selectedModel;

        let apiKey =
          provider === "openai"
            ? settings.getApiKey("openai")
            : provider === "anthropic"
            ? settings.getApiKey("anthropic")
            : provider === "openrouter"
            ? settings.getApiKey("openrouter")
            : undefined;

        // If codex is selected but no OAuth token, fall back to OpenAI key
        if (!apiKey && provider === "codex") {
          const openaiKey = settings.getApiKey("openai");
          if (openaiKey) {
            apiKey = openaiKey;
          }
        }

        if (!apiKey) {
          const needsKey =
            provider === "codex"
              ? "Codex (OAuth)"
              : provider === "openai"
              ? "OpenAI"
              : provider === "anthropic"
              ? "Anthropic"
              : provider === "openrouter"
              ? "OpenRouter"
              : "the selected provider";
          set((s) => ({
            suggestions: {
              ...s.suggestions,
              [featureId]: {
                options: [],
                loading: false,
                error:
                  `No API key configured for ${needsKey}. Add one in Settings (API Keys tab) to get AI-powered suggestions.`,
                fetchedAt: Date.now(),
              },
            },
          }));
          return;
        }

        // Skip if cached and recent (<5 min) and not loading
        const cached = state.suggestions[featureId];
        if (
          cached &&
          !cached.loading &&
          !cached.error &&
          cached.options.length > 0 &&
          cached.fetchedAt &&
          Date.now() - cached.fetchedAt < 5 * 60 * 1000
        ) {
          return;
        }

        set((s) => ({
          suggestions: {
            ...s.suggestions,
            [featureId]: {
              options: cached?.options ?? [],
              loading: true,
              error: null,
              fetchedAt: cached?.fetchedAt ?? null,
            },
          },
        }));

        try {
          const parentChain = buildParentChain(
            state.features,
            state.rootFeature,
            featureId
          );
          // Remove the feature itself from the chain — the API only wants ancestors.
          const ancestors = parentChain.slice(0, -1);
          const projectContext = getProjectContext(state.features, state.rootFeature);

          const options = await callSuggestionsApi({
            featureName: feature.name,
            featureDescription: feature.description,
            parentChain: ancestors,
            projectContext,
            provider,
            model,
            apiKey,
          });

          set((s) => ({
            suggestions: {
              ...s.suggestions,
              [featureId]: {
                options,
                loading: false,
                error: null,
                fetchedAt: Date.now(),
              },
            },
          }));
        } catch (err) {
          set((s) => ({
            suggestions: {
              ...s.suggestions,
              [featureId]: {
                options: cached?.options ?? [],
                loading: false,
                error: (err as Error).message || "Failed to fetch suggestions",
                fetchedAt: Date.now(),
              },
            },
          }));
        }
      },

      clearSuggestions: (featureId) => {
        set((s) => {
          const next = { ...s.suggestions };
          delete next[featureId];
          return { suggestions: next };
        });
      },

      clearMap: () =>
        set({ features: [], rootFeature: null, suggestions: {} }),
    }),
    {
      name: "stud-game-map",
      partialize: (state) => ({
        features: state.features,
        rootFeature: state.rootFeature,
        // Persist cached suggestions (without loading/error) so refresh is instant.
        suggestions: Object.fromEntries(
          Object.entries(state.suggestions)
            .filter(([, v]) => v.options.length > 0 && !v.error)
            .map(([k, v]) => [k, { ...v, loading: false, error: null }])
        ),
      }),
    }
  )
);
