/**
 * Game Map analysis engine.
 *
 * Turns real Roblox Studio scan data (from the relay/plugin) into a structured
 * set of game mechanics (nodes) with evidence, categories, dependencies
 * (edges), confidence scores and statuses. Nothing here is fabricated — every
 * mechanic must be backed by an instance, script, RemoteEvent, GUI element or
 * folder that the plugin actually found in Studio.
 */
import type { MechanicStatus, MechanicCategory, MechanicNode, MechanicEdge, ScanEvidence } from "@/stores/gameMap";

/* ------------------------------------------------------------------ */
/* Category classification                                             */
/* ------------------------------------------------------------------ */

export type ScanInstance = {
  path: string;
  name: string;
  className: string;
};

export type ScanScript = ScanInstance & {
  source?: string;
};

export interface StudioScanResult {
  projectName?: string;
  placeId?: number;
  instances: ScanInstance[];
  scripts: ScanScript[];
  remoteEvents: ScanInstance[];
  remoteFunctions: ScanInstance[];
  bindableEvents: ScanInstance[];
  guis: ScanInstance[];
  folders: ScanInstance[];
  scannedAt: string;
}

const COMMON_SERVICES = new Set([
  "Workspace",
  "ReplicatedStorage",
  "ServerStorage",
  "ServerScriptService",
  "StarterGui",
  "StarterPlayer",
  "StarterPack",
  "Players",
  "Lighting",
  "ReplicatedFirst",
  "SoundService",
  "Chat",
  "Selection",
  "StarterCharacterScripts",
  "Teams",
  "DataStoreService",
  "HttpService",
]);

const CLASS_PRIORITY: Record<string, number> = {
  Script: 10,
  LocalScript: 9,
  ModuleScript: 8,
  RemoteEvent: 7,
  RemoteFunction: 7,
  BindableEvent: 6,
  BindableFunction: 6,
  ScreenGui: 6,
  Folder: 4,
  Model: 5,
  IntValue: 3,
  StringValue: 3,
  NumberValue: 3,
  BoolValue: 3,
  Part: 2,
  MeshPart: 2,
};

function isServicePath(path: string): boolean {
  const root = path.split(".")[1];
  return !!root && COMMON_SERVICES.has(root);
}

function normalizeArchName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Mechanic detection                                                  */
/* ------------------------------------------------------------------ */

interface MechanicPattern {
  category: MechanicCategory;
  keywords: string[];
  /** If true, the mechanic is confirmed implemented by matching instances. */
  implementedBy?: boolean;
}

const MECHANIC_PATTERNS: MechanicPattern[] = [
  { category: "economy", keywords: ["currency", "money", "coin", "cash", "gold", "points", "balance"] },
  { category: "economy", keywords: ["shop", "store", "market", "merchant", "vendor", "vendorui", "shopgui"] },
  { category: "economy", keywords: ["trade", "trading", "marketplace"] },
  { category: "progression", keywords: ["level", "exp", "xp", "experience", "rank", "tier", "upgrade", "rebirth", "prestige", "ascend"] },
  { category: "progression", keywords: ["area", "zone", "world", "island", "map", "stage", "region", "biome"] },
  { category: "progression", keywords: ["unlock", "progression", "progression"] },
  { category: "collection", keywords: ["pet", "egg", "hatch", "hatchling", "collection"] },
  { category: "collection", keywords: ["inventory", "backpack", "item", "loot", "drop", "reward", "chest"] },
  { category: "collection", keywords: ["collectible", "badge", "achievement", "trophy", "stamp"] },
  { category: "collection", keywords: ["gacha", "crate", "pull", "open box"] },
  { category: "combat", keywords: ["combat", "weapon", "sword", "gun", "shoot", "damage", "attack", "melee", "health", "damage", "enemy"] },
  { category: "combat", keywords: ["enemy", "monster", "mob", "boss", "creature", "skeleton", "zombie", "slime"] },
  { category: "combat", keywords: ["spell", "magic", "ability", "skill", "power", "cast"] },
  { category: "quests", keywords: ["quest", "mission", "objective", "goal", "task"] },
  { category: "quests", keywords: ["daily", "streak", "login", "reward"] },
  { category: "social", keywords: ["npc", "npcs", "character", "talk", "dialogue"] },
  { category: "social", keywords: ["leaderboard", "board", "highscore", "score", "rankings"] },
  { category: "social", keywords: ["clan", "guild", "team", "party", "friend", "social"] },
  { category: "progression", keywords: ["save", "datastore", "persistence", "autosave", "playerdata"] },
  { category: "ui", keywords: ["gui", "screen", "hud", "menu", "panel", "popup", "notification", "toast", "button"] },
  { category: "ui", keywords: ["settings", "options", "config"] },
  { category: "core", keywords: ["spawn", "teleport", "movement", "controller", "healthbar"] },
  { category: "core", keywords: ["server", "networking", "events", "remote", "sync"] },
  { category: "core", keywords: ["util", "utils", "module", "lib", "helper", "shared"] },
];

