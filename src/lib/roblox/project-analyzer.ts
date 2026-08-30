/**
 * Roblox Project Scanner & Analyzer
 *
 * Scans a connected Roblox Studio project and builds an understanding of:
 *   - Existing systems (services, remotes, GUIs, NPCs)
 *   - Architecture patterns
 *   - Asset inventory
 *   - Performance baseline
 *   - Potential gaps
 *
 * Used by the agent to avoid duplicating work and understand context.
 */

export interface ProjectSystemInfo {
  name: string;
  description: string;
  location: string;
  type: "Service" | "Remote" | "GUI" | "NPC" | "Mechanic" | "System";
  dependencies: string[];
  lastModified?: string;
  status: "active" | "unused" | "incomplete" | "experimental";
}

export interface ProjectArchitectureAnalysis {
  projectName: string;
  placeId: number;
  universeId: number;
  creatorName: string;
  playerCount: number;

  // Systems found
  systems: ProjectSystemInfo[];

  // Architecture patterns detected
  patterns: {
    hasModularServices: boolean;
    hasRemoteArchitecture: boolean;
    usesCollectionService: boolean;
    usesTags: boolean;
    hasDataStores: boolean;
    hasMemoryStore: boolean;
    hasUI: boolean;
    hasNPCs: boolean;
    hasCombat: boolean;
  };

  // Inventory
  scripts: {
    serverScripts: number;
    clientScripts: number;
    modules: number;
    unknown: number;
  };

  remotes: {
    events: number;
    functions: number;
  };

  guis: {
    screenGuis: number;
    billboardGuis: number;
    surfaceGuis: number;
  };

  models: {
    parts: number;
    meshParts: number;
    models: number;
    terrain: boolean;
  };

  // Analysis summary
  gaps: string[]; // Systems that might be missing
  recommendations: string[]; // What to build next
}

export interface ProjectSystemNode {
  id: string;
  name: string;
  category: string;
  description?: string;
  path?: string;
  dependencies: string[];
}

// ============================================================================
// Scanner API
// ============================================================================

/**
 * Analyze a project for common systems and patterns.
 * This FAST scan identifies key systems without deep inspection.
 */
export async function analyzeProjectFast(
  // This would call into Roblox tools
  gameInfo: {
    name: string;
    placeId: number;
    universeId: number;
    creatorName: string;
    playerCount: number;
  }
): Promise<ProjectArchitectureAnalysis> {
  // In a real implementation, this would:
  // 1. Scan ReplicatedStorage for ModuleScripts
  // 2. Check ServerScriptService for services
  // 3. Scan for common remote patterns (InventoryRemote, CombatRemote, etc.)
  // 4. Look in StarterGui for UI systems
  // 5. Check Workspace for NPC folders
  // 6. Detect patterns from naming conventions

  return {
    projectName: gameInfo.name,
    placeId: gameInfo.placeId,
    universeId: gameInfo.universeId,
    creatorName: gameInfo.creatorName,
    playerCount: gameInfo.playerCount,
    systems: [],
    patterns: {
      hasModularServices: false,
      hasRemoteArchitecture: false,
      usesCollectionService: false,
      usesTags: false,
      hasDataStores: false,
      hasMemoryStore: false,
      hasUI: false,
      hasNPCs: false,
      hasCombat: false,
    },
    scripts: { serverScripts: 0, clientScripts: 0, modules: 0, unknown: 0 },
    remotes: { events: 0, functions: 0 },
    guis: { screenGuis: 0, billboardGuis: 0, surfaceGuis: 0 },
    models: { parts: 0, meshParts: 0, models: 0, terrain: false },
    gaps: [],
    recommendations: [],
  };
}

/**
 * Deep scan of a specific system (e.g., "Combat", "Inventory", "Quests")
 * Reads source code, analyzes dependencies, identifies issues.
 */
export async function analyzeSystemDeep(
  systemName: string
  // would take tools context
): Promise<{
  name: string;
  components: string[];
  dependencies: string[];
  potentialIssues: string[];
  securityConcerns: string[];
  performanceNotes: string[];
}> {
  // In real implementation:
  // 1. Find the main module for this system
  // 2. Read its source code
  // 3. Parse require() calls to identify dependencies
  // 4. Check for common security issues (server validation, rate limiting)
  // 5. Identify potential performance problems

  return {
    name: systemName,
    components: [],
    dependencies: [],
    potentialIssues: [],
    securityConcerns: [],
    performanceNotes: [],
  };
}

// ============================================================================
// Common System Patterns
// ============================================================================

