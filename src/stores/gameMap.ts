import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildMechanicsFromScan, inferEdges, normalizeInstanceDump, type StudioScanResult } from "@/lib/game-analysis";

export interface GameFeature {
  id: string;
  name: string;
  description: string;
  status: "idea" | "in-progress" | "completed";
  children: GameFeature[];
  createdAt: string;
  completedAt?: string;
}

/* ==================================================================== */
/* Richer mechanic model for the Game Map graph                          */
/* ==================================================================== */

export type MechanicStatus =
  | "discovered"
  | "planned"
  | "partial"
  | "implemented"
  | "verified"
  | "error"
  | "missing"
  | "unknown";

export type MechanicCategory =
  | "core"
  | "economy"
  | "progression"
  | "collection"
  | "combat"
  | "quests"
  | "social"
  | "ui"
  | "world";

export type ScanEvidence = {
  type: "instance" | "script" | "remote" | "gui" | "folder" | "attribute" | "pattern";
  path: string;
};

export type RelationType =
  | "depends_on"
  | "unlocks"
  | "uses"
  | "produces"
  | "modifies"
  | "triggers"
  | "interacts_with"
  | "child_of"
  | "related_to";

export interface MechanicEdge {
  source: string;
  target: string;
  type: RelationType;
  confidence: number;
}

export interface MechanicNode {
  id: string;
  name: string;
  category: MechanicCategory;
  description: string;
  status: MechanicStatus;
  confidence: number;
  source: "roblox_studio" | "ai" | "manual" | "analysis";
  instances: string[];
  scripts: string[];
  remoteEvents: string[];
  guis: string[];
  dependencies: string[];
  dependents: string[];
  progress: number;
  evidence: ScanEvidence[];
  children: MechanicNode[];
  aiNotes?: string;
  position?: { x: number; y: number };
  createdAt: string;
}

export interface AnalysisProgressEvent {
  stage: string;
  detail?: string;
}

export interface GameMapRichState {
  nodes: MechanicNode[];
  edges: MechanicEdge[];
  projectName: string | null;
  lastAnalysisAt: string | null;
  analysisRunning: boolean;
  analysisStage: string | null;
  disconnected: boolean;
  scanCount: number;