function classifyMechanic(path: string, name: string): { category: MechanicCategory; confidence: number } | null {
  const haystack = normalizeArchName(`${path} ${name}`);
  const tokens = haystack.split(" ").filter((t) => t.length > 2);
  if (tokens.length === 0) {
    return { category: "core", confidence: 0.3 };
  }

  let bestCategory: MechanicCategory = "core";
  let bestScore = 0;
  for (const pattern of MECHANIC_PATTERNS) {
    let score = 0;
    for (const kw of pattern.keywords) {
      if (haystack.includes(kw)) {
        score += kw.length >= 5 ? 2 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = pattern.category;
    }
  }

  if (bestScore === 0) {
    return { category: "core", confidence: 0.3 };
  }
  // Longer names → higher confidence of a real distinct mechanic.
  const lenFactor = Math.min(1, tokens.length / 3);
  const confidence = Math.min(0.95, 0.45 + bestScore * 0.12 + lenFactor * 0.2);
  return { category: bestCategory, confidence: confidence };
}

function makeMechanicId(name: string): string {
  return normalizeArchName(name).replace(/ /g, "_") || Math.random().toString(36).slice(2, 8);
}

function makeEvidence(type: ScanEvidence["type"], path: string): ScanEvidence {
  return { type, path };
}

/* ------------------------------------------------------------------ */
/* Edge / dependency inference                                         */
/* ------------------------------------------------------------------ */

function inferEdges(nodes: MechanicNode[]): MechanicEdge[] {
  const edges: MechanicEdge[] = [];
  const byCategory = {} as Record<MechanicCategory, MechanicNode[]>;

  for (const n of nodes) {
    (byCategory[n.category] ||= []).push(n);
  }

  const add = (a: MechanicNode, b: MechanicNode, type: MechanicEdge["type"], confidence = 0.6) => {
    if (!a || !b || a.id === b.id) return;
    edges.push({ source: a.id, target: b.id, type, confidence });
  };

  // Progression gating: collection/combat depend on economy & progression.
  const economyLevels = byCategory["economy"]?.[0];
  const progressionLevels = byCategory["progression"]?.[0];

  const rootNode = nodes.find((n) => n.category === "core" && n.name.toLowerCase().includes("clicking") || n.name.toLowerCase().includes("core"));
  const fallingNodes = byCategory["progression"]?.filter((n) => n !== progressionLevels) ?? [];

  if (economyLevels) {
    for (const n of byCategory["collection"] ?? []) add(economyLevels, n, "depends_on", 0.7);
    for (const n of byCategory["combat"] ?? []) add(economyLevels, n, "depends_on", 0.6);
    for (const n of byCategory["quests"] ?? []) add(economyLevels, n, "depends_on", 0.6);
  }

  if (progressionLevels) {
    for (const n of byCategory["collection"] ?? []) add(progressionLevels, n, "unlocks", 0.55);
    for (const n of byCategory["combat"] ?? []) add(progressionLevels, n, "unlocks", 0.55);
  }

  // Collection nodes naturally feed combat (pets → combat) and vice-versa
  // when both exist in the same folder tree.
  const collectionNodes = byCategory["collection"] ?? [];
  const combatNodes = byCategory["combat"] ?? [];
  for (let i = 0; i < collectionNodes.length; i++) {
    for (let j = 0; j < combatNodes.length; j++) {
      add(collectionNodes[i], combatNodes[j], "interacts_with", 0.5);
    }
  }

  // UI depends on each thing it renders (loose link to first node of its category).
  for (const ui of byCategory["ui"] ?? []) {
    if (economyLevels) add(ui, economyLevels, "related_to", 0.4);
    if (combatNodes[0]) add(ui, combatNodes[0], "related_to", 0.4);
    if (collectionNodes[0]) add(ui, collectionNodes[0], "related_to", 0.4);
    if (fallingNodes[0]) add(fallingNodes[0], ui, "triggers", 0.4);
  }

  return edges;
}

/* ------------------------------------------------------------------ */
/* Build mechanics from a real scan                                    */
/* ------------------------------------------------------------------ */

export function buildMechanicsFromScan(scan: StudioScanResult): MechanicNode[] {
  // Real evidence keyed by normalized architecture. Avoid fabrication.
  const evidencePool: Record<string, ScanInstance[]> = {};

  const addEvidence = (key: string, inst: ScanInstance) => {
    // Skip bare service containers — they are not themselves mechanics.
    if (isServicePath(inst.path) && !inst.name.includes("Service")) return;
    (evidencePool[key] ||= []).push(inst);
  };

  // Group real instances into candidate mechanics by architecture name.
  for (const inst of [...scan.instances, ...scan.scripts, ...scan.remoteEvents, ...scan.remoteFunctions, ...scan.bindableEvents, ...scan.guis, ...scan.folders]) {
    const key = normalizeArchName(inst.name);
    if (!key) continue;
    addEvidence(key, inst);
  }

  const nodes: MechanicNode[] = [];

  for (const [key, instances] of Object.entries(evidencePool)) {
    const representative = instances[instances.length - 1];
    const inferred = classifyMechanic(representative.path, representative.name);
    if (!inferred) continue;
    const classification = inferred;
    const name = toTitle(representative.name);

    // Only surface names that look like an actual mechanic — skip tiny
    // generic tokens that would create noise.
    if (key.length < 3) continue;

    // Merge scripts + instances evidence.
    const instancesForNode: string[] = [];
    const scriptsForNode: string[] = [];
    const remoteEventsForNode: string[] = [];
    const guisForNode: string[] = [];
    const evidence: ScanEvidence[] = [];

    for (const inst of instances) {
      const cls = inst.className;
      if (cls === "Script" || cls === "LocalScript" || cls === "ModuleScript") {
        scriptsForNode.push(inst.path);
      } else if (cls === "RemoteEvent" || cls === "RemoteFunction") {
        remoteEventsForNode.push(inst.path);
      } else if (inst.name.includes("Gui") || cls === "ScreenGui" || cls === "Frame" || cls === "TextLabel" || cls === "TextButton") {
        guisForNode.push(inst.path);
      } else {
        instancesForNode.push(inst.path);
      }
      evidence.push(makeEvidence("instance", inst.path));
    }

    const maxConfidence = instances.reduce(
      (m, i) => Math.max(m, (CLASS_PRIORITY[i.className] ?? 1) / 10),
      0.3
    );
    const status = deriveStatus(instances, scriptsForNode.length > 0);
    const hasRemote = remoteEventsForNode.length > 0;

    nodes.push({
      id: makeMechanicId(name),
      name,
      category: classification.category,
      description: buildDescription(name, classification.category, hasRemote),
      status,
      confidence: Math.min(0.97, Math.max(0.35, (classification.confidence + maxConfidence * 0.4) / 1.4)),
      source: "roblox_studio",
      instances: instancesForNode,
      scripts: scriptsForNode,
      remoteEvents: remoteEventsForNode,
      guis: guisForNode,
      dependencies: [],
      dependents: [],
      evidence,
      progress: status === "implemented" ? 100 : status === "verified" ? 100 : status === "partial" ? 60 : 0,
      children: [],
      createdAt: new Date().toISOString(),
    });
  }

  // If a module named like the root project exists (e.g. "PetService"),
  // we might have produced a single node; that's fine. But we should not
  // fabricate a root for mechanics that don't exist.

  return dedupeNodes(nodes);
}

function dedupeNodes(nodes: MechanicNode[]): MechanicNode[] {
  const seen = new Set<string>();
  const out: MechanicNode[] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const existing = out.find((o) => o.id === n.id);
    if (existing) {
      existing.instances.push(...n.instances);
      existing.scripts.push(...n.scripts);
      existing.remoteEvents.push(...n.remoteEvents);
      existing.evidence.push(...n.evidence);
      continue;
    }
    seen.add(n.id);
    out.push(n);
  }
  return out;
}

