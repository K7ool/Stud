/**
 * Roblox Knowledge & Documentation Layer
 *
 * Provides structured access to official Roblox API documentation,
 * best practices, and verified information. This is the single source of truth
 * for Roblox-specific knowledge retrieval.
 */

// ============================================================================
// Official Roblox API Reference (curated from Creator Hub)
// ============================================================================

export interface RobloxClass {
  name: string;
  description: string;
  superclass?: string;
  security: "None" | "PluginSecurity" | "LocalUserSecurity" | "RobloxSecurity";
  replicated: boolean;
  creatable: boolean;
  properties: Record<string, RobloxProperty>;
  methods: Record<string, RobloxMethod>;
  events: Record<string, RobloxEvent>;
}

export interface RobloxProperty {
  name: string;
  type: string;
  description: string;
  readOnly?: boolean;
  replicated?: boolean;
  security: string;
}

export interface RobloxMethod {
  name: string;
  description: string;
  parameters: Array<{ name: string; type: string }>;
  returns: string;
  yields: boolean;
  security: string;
}

export interface RobloxEvent {
  name: string;
  description: string;
  parameters: Array<{ name: string; type: string }>;
  security: string;
}

export interface RobloxService {
  name: string;
  description: string;
  access: "GetService" | "Plugin-only" | "LocalScript-only" | "GlobalService";
  priority: "core" | "gameplay" | "data" | "networking" | "ui" | "admin";
  documentation: string;
  commonUses: string[];
}

// ============================================================================
// Roblox Services Directory (Priority-ordered)
// ============================================================================