export const COMMON_SYSTEMS = {
  Inventory: {
    expectedLocation:
      "ReplicatedStorage/Services/InventoryService or ServerStorage/Services",
    remotes: ["InventoryRemote", "AddItemRemote", "RemoveItemRemote"],
    components: ["InventoryService (server)", "InventoryUI (client)"],
    dataStore: "player_inventory",
    dependencies: ["PlayerService", "DataStoreService"],
  },
  Combat: {
    expectedLocation: "ReplicatedStorage/Services/CombatService",
    remotes: ["AttackRemote", "DamageRemote", "DefenseRemote"],
    components: ["CombatService (server)", "CombatUI (client)", "Hitbox system"],
    dependencies: ["PlayerService", "DamageService"],
  },
  Quests: {
    expectedLocation: "ReplicatedStorage/Services/QuestService",
    remotes: ["AcceptQuestRemote", "CompleteQuestRemote"],
    components: [
      "QuestService (server)",
      "QuestUI (client)",
      "Objective tracking",
    ],
    dataStore: "player_quests",
    dependencies: ["PlayerService", "DataStoreService"],
  },
  Pets: {
    expectedLocation: "ReplicatedStorage/Services/PetService",
    remotes: ["SummonPetRemote", "DismissPetRemote"],
    components: ["PetService (server)", "Pet NPC controller", "PetUI (client)"],
    dataStore: "player_pets",
    dependencies: ["PlayerService", "NPCService"],
  },
  Shop: {
    expectedLocation: "ReplicatedStorage/Services/ShopService",
    remotes: ["PurchaseRemote", "GetShopItemsRemote"],
    components: ["ShopService (server)", "ShopUI (client)"],
    dependencies: ["PlayerService", "CurrencyService", "InventoryService"],
  },
  NPCs: {
    expectedLocation:
      "Workspace/NPCs or ServerStorage/NPCTemplates + NPCController",
    remotes: ["NPCInteractRemote", "NPCDialogRemote"],
    components: ["NPCController (server)", "NPC pathfinding", "Dialog UI"],
    dependencies: ["CollectionService", "PathfindingService"],
  },
  Progression: {
    expectedLocation: "ReplicatedStorage/Services/ProgressionService",
    remotes: ["LevelUpRemote", "RewardRemote"],
    components: [
      "ProgressionService (server)",
      "Leaderboard",
      "LevelUI (client)",
    ],
    dataStore: "player_progression",
    dependencies: ["PlayerService", "DataStoreService"],
  },
  Currency: {
    expectedLocation: "ReplicatedStorage/Services/CurrencyService",
    remotes: ["AddCurrencyRemote", "RemoveCurrencyRemote"],
    components: ["CurrencyService (server)", "CurrencyUI (client)"],
    dataStore: "player_currency",
    dependencies: ["PlayerService", "DataStoreService"],
  },
};

// ============================================================================
// Architecture Best Practices (Detection)
// ============================================================================

export const ARCHITECTURE_CHECKLIST = {
  serverStructure: [
    "ServerScriptService has one main bootstrap script (not dozens)",
    "Services are ModuleScripts in ReplicatedStorage/Services or ServerStorage/Services",
    "ServerScriptService loads services from modules, not inline scripts",
    "One service per file (single responsibility)",
  ],
  remoteArchitecture: [
    "RemoteEvents in ReplicatedStorage/Remotes (organized by feature)",
    "RemoteEvents are named clearly: {Feature}Remote or {Action}Remote",
    "Server validates EVERY argument received from client",
    "Client does not directly execute critical logic",
  ],
  persistence: [
    "DataStoreService used for durable player data",
    "Data schema is versioned (handle migrations)",
    "Load on join, save on leave",
    "Backup strategy for critical data",
  ],
  tagging: [
    "CollectionService used for behavioral tagging",
    "TaggedInstances centralized in one controller",
    "Not duplicating scripts across many instances",
  ],
  networking: [
    "RemoteFunction used sparingly (not for every query)",
    "RemoteEvent used for most fire-and-forget actions",
    "Rate limiting on exploitable actions (purchase, damage)",
  ],
  ui: [
    "GUI templates in StarterGui clone to each player",
    "Not hardcoding positions (using layouts)",
    "Responsive to different screen sizes",
    "Consistent styling across UI",
  ],
};

// ============================================================================
// Gap Detection
// ============================================================================

export function detectGaps(analysis: ProjectArchitectureAnalysis): string[] {
  const gaps: string[] = [];

  if (!analysis.patterns.hasDataStores && analysis.playerCount > 0) {
    gaps.push("No DataStores detected — player data may not persist on server restart");
  }

  if (!analysis.patterns.hasUI && analysis.systems.length === 0) {
    gaps.push("No UI systems found — game might be missing HUD/menus");
  }

  if (
    !analysis.patterns.hasRemoteArchitecture &&
    analysis.playerCount > 1
  ) {
    gaps.push("No clear remote architecture — multiplayer logic might be unsafe");
  }

  if (!analysis.patterns.hasModularServices) {
    gaps.push(
      "Services not modularized — code is probably monolithic; consider refactoring"
    );
  }

  if (
    analysis.patterns.hasCombat &&
    !analysis.systems.find((s) => s.name.includes("Combat"))
  ) {
    gaps.push("Combat detected but no dedicated CombatService — add server-authoritative system");
  }

  if (
    analysis.scripts.modules === 0 &&
    analysis.scripts.serverScripts > 3
  ) {
    gaps.push("Few ModuleScripts found — code duplication risk");
  }

  return gaps;
}