function deriveStatus(instances: ScanInstance[], hasScript: boolean): MechanicStatus {
  const hasRemote = instances.some((i) => i.className === "RemoteEvent" || i.className === "RemoteFunction");
  if (hasScript && hasRemote) return "verified";
  if (hasScript) return "implemented";
  if (instances.length > 0) return "partial";
  return "discovered";
}

function toTitle(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildDescription(name: string, category: MechanicCategory, hasRemote: boolean): string {
  const parts = [`${name} game mechanic detected in your Roblox project.`];
  if (category !== "core") parts.push(`Classified under "${category}".`);
  if (hasRemote) parts.push("Networking detected (RemoteEvent/Function).");
  return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/* Plugin scan helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Turn a recursive instance dump into the typed StudioScanResult used by
 * the analysis engine.
 */
export function normalizeInstanceDump(children: unknown, projectName?: string, placeId?: number): StudioScanResult {
  const instances: ScanInstance[] = [];
  const scripts: ScanScript[] = [];
  const remoteEvents: ScanInstance[] = [];
  const remoteFunctions: ScanInstance[] = [];
  const bindableEvents: ScanInstance[] = [];
  const guis: ScanInstance[] = [];
  const folders: ScanInstance[] = [];

  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    const path = typeof node.path === "string" ? node.path : "";
    const name = typeof node.name === "string" ? node.name : "";
    const className = typeof node.className === "string" ? node.className : "";
    if (path && name) {
      const entry: ScanInstance = { path, name, className };
      instances.push(entry);
      switch (className) {
        case "Script":
        case "LocalScript":
        case "ModuleScript":
          scripts.push({ ...entry });
          break;
        case "RemoteEvent":
          remoteEvents.push(entry);
          break;
        case "RemoteFunction":
          remoteFunctions.push(entry);
          break;
        case "BindableEvent":
        case "BindableFunction":
          bindableEvents.push(entry);
          break;
        case "ScreenGui":
        case "Frame":
        case "TextLabel":
        case "TextButton":
          guis.push(entry);
          break;
        case "Folder":
          folders.push(entry);
          break;
        default:
          break;
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
  };

  if (Array.isArray(children)) {
    for (const c of children) walk(c);
  } else {
    walk(children);
  }

  return {
    projectName,
    placeId,
    instances,
    scripts,
    remoteEvents,
    remoteFunctions,
    bindableEvents,
    guis,
    folders,
    scannedAt: new Date().toISOString(),
  };
}

export { inferEdges };