const ROBLOX_SERVICES: Record<string, RobloxService> = {
  // Core/Essential
  Players: {
    name: "Players",
    description:
      "Manages connected players and their characters. Authoritative source for player state.",
    access: "GetService",
    priority: "core",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/Players",
    commonUses: [
      "Track player joins/leaves",
      "Access player data",
      "Send remotes to clients",
      "Manage teams",
    ],
  },
  Workspace: {
    name: "Workspace",
    description: "The 3D world container. All physics bodies, NPCs, terrain, props.",
    access: "GlobalService",
    priority: "core",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/Workspace",
    commonUses: [
      "Place parts/models",
      "Query terrain",
      "Physics queries (raycasts)",
      "Organize game objects",
    ],
  },
  ServerScriptService: {
    name: "ServerScriptService",
    description: "Container for server-side scripts. Entry point for server logic.",
    access: "GlobalService",
    priority: "core",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/ServerScriptService",
    commonUses: [
      "Load server services",
      "Initialize game state",
      "Start event loops",
    ],
  },
  StarterGui: {
    name: "StarterGui",
    description: "Container for client-side UI. ScreenGuis here clone to each player.",
    access: "GlobalService",
    priority: "ui",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/StarterGui",
    commonUses: [
      "Create HUDs",
      "Display inventory UI",
      "Chat bubbles",
      "Admin panels",
    ],
  },
  ReplicatedStorage: {
    name: "ReplicatedStorage",
    description:
      "Shared folder for ModuleScripts, configs, and assets visible to both server and clients.",
    access: "GlobalService",
    priority: "core",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/ReplicatedStorage",
    commonUses: [
      "Store ModuleScripts (utilities, services)",
      "Store RemoteEvents/RemoteFunctions",
      "Shared configuration",
      "Shared assets",
    ],
  },
  ServerStorage: {
    name: "ServerStorage",
    description: "Private folder for server-only ModuleScripts and data.",
    access: "GlobalService",
    priority: "core",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/ServerStorage",
    commonUses: [
      "Server-only services",
      "Server-only config",
      "Templates for cloning",
    ],
  },

  // Gameplay
  RunService: {
    name: "RunService",
    description: "Event-driven scheduling (Heartbeat, RenderStepped, PreRender).",
    access: "GetService",
    priority: "gameplay",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/RunService",
    commonUses: [
      "Animation loops",
      "Physics updates",
      "Input polling",
      "Per-frame calculations",
    ],
  },
  UserInputService: {
    name: "UserInputService",
    description: "Keyboard, mouse, gamepad input on clients. Server cannot access.",
    access: "LocalScript-only",
    priority: "gameplay",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/UserInputService",
    commonUses: ["Movement controls", "Ability activation", "UI interaction"],
  },
  TweenService: {
    name: "TweenService",
    description: "Smooth animations of properties over time.",
    access: "GetService",
    priority: "gameplay",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/TweenService",
    commonUses: [
      "UI transitions (0.15–0.35s typical)",
      "Part movements",
      "Color fades",
    ],
  },
  Debris: {
    name: "Debris",
    description: "Schedule instances to be destroyed after a delay.",
    access: "GetService",
    priority: "gameplay",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/Debris",
    commonUses: [
      "Auto-cleanup (projectiles, effects)",
      "Temporary decals",
    ],
  },

  // Data & Persistence
  DataStoreService: {
    name: "DataStoreService",
    description:
      "Durable key-value storage across server restarts. Authoritative for player data.",
    access: "GetService",
    priority: "data",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/DataStoreService",
    commonUses: [
      "Save player inventory",
      "Track progression",
      "Store game state",
      "Leaderboard data",
    ],
  },
  MemoryStoreService: {
    name: "MemoryStoreService",
    description:
      "Temporary high-throughput storage in-memory. Not persistent. Great for cross-server state.",
    access: "GetService",
    priority: "data",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/MemoryStoreService",
    commonUses: [
      "Session data",
      "Cross-server communication",
      "High-frequency updates",
    ],
  },

  // Networking
  RemoteEvent: {
    name: "RemoteEvent",
    description:
      "Fire-and-forget one-way communication. Async, no return value. Preferred for most use cases.",
    access: "GetService",
    priority: "networking",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/RemoteEvent",
    commonUses: [
      "Movement updates",
      "Attack commands",
      "Chat messages",
      "Event notifications",
    ],
  },
  RemoteFunction: {
    name: "RemoteFunction",
    description:
      "Request/response communication. Sync call, yields until response. Use sparingly.",
    access: "GetService",
    priority: "networking",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/RemoteFunction",
    commonUses: [
      "Queries (get player level)",
      "Authorization checks",
      "Purchase confirmations",
    ],
  },

  // Utilities
  CollectionService: {
    name: "CollectionService",
    description:
      "Tag-based organization. Link behavior to many instances without duplicating scripts.",
    access: "GetService",
    priority: "gameplay",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/CollectionService",
    commonUses: [
      "Door behavior (multiple doors, one script)",
      "Enemy tagging",
      "Interactable marking",
      "Damageable identification",
    ],
  },
  HttpService: {
    name: "HttpService",
    description: "Make HTTP requests from server. Used for external APIs.",
    access: "GetService",
    priority: "gameplay",
    documentation:
      "https://create.roblox.com/docs/reference/engine/classes/HttpService",
    commonUses: [
      "Analytics",
      "Discord webhooks",
      "Custom backend calls",
    ],
  },
};

// ============================================================================
// Luau/Roblox Best Practices
// ============================================================================