export function generateRecommendations(
  analysis: ProjectArchitectureAnalysis
): string[] {
  const recommendations: string[] = [];

  if (!analysis.patterns.hasDataStores) {
    recommendations.push("Add DataStoreService integration to persist player data");
  }

  if (!analysis.patterns.hasUI) {
    recommendations.push("Create a HUD/UI system with player stats and actions");
  }

  if (!analysis.patterns.hasModularServices) {
    recommendations.push("Refactor monolithic scripts into ModuleScript services");
  }

  if (analysis.remotes.events === 0 && analysis.playerCount > 0) {
    recommendations.push("Add RemoteEvents for client↔server communication");
  }

  if (!analysis.patterns.hasNPCs && analysis.playerCount > 0) {
    recommendations.push("Add NPCs with server-authoritative pathfinding");
  }

  return recommendations;
}

// ============================================================================
// Reuse Detection
// ============================================================================

/**
 * Suggest reusing existing systems instead of building new.
 */
export function suggestReusePatterns(
  userRequest: string,
  existingSystems: ProjectSystemInfo[]
): { suggestion: string; system: ProjectSystemInfo }[] {
  const suggestions: { suggestion: string; system: ProjectSystemInfo }[] = [];

  const requestLower = userRequest.toLowerCase();

  // Check for common patterns
  if (
    requestLower.includes("inventory") ||
    requestLower.includes("item")
  ) {
    const inventory = existingSystems.find((s) => s.name.includes("Inventory"));
    if (inventory) {
      suggestions.push({
        suggestion:
          "Inventory system already exists — add new item type to it",
        system: inventory,
      });
    }
  }

  if (requestLower.includes("damage") || requestLower.includes("combat")) {
    const combat = existingSystems.find((s) => s.name.includes("Combat"));
    if (combat) {
      suggestions.push({
        suggestion: "Combat system already exists — extend it for new mechanics",
        system: combat,
      });
    }
  }

  if (requestLower.includes("quest") || requestLower.includes("objective")) {
    const quest = existingSystems.find((s) => s.name.includes("Quest"));
    if (quest) {
      suggestions.push({
        suggestion: "Quest system already exists — add new quest types to it",
        system: quest,
      });
    }
  }

  if (requestLower.includes("money") || requestLower.includes("currency")) {
    const currency = existingSystems.find((s) =>
      s.name.includes("Currency")
    );
    if (currency) {
      suggestions.push({
        suggestion:
          "Currency system already exists — extend it if needed",
        system: currency,
      });
    }
  }

  return suggestions;
}

// ============================================================================
// Project Insight Summary
// ============================================================================

export function summarizeProject(analysis: ProjectArchitectureAnalysis): string {
  return `
PROJECT: ${analysis.projectName} (Place #${analysis.placeId})
Created by: ${analysis.creatorName}
Current Players: ${analysis.playerCount}

SYSTEMS DETECTED (${analysis.systems.length}):
${analysis.systems.map((s) => `  • ${s.name} (${s.type}) @ ${s.location}`).join("\n")}

ARCHITECTURE:
  • Modular Services: ${analysis.patterns.hasModularServices ? "✓" : "✗"}
  • Remote Architecture: ${analysis.patterns.hasRemoteArchitecture ? "✓" : "✗"}
  • CollectionService: ${analysis.patterns.usesCollectionService ? "✓" : "✗"}
  • DataStores: ${analysis.patterns.hasDataStores ? "✓" : "✗"}
  • UI Systems: ${analysis.patterns.hasUI ? "✓" : "✗"}
  • NPCs: ${analysis.patterns.hasNPCs ? "✓" : "✗"}
  • Combat: ${analysis.patterns.hasCombat ? "✓" : "✗"}

CODE INVENTORY:
  • Server Scripts: ${analysis.scripts.serverScripts}
  • Client Scripts: ${analysis.scripts.clientScripts}
  • Modules: ${analysis.scripts.modules}
  • RemoteEvents: ${analysis.remotes.events}
  • RemoteFunctions: ${analysis.remotes.functions}

POTENTIAL ISSUES (${analysis.gaps.length}):
${analysis.gaps.map((g) => `  ⚠ ${g}`).join("\n")}

NEXT STEPS (${analysis.recommendations.length}):
${analysis.recommendations.map((r) => `  → ${r}`).join("\n")}
`;
}
