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

export function generateSmartFallbackSuggestions(name: string): FeatureSuggestion[] {
  const lower = name.toLowerCase();
  if (lower.includes("wand") || lower.includes("magic") || lower.includes("spell")) {
    return [
      { label: "Spell Element Effects", description: "Particle emitters & elemental sound bursts for fire, ice, and lightning." },
      { label: "Mana Consumption System", description: "Recharging stamina/mana bar in StarterGui with depletion on cast." },
      { label: "Area of Effect Blast", description: "Damage splash zone on projectile hit with explosion physics." },
      { label: "Wand Upgrade Shop", description: "In-game GUI to purchase tier levels, damage multipliers, and trails." },
    ];
  }
  if (lower.includes("car") || lower.includes("vehicle") || lower.includes("drive")) {
    return [
      { label: "Speedometer HUD", description: "Custom UI display showing RPM, MPH, and gear selection." },
      { label: "Custom Engine Audio", description: "Dynamic pitch-shifting motor sound linked to vehicle velocity." },
      { label: "Vehicle Garage Spawner", description: "Proximity prompt garage pad that spawns customized cars." },
      { label: "Headlights & Underglow", description: "Toggleable spot lights and neon beams with hotkey controls." },
    ];
  }
  if (lower.includes("sword") || lower.includes("combat") || lower.includes("weapon")) {
    return [
      { label: "Combo Slash Animation", description: "3-hit consecutive attack chain with swing trails and hit detection." },
      { label: "Parry & Block Mechanic", description: "Timed shield block to deflect attacks and stun enemies." },
      { label: "Critical Hit Damage", description: "Floating yellow damage numbers and screen shake on critical strike." },
      { label: "Durability & Repair", description: "Weapon wear indicator with blacksmith repair stations." },
    ];
  }
  if (lower.includes("shop") || lower.includes("inventory") || lower.includes("currency")) {
    return [
      { label: "Daily Reward Streak", description: "Login bonus popup rewarding coins and gems for 7-day streaks." },
      { label: "Inventory Grid GUI", description: "Draggable item slots with tooltips, quantity counters, and equip slots." },
      { label: "DataStore Auto-Save", description: "Cloud saving for currency, items, and player progress with retry logic." },
      { label: "Leaderboard Display", description: "Global and server top rich players board in the spawn lobby." },
    ];
  }
  // Default robust suggestions for any Roblox feature
  return [
    { label: `${name} Sound FX & VFX`, description: `Rich visual particles and audio feedback when activating ${name}.` },
    { label: `${name} Control UI`, description: `Polished HUD menu and mobile button layout for ${name}.` },
    { label: `${name} Upgrade System`, description: `Stat progression and tier leveling stored in player DataStore.` },
    { label: `${name} Multiplayer Sync`, description: `Replicated events so all players in server see smooth animations.` },
  ];
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
          // Provide instant smart fallback suggestions based on feature name and context
          const fallbacks = generateSmartFallbackSuggestions(feature.name);
          set((s) => ({
            suggestions: {
              ...s.suggestions,
              [featureId]: {
                options: fallbacks,
                loading: false,
                error: null,
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
        } catch (_err) {
          // If OpenAI/upstream throws quota or credit error, use rich contextual Roblox game design fallbacks
          const fallbacks = generateSmartFallbackSuggestions(feature.name);
          set((s) => ({
            suggestions: {
              ...s.suggestions,
              [featureId]: {
                options: fallbacks,
                loading: false,
                error: null,
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
