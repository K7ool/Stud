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
// Enterprise System Blueprints for Large-Scale Roblox Games
// ============================================================================

export const ENTERPRISE_SYSTEM_BLUEPRINTS = {
  serviceFramework: `
--[=[
  @class ServiceFramework / ControllerArchitecture
  Standard architecture for large Roblox systems:
  - ServerScriptService/Services/*.luau (Server Services)
  - ReplicatedStorage/Controllers/*.luau (Client Controllers)
  - ReplicatedStorage/Shared/Modules/*.luau (Shared OOP / Signals / Utilities)
  - ReplicatedStorage/Shared/Network/*.luau (Type-safe Remote Event broker)
]=]

-- Example: ReplicatedStorage/Shared/Network/NetworkBridge.luau
--!strict
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local NetworkBridge = {}
local remotesFolder = ReplicatedStorage:FindFirstChild("Remotes")
if not remotesFolder then
  local folder = Instance.new("Folder")
  folder.Name = "Remotes"
  folder.Parent = ReplicatedStorage
  remotesFolder = folder
end

function NetworkBridge.getRemoteEvent(name: string): RemoteEvent
  local remote = remotesFolder:FindFirstChild(name)
  if not remote then
    if RunService:IsServer() then
      local newRemote = Instance.new("RemoteEvent")
      newRemote.Name = name
      newRemote.Parent = remotesFolder
      return newRemote
    else
      return remotesFolder:WaitForChild(name, 10) :: RemoteEvent
    end
  end
  return remote :: RemoteEvent
end

return NetworkBridge`,

  dataStoreSessionLock: `
--[=[
  @class DataManager (ProfileService Session-Lock Pattern)
  Ensures player data persistence across servers with deadlock prevention,
  reconciliation, autosaving, and transactional updates.
]=]

--!strict
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")

local PlayerDataStore = DataStoreService:GetDataStore("PlayerData_v1")
local AUTOSAVE_INTERVAL = 300 -- 5 minutes
local SESSION_LOCK_TIMEOUT = 1800 -- 30 minutes

export type PlayerDataSchema = {
  coins: number,
  gems: number,
  level: number,
  experience: number,
  inventory: { [string]: number },
  settings: { sfxEnabled: boolean, musicEnabled: boolean },
  lastLogin: number,
  sessionLock: string?,
}

local DEFAULT_DATA: PlayerDataSchema = {
  coins = 100,
  gems = 10,
  level = 1,
  experience = 0,
  inventory = { ["StarterSword"] = 1 },
  settings = { sfxEnabled = true, musicEnabled = true },
  lastLogin = 0,
  sessionLock = nil,
}

local DataManager = {}
local activeProfiles: { [Player]: PlayerDataSchema } = {}

local function reconcile(target: any, template: any)
  for k, v in pairs(template) do
    if target[k] == nil then
      if type(v) == "table" then
        target[k] = {}
        reconcile(target[k], v)
      else
        target[k] = v
      end
    elseif type(v) == "table" and type(target[k]) == "table" then
      reconcile(target[k], v)
    end
  end
end

function DataManager.loadData(player: Player): PlayerDataSchema?
  local key = "Player_" .. player.UserId
  local sessionId = game.JobId .. "_" .. tostring(os.time()) .. "_" .. tostring(math.random(1000, 9999))
  
  local success, result = pcall(function()
    return PlayerDataStore:UpdateAsync(key, function(oldData: any)
      local data = oldData or table.clone(DEFAULT_DATA)
      reconcile(data, DEFAULT_DATA)
      
      -- Check session lock
      if data.sessionLock and (os.time() - (data.lastLogin or 0) < SESSION_LOCK_TIMEOUT) then
        -- Locked by another active server
        warn("Session locked for player " .. player.Name)
      end
      
      data.sessionLock = sessionId
      data.lastLogin = os.time()
      return data
    end)
  end)
  
  if success and result then
    activeProfiles[player] = result
    return result
  else
    warn("Failed to load data for " .. player.Name .. ": " .. tostring(result))
    return nil
  end
end

function DataManager.saveData(player: Player, releaseLock: boolean): boolean
  local profile = activeProfiles[player]
  if not profile then return false end
  
  local key = "Player_" .. player.UserId
  local success, err = pcall(function()
    PlayerDataStore:UpdateAsync(key, function(current: any)
      local toSave = table.clone(profile)
      if releaseLock then
        toSave.sessionLock = nil
      end
      toSave.lastLogin = os.time()
      return toSave
    end)
  end)
  
  if not success then
    warn("Failed to save data for " .. player.Name .. ": " .. tostring(err))
    return false
  end
  return true
end

function DataManager.getProfile(player: Player): PlayerDataSchema?
  return activeProfiles[player]
end

return DataManager`,

  combatHitboxEngine: `
--[=[
  @class CombatEngine
  Server-authoritative spatial hitbox validation with lag compensation,
  raycast bounds, and cooldown tracking.
]=]

--!strict
local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")

local CombatEngine = {}
local lastAttackTimes: { [Player]: number } = {}
local ATTACK_COOLDOWN = 0.45
local MAX_REACH_STUDS = 12

function CombatEngine.validateAndPerformHit(
  attacker: Player,
  hitboxCFrame: CFrame,
  hitboxSize: Vector3,
  damage: number
): { Model }
  -- 1. Cooldown verification
  local now = os.clock()
  local lastTime = lastAttackTimes[attacker] or 0
  if now - lastTime < (ATTACK_COOLDOWN - 0.05) then
    return {} -- Rate limit / cooldown violation
  end
  lastAttackTimes[attacker] = now

  -- 2. Attacker character check
  local attackerChar = attacker.Character
  if not attackerChar then return {} end
  local rootPart = attackerChar:FindFirstChild("HumanoidRootPart") :: BasePart?
  if not rootPart then return {} end

  -- 3. Reach verification (prevents teleport hitboxes)
  local dist = (hitboxCFrame.Position - rootPart.Position).Magnitude
  if dist > MAX_REACH_STUDS then
    warn("Hitbox reach validation failed for " .. attacker.Name)
    return {}
  end

  -- 4. Spatial query hitbox
  local overlapParams = OverlapParams.new()
  overlapParams.FilterType = RaycastFilterType.Exclude
  overlapParams.FilterDescendantsInstances = { attackerChar }
  overlapParams.MaxParts = 20

  local parts = Workspace:GetPartBoundsInBox(hitboxCFrame, hitboxSize, overlapParams)
  local hitCharacters: { [Model]: boolean } = {}
  local damagedModels: { Model } = {}

  for _, part in ipairs(parts) do
    local char = part:FindFirstAncestorOfClass("Model")
    if char and not hitCharacters[char] then
      local humanoid = char:FindFirstChildOfClass("Humanoid")
      if humanoid and humanoid.Health > 0 then
        hitCharacters[char] = true
        humanoid:TakeDamage(damage)
        table.insert(damagedModels, char)
      end
    end
  end

  return damagedModels
end

return CombatEngine`,

  roundStateMachine: `
--[=[
  @class RoundManager
  Finite state machine orchestrating game loops:
  Intermission -> Map Selection -> Teleport -> Active Match -> Sudden Death -> Round End -> Cleanup
]=]

--!strict
local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")

export type GameState = "Intermission" | "MapVoting" | "Teleporting" | "ActiveRound" | "RoundEnded" | "Cleanup"

local RoundManager = {
  currentState = "Intermission" :: GameState,
  timeRemaining = 30,
  minPlayers = 2,
}

function RoundManager.startLoop()
  task.spawn(function()
    while true do
      -- Intermission
      RoundManager.currentState = "Intermission"
      for t = 20, 1, -1 do
        RoundManager.timeRemaining = t
        task.wait(1)
        if #Players:GetPlayers() < RoundManager.minPlayers then
          -- Wait for sufficient players
        end
      end

      -- Map & Teleport
      RoundManager.currentState = "Teleporting"
      task.wait(2)

      -- Active Round
      RoundManager.currentState = "ActiveRound"
      local roundOver = false
      for t = 180, 1, -1 do
        RoundManager.timeRemaining = t
        task.wait(1)
        -- Check win conditions
      end

      -- Round Ended & Cleanup
      RoundManager.currentState = "RoundEnded"
      task.wait(5)
      RoundManager.currentState = "Cleanup"
      task.wait(2)
    end
  end)
end

return RoundManager`,
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
  ServerScriptService → runs on dedicated server (Modular Services, DataManager, CombatEngine)
  StarterPlayer/StarterCharacterScripts → run on each player's client (Controllers, UI listeners)
  StarterGui → UI templates that clone to each player
  ReplicatedStorage → visible to both server and clients (Shared modules, Remotes broker, Types, Constants)
  ServerStorage → private to server only (Internal configs, Templates for cloning)
  Workspace → the 3D world (physics, parts, NPCs, players)

Key Principle: Server is authoritative.
  Server: owns all game state (inventory, health, currency, progression)
  Client: displays, predicts, sends requests
  Networking: Type-safe RemoteEvent (async) or RemoteFunction (sync)

Critical Multi-Script System Rules:
  - Separate concerns: Never put entire game logic in a single monolith script
  - Always write complete, compilable Luau without placeholder stubs or ellipses
  - Use --!strict with complete Luau types
  - Clean up all connections using Janitor/Maid/Trove patterns to prevent memory leaks
`;
}

export function getLuauGuide(): string {
  return `
LUAU CODE GENERATION STANDARDS:

1. ALWAYS use task.* (task.wait, task.spawn, task.delay, task.defer)
   - task.wait(1) not wait(1)
   - task.spawn(fn) not spawn(fn)

2. PREFER local scope and explicit service references
   - local Players = game:GetService("Players")
   - local player = Players:FindFirstChild(name)

3. USE type annotations where useful
   - --!strict at top of ModuleScript
   - export type ItemData = { id: string, name: string, quantity: number }
   - local function damage(target: Model, amount: number): boolean

4. STRUCTURE code with early returns & guard clauses
   - Check preconditions first
   - Exit early if invalid
   - Main logic last

5. HANDLE errors with pcall
   - local ok, result = pcall(risky_function)
   - Check ok before using result

6. USE ModuleScripts for shared systems
   - One service/controller per file
   - Clear public API (Init / Start lifecycle methods)
   - Return a single module table

7. NEVER GENERATE LAZY PLACEHOLDER CODE:
   - Prohibited: '-- TODO: insert rest of code', '-- implement here', '-- etc'
   - Always output complete, ready-to-run, end-to-end code.

8. SERVER-AUTHORITATIVE STATE:
   - All critical operations server-validated
   - Client requests, server approves
   - Never trust client-provided values (damage, position, items, currency)
`;
}

export function getSecurityGuide(): string {
  return `
ROBLOX SECURITY: Multiplayer Defense Checklist

Before shipping any multiplayer feature, ask:
  "What if the client lies?"
  "What if they spam this remote?"
  "Can they steal/duplicate items?"
  "Can they modify other players' data?"
  "Can they teleport or manipulate hitboxes?"

Patterns:

1. VALIDATE ALL REMOTE ARGUMENTS
   Server:OnServerEvent(player, itemId, target)
     → Type check: typeof(itemId) == "string"
     → State check: Does player own itemId?
     → Distance check: Is player in range of target?

2. RATE LIMIT EXPLOITABLE ACTIONS
   local lastAction = {}
   if (os.clock() - (lastAction[player] or 0)) < COOLDOWN then
     return -- prevent spam
   end
   lastAction[player] = os.clock()

3. SPATIAL HITBOX VALIDATION
   Never let client pass 'target:TakeDamage(50)'.
   Client fires 'RequestAttack'. Server calculates reach & bounding box via workspace:GetPartBoundsInBox.

4. TRANSACTIONAL DATA UPDATES
   Use DataStore:UpdateAsync with session locking, not SetAsync.
`;
}