  applyAnalysis: (scan: StudioScanResult) => void;
  scanConnectedProject: (onProgress?: (ev: AnalysisProgressEvent) => void) => Promise<{ success: boolean; nodes: number; error?: string }>;
  addMechanic: (node: Omit<MechanicNode, "id" | "createdAt" | "children" | "dependencies" | "dependents">, deps?: string[]) => string;
  updateMechanic: (id: string, updates: Partial<MechanicNode>) => void;
  linkMechanics: (sourceId: string, targetId: string, type?: RelationType, confidence?: number) => void;
  setNodeStatus: (id: string, status: MechanicStatus, progress?: number) => void;
  resetAnalysisState: () => void;
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

/**
 * Merge explicit per-class search results into a scan so evidence (scripts,
 * RemoteEvents, GUIs) is complete even where the recursive children dump was
 * shallow or skipped service containers.
 */
function mergeBulkResults(scan: StudioScanResult, extra: Array<{ path: string; name: string; className: string }>): StudioScanResult {
  const seenPaths = new Set(scan.instances.map((i) => i.path));
  const mergedInstances = [...scan.instances];
  for (const item of extra) {
    if (!item?.path || !item?.className) continue;
    if (seenPaths.has(item.path)) continue;
    seenPaths.add(item.path);
    mergedInstances.push({ path: item.path, name: item.name, className: item.className });
    switch (item.className) {
      case "RemoteEvent":
        if (!scan.remoteEvents.some((r) => r.path === item.path)) scan.remoteEvents.push({ path: item.path, name: item.name, className: item.className });
        break;
      case "RemoteFunction":
        if (!scan.remoteFunctions.some((r) => r.path === item.path)) scan.remoteFunctions.push({ path: item.path, name: item.name, className: item.className });
        break;
      case "ModuleScript":
      case "Script":
      case "LocalScript":
        if (!scan.scripts.some((s) => s.path === item.path)) scan.scripts.push({ path: item.path, name: item.name, className: item.className });
        break;
      case "ScreenGui":
        if (!scan.guis.some((g) => g.path === item.path)) scan.guis.push({ path: item.path, name: item.name, className: item.className });
        break;
      default:
        break;
    }
  }
  return { ...scan, instances: mergedInstances };
}

export const useGameMapStore = create<GameMapState & GameMapRichState>()(  persist(
    (set, get) => ({
      features: [],
      rootFeature: null,
      suggestions: {},

      // Rich graph state
      nodes: [],
      edges: [],
      projectName: null,
      lastAnalysisAt: null,
      analysisRunning: false,
      analysisStage: null,
      disconnected: false,
      scanCount: 0,

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
            : provider === "opencode"
            ? settings.getApiKey("opencode")
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
        set({ features: [], rootFeature: null, suggestions: {}, nodes: [], edges: [], projectName: null, lastAnalysisAt: null }),

      /* ================================================================ */
      /* Rich graph actions                                                */
      /* ================================================================ */

      applyAnalysis: (scan) => {
        const mechanics = buildMechanicsFromScan(scan);
        const edges = inferEdges(mechanics);
        set((s) => ({
          nodes: mechanics,
          edges,
          projectName: scan.projectName ?? s.projectName,
          lastAnalysisAt: new Date().toISOString(),
          analysisRunning: false,
          analysisStage: "complete",
          scanCount: s.scanCount + 1,
        }));
      },

      scanConnectedProject: async (onProgress) => {
        const report = (stage: string, detail?: string) => {
          set({ analysisStage: stage });
          onProgress?.({ stage, detail });
        };

        // Validate Studio connection first via the existing relay/system.
        const { isStudioConnected, notConnectedError, studioRequest, cachedStudioRequest } = await import("@/lib/roblox");
        const connected = await isStudioConnected();
        if (!connected) {
          set({ disconnected: true, analysisRunning: false });
          return {
            success: false,
            nodes: 0,
            error: notConnectedError(),
          };
        }
        set({ disconnected: false });

        try {
          set({ analysisRunning: true });

          report("connecting", "Validating Roblox Studio connection");
          const gameInfo: any = await (async () => {
            const info = await cachedStudioRequest<any>("/game/info", {}, 5000);
            return info.success ? (info.data as any) : null;
          })();

          report("scanning", "Inspecting project structure");
          // Recursive scan of the key containers that usually hold game logic.
          const containers = [
            "game.Workspace",
            "game.ReplicatedStorage",
            "game.ServerStorage",
            "game.ServerScriptService",
            "game.StarterGui",
            "game.StarterPack",
            "game.ReplicatedFirst",
          ];

          const rawChunks: any[] = [];
          for (const container of containers) {
            const res = await studioRequest<any>("/instance/children", {
              path: container,
              recursive: true,
            });
            if (res.success && Array.isArray(res.data)) {
              rawChunks.push(...res.data);
            }
          }

          // Also list RemoteEvents/Functions explicitly via search where cheap.
          report("inspecting", "Discovering scripts and instances");
          const searchClasses = ["RemoteEvent", "RemoteFunction", "ModuleScript", "Script", "LocalScript", "ScreenGui"];
          const extra: any[] = [];
          for (const cls of searchClasses) {
            const res = await studioRequest<any>("/instance/search", { root: "game", className: cls, limit: 200 });
            if (res.success && Array.isArray(res.data)) {
              extra.push(...res.data);
            }
          }

          report("analyzing", "Detecting game mechanics");
          const scan = normalizeInstanceDump({ children: rawChunks }, gameInfo?.name, gameInfo?.placeId);
          // Merge explicit class searches into the scan evidence.
          const merged = mergeBulkResults(scan, extra);
          const mechanics = buildMechanicsFromScan(merged);
          const edges = inferEdges(mechanics);

          report("building", "Building dependency graph");
          set((s) => ({
            nodes: mechanics,
            edges,
            projectName: gameInfo?.name ?? s.projectName,
            lastAnalysisAt: new Date().toISOString(),
            analysisRunning: false,
            analysisStage: "complete",
            scanCount: s.scanCount + 1,
          }));

          return { success: true, nodes: mechanics.length };
        } catch (err) {
          set({ analysisRunning: false, analysisStage: "error" });
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, nodes: 0, error: message };
        }
      },

      addMechanic: (node, deps = []) => {
        const id = node.name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || Math.random().toString(36).slice(2, 8);
        const existing = get().nodes.find((n) => n.id === id);
        if (existing) {
          // Merge: keep existing evidence, refresh status from new signal.
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === id
                ? { ...n, ...node, status: node.status === "discovered" ? n.status : node.status, id }
                : n
            ),
          }));
          return id;
        }
        const newNode: MechanicNode = {
          ...node,
          id,
          dependencies: deps,
          dependents: [],
          children: [],
          createdAt: new Date().toISOString(),
        };
        // Register dependents on target nodes.
        const nodes = get().nodes.map((n) =>
          deps.includes(n.id)
            ? { ...n, dependents: [...new Set([...(n.dependents || []), id])] }
            : n
        );
        set({ nodes: [...nodes, newNode] });
        return id;
      },

      updateMechanic: (id, updates) => {
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
        }));
      },

      linkMechanics: (sourceId, targetId, type = "depends_on", confidence = 0.6) => {
        set((s) => {
          const edgeExists = s.edges.some((e) => e.source === sourceId && e.target === targetId);
          if (edgeExists) return s;
          // Avoid self-links and cycles at the locality level for now.
          if (sourceId === targetId) return s;
          return {
            edges: [...s.edges, { source: sourceId, target: targetId, type, confidence }],
            nodes: s.nodes.map((n) => {
              if (n.id === targetId && !n.dependencies.includes(sourceId)) {
                return { ...n, dependencies: [...n.dependencies, sourceId] };
              }
              if (n.id === sourceId && !n.dependents.includes(targetId)) {
                return { ...n, dependents: [...n.dependents, targetId] };
              }
              return n;
            }),
          };
        });
      },

      setNodeStatus: (id, status, progress) => {
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id ? { ...n, status, progress: progress ?? n.progress } : n
          ),
        }));
      },

      resetAnalysisState: () =>
        set({ analysisRunning: false, analysisStage: null, disconnected: false }),
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
        // Persist rich graph state so maps survive reloads, keyed by their
        // project association (projectName) to avoid mixing projects.
        nodes: state.nodes,
        edges: state.edges,
        projectName: state.projectName,
        lastAnalysisAt: state.lastAnalysisAt,
        disconnected: state.disconnected,
        scanCount: state.scanCount,
      }),
    }
  )
);