export const LUAU_BEST_PRACTICES = {
  scheduling: {
    preferred: "task.wait(), task.spawn(), task.delay(), task.defer()",
    deprecated: "wait(), spawn()",
    guidance:
      "Always use task.* over legacy wait/spawn. task.* is more performant and debuggable.",
  },
  scope: {
    rule: "Prefer local scope. Global state leads to conflicts and hard-to-debug issues.",
    pattern:
      "local var = 5 -- always local\nlocal function helper() end -- helper functions are local",
    anti: "Avoid _G, shared across scripts. Only use for intentional globals with namespacing.",
  },
  typing: {
    rule: "Use type annotations where useful, especially for function signatures.",
    example: `
local function calculateDamage(attacker: Model, target: Model, damage: number): number
  return damage * 1.5
end`,
    note: "Strict mode recommended for new code: --!strict",
  },
  modules: {
    rule: "Prefer ModuleScripts for shared logic. One responsibility per module.",
    pattern: `
-- ReplicatedStorage/Modules/InventoryService
local InventoryService = {}

function InventoryService:AddItem(player, itemId)
  -- ...
end

return InventoryService`,
  },
  error_handling: {
    rule: "Wrap risky operations in pcall. Return error codes or throw early.",
    pattern: `
local success, result = pcall(function()
  return risky_operation()
end)
if not success then
  warn("Operation failed:", result)
  return nil
end`,
  },
  early_returns: {
    rule: "Exit functions early. Reduces nesting and improves readability.",
    good: `
function validate(data)
  if not data then return nil end
  if not data.name then return nil end
  if #data.name < 3 then return nil end
  -- real logic
end`,
    bad: `
function validate(data)
  if data and data.name and #data.name >= 3 then
    -- deeply nested real logic
  end
end`,
  },
  naming: {
    rule: "Use PascalCase for classes/services, camelCase for functions/variables.",
    example:
      "local PlayerService = {} -- class\nlocal function getPlayerData() -- function",
  },
};

// ============================================================================
// Common Architecture Patterns
// ============================================================================

export const ARCHITECTURE_PATTERNS = {
  serverAuthority: `
Server OWNS game state: health, inventory, position, permissions.
Client CAN: request, display, animate, predict.
Client CANNOT: change server state directly. Always validate on server.

Pattern:
  Client → RemoteEvent → Server (validate + execute) → return result
  Server NEVER trusts client-provided critical values.`,

  modularServices: `
Each game system → ModuleScript service.
Example: InventoryService, CombatService, QuestService.

Structure:
  ReplicatedStorage/
    Services/
      InventoryService.lua
      CombatService.lua
    Remotes/
      InventoryRemote (RemoteEvent/RemoteFunction pairs)`,

  clientServerRemotes: `
Use RemoteEvent for most communication (async, one-way).
Use RemoteFunction ONLY when you need request/response.

RemoteEvent pattern (preferred):
  Client:FireServer(data)
  Server:OnServerEvent(player, data) → validate, apply, broadcast result

RemoteFunction pattern (rare):
  Server:InvokeClient(player, query) → blocks client until response`,

  tagBasedBehavior: `
Tag many instances with same behavior.
One centralized script listens to tagged instances.

Example:
  Tag all doors "InteractableDoor"
  CollectionService:GetTagged("InteractableDoor") → loop over all
  Add common behavior without duplicating scripts`,

  dataContainers: `
Separate concerns:
  ServerStorage/ → server-only config, templates
  ReplicatedStorage/ → shared config, ModuleScripts
  Workspace/ → public game objects (players see these)
  StarterGui/ → client-side UI templates`,
};

// ============================================================================
// Security Checklist (Multiplayer)
// ============================================================================

export const SECURITY_CHECKLIST = [
  "✓ Server validates EVERY RemoteEvent/RemoteFunction argument",
  "✓ Currency/inventory changes originate from server only",
  "✓ No arbitrary instance path execution from clients (sanitize)",
  "✓ Ownership checks before allowing player to modify another's data",
  "✓ Rate limits on exploitable actions (purchase, trade, damage)",
  "✓ Server tracks authoritative position for PVP/collision",
  "✓ Exploit-prone items/weapons locked behind server-side verification",
  "✓ Admin commands check player role before execution",
  "✓ DataStore values are never blindly applied; validate ranges/types",
];

// ============================================================================
// Performance Patterns
// ============================================================================

