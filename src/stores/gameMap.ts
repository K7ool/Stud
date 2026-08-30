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

export interface GameMapState {
  features: GameFeature[];
  rootFeature: GameFeature | null;

  addFeature: (parentId: string | null, feature: Omit<GameFeature, "id" | "children" | "createdAt">) => string;
  updateFeature: (id: string, updates: Partial<GameFeature>) => void;
  deleteFeature: (id: string) => void;
  getFeature: (id: string) => GameFeature | undefined;
  setRootFeature: (feature: Omit<GameFeature, "id" | "children" | "createdAt">) => void;
  getSuggestions: (featureId: string) => string[];
  clearMap: () => void;
}

const SUGGESTIONS: Record<string, string[]> = {
  car: [
    "Make car faster",
    "Add nitro boost",
    "Add car customizer",
    "Create car dealership",
    "Add car physics tuning",
    "Add damage system",
  ],
  house: [
    "Add furniture",
    "Create rooms",
    "Add decoration system",
    "Create house customizer",
    "Add indoor lighting",
  ],
  npc: [
    "Add dialogue system",
    "Create NPC schedules",
    "Add NPC quests",
    "Make NPCs follow player",
    "Add NPC shop",
  ],
  weapon: [
    "Add ammo system",
    "Create weapon upgrades",
    "Add reload mechanic",
    "Add weapon skins",
    "Create weapon crafting",
  ],
  game: [
    "Add save system",
    "Create main menu",
    "Add settings menu",
    "Add player stats",
    "Create leaderboard",
  ],
  default: [
    "Add more features",
    "Create UI for this",
    "Add save/load",
    "Create documentation",
    "Add tests",
    "Optimize performance",
  ],
};

function getSuggestionsForFeature(name: string): string[] {
  const lowerName = name.toLowerCase();
  for (const [key, suggestions] of Object.entries(SUGGESTIONS)) {
    if (lowerName.includes(key)) {
      return suggestions;
    }
  }
  return SUGGESTIONS.default;
}

export const useGameMapStore = create<GameMapState>()(
  persist(
    (set, get) => ({
      features: [],
      rootFeature: null,

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

      getSuggestions: (featureId) => {
        const feature = get().getFeature(featureId);
        if (!feature) return SUGGESTIONS.default;
        return getSuggestionsForFeature(feature.name);
      },

      clearMap: () => set({ features: [], rootFeature: null }),
    }),
    {
      name: "stud-game-map",
    }
  )
);