export const PERFORMANCE_PATTERNS = {
  avoid: [
    "Scanning entire Workspace for every frame (use events instead)",
    "Creating new tables in tight loops",
    "RemoteEvent spam (batch updates, use appropriate frequency)",
    "Full Workspace.GetDescendants() unless truly needed",
    "Nested coroutines without cleanup (memory leak risk)",
    "Excessive raycasts per frame (batch, cache results)",
  ],
  prefer: [
    "Event-driven behavior (connections over polling loops)",
    "Object pooling (reuse instances instead of creating/destroying)",
    "Batch remote calls (send one remote with multiple data)",
    "Cached results (store expensive queries)",
    "Task scheduling (task.spawn vs RunService loops when possible)",
    "Debouncing high-frequency events",
  ],
};

// ============================================================================
// Helper Functions
// ============================================================================

export function getService(serviceName: string): RobloxService | null {
  return ROBLOX_SERVICES[serviceName] ?? null;
}

export function describeArchitecture(): string {
  return `
ROBLOX ARCHITECTURE AWARENESS:

Core Structure:
  ServerScriptService → runs on dedicated server
  StarterPlayer/StarterCharacterScripts → run on each player's client
  StarterGui → UI templates that clone to each player
  ReplicatedStorage → visible to both server and clients
  ServerStorage → private to server only
  Workspace → the 3D world (physics, parts, NPCs, players)

Key Principle: Server is authoritative.
  Server: owns all game state (inventory, health, position)
  Client: displays, predicts, sends requests
  Networking: RemoteEvent (async) or RemoteFunction (sync)

Common Patterns:
  - ModuleScripts for shared logic
  - CollectionService for tagged behavior
  - DataStoreService for persistence
  - RemoteEvents for client→server commands
  - Attributes for custom instance metadata
`;
}

export function getLuauGuide(): string {
  return `
LUAU CODE GENERATION STANDARDS:

1. ALWAYS use task.* (task.wait, task.spawn, task.delay)
   - task.wait(1) not wait(1)
   - task.spawn(fn) not spawn(fn)

2. PREFER local scope and explicit service references
   - local Players = game:GetService("Players")
   - local player = Players:FindFirstChild(name)

3. USE type annotations where useful
   - --!strict at top of ModuleScript
   - local function damage(target: Model, amount: number): boolean

4. STRUCTURE code with early returns
   - Check preconditions first
   - Exit early if invalid
   - Main logic last

5. HANDLE errors with pcall
   - local ok, result = pcall(risky_function)
   - Check ok before using result

6. USE ModuleScripts for shared systems
   - One service per file
   - Clear public API
   - Return a single module table

7. VALIDATE on server, DISPLAY on client
   - All critical operations server-validated
   - Client requests, server approves
   - Never trust client-provided values

8. AVOID:
   - Global state (_G.x = 5)
   - Deep nesting (use early returns instead)
   - Full Workspace scans (use events/tags)
   - Arbitrary waits (wait(0.1) spam)
   - Deprecated wait()/spawn()
`;
}

export function getSecurityGuide(): string {
  return `
ROBLOX SECURITY: Multiplayer Defense Checklist

Before shipping any multiplayer feature, ask:
  "What if the client lies?"
  "What if they spam this?"
  "Can they steal/duplicate items?"
  "Can they access other players' data?"
  "Can they manipulate currency?"

Patterns:

1. VALIDATE ALL REMOTE ARGUMENTS
   Server:OnServerEvent(player, assetId)
     → Is assetId valid?
     → Does player own it?
     → Is action allowed right now?

2. RATE LIMIT EXPLOITABLE ACTIONS
   local lastPurchaseTime = {}
   if (tick() - (lastPurchaseTime[player] or 0)) < 5 then
     return -- prevent spam
   end

3. OWNERSHIP VERIFICATION
   Before modifying item, check:
     local item = player:FindFirstChild("Inventory"):FindFirstChild(itemId)
     if not item then return end -- player doesn't own it

4. SERVER-AUTHORITATIVE STATE
   Never accept position directly from client in PVP.
   Use humanoid.MoveTowards or server-side movement validation.

5. EXPLOIT-PRONE ITEMS
   Weapons, currency, rare items: locked behind server verification.
   Client can REQUEST, server APPROVES and applies.
`;
}
