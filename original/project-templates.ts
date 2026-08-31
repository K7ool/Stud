/**
 * Project Templates - Quick-start templates for new Roblox games
 */

export interface Template {
  id: string;
  name: string;
  description: string;
  category: "obby" | "rpg" | "simulator" | "fps" | "social" | "template";
  features: string[];
  files: TemplateFile[];
}

export interface TemplateFile {
  path: string;
  content: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "basic-template",
    name: "Basic Game Template",
    description: "A minimal starting point with common services set up",
    category: "template",
    features: [
      "DataStore service setup",
      "Player module",
      "Shared utilities",
      "Basic GUI framework",
    ],
    files: [
      {
        path: "src/ReplicatedStorage/Shared/Constants.lua",
        content: `-- Shared constants for the game
local Constants = {}

Constants.PLAYER_SPEED = 16
Constants.JUMP_POWER = 50
Constants.MAX_HEALTH = 100

return Constants
`,
      },
      {
        path: "src/ReplicatedStorage/Shared/PlayerData.lua",
        content: `-- Player data management
local Players = game:GetService("Players")

local PlayerData = {}

function PlayerData.new(player)
  local self = {}
  self.leaderstats = Instance.new("Folder")
  self.leaderstats.Name = "leaderstats"
  self.leaderstats.Parent = player

  local kills = Instance.new("IntValue")
  kills.Name = "Kills"
  kills.Value = 0
  kills.Parent = self.leaderstats

  local deaths = Instance.new("IntValue")
  deaths.Name = "Deaths"
  deaths.Value = 0
  deaths.Parent = self.leaderstats

  self.kills = kills
  self.deaths = deaths

  return self
end

return PlayerData
`,
      },
      {
        path: "src/ServerScriptService/GameLogic/PlayerJoined.lua",
        content: `-- Handle player joining
local Players = game:GetService("Players")
local PlayerData = require(game.ReplicatedStorage.Shared.PlayerData)

Players.PlayerAdded:Connect(function(player)
  local data = PlayerData.new(player)
  player:SetAttribute("Data", data)
end)

Players.PlayerRemoving:Connect(function(player)
  local data = player:GetAttribute("Data")
  if data then
    -- Save data here
  end
end)
`,
      },
    ],
  },
  {
    id: "obby-template",
    name: "Obby Template",
    description: "Checkpoint system with stage progression",
    category: "obby",
    features: [
      "Checkpoint system",
      "Stage tracking",
      "Death counter",
      "Finish portal",
    ],
    files: [
      {
        path: "src/ReplicatedStorage/Modules/ObbyData.lua",
        content: `-- Obby game data management
local ObbyData = {}

function ObbyData.init(player)
  local data = {
    currentStage = 1,
    deaths = 0,
    bestTime = nil,
  }
  player:SetAttribute("ObbyStage", 1)
  player:SetAttribute("ObbyDeaths", 0)
  return data
end

function ObbyData.setStage(player, stage)
  player:SetAttribute("ObbyStage", stage)
end

function ObbyData.getStage(player)
  return player:GetAttribute("ObbyStage") or 1
end

function ObbyData.addDeath(player)
  local deaths = player:GetAttribute("ObbyDeaths") or 0
  player:SetAttribute("ObbyDeaths", deaths + 1)
end

return ObbyData
`,
      },
      {
        path: "src/ServerScriptService/Obby/CheckpointHandler.lua",
        content: `-- Checkpoint system
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local ObbyData = require(ReplicatedStorage.Modules.ObbyData)

local function setupCheckpoint(part)
  local stageNumber = part:GetAttribute("Stage") or 1

  part.Touched:Connect(function(hit)
    local player = Players:GetPlayerFromCharacter(hit.Parent)
    if player then
      local currentStage = ObbyData.getStage(player)
      if stageNumber > currentStage then
        ObbyData.setStage(player, stageNumber)
        print("Player " .. player.Name .. " reached stage " .. stageNumber)
      end
    end
  end)
end

-- Setup all checkpoints
for _, checkpoint in ipairs(workspace.Checkpoints:GetChildren()) do
  if checkpoint:IsA("BasePart") then
    setupCheckpoint(checkpoint)
  end
end

return setupCheckpoint
`,
      },
    ],
  },
  {
    id: "simulator-template",
    name: "Simulator Template",
    description: "Click-to-earn with upgrades and auto-save",
    category: "simulator",
    features: [
      "Click multiplier system",
      "Upgrade shop",
      "Rebirth system",
      "Auto-save",
    ],
    files: [
      {
        path: "src/ReplicatedStorage/Modules/SimulatorData.lua",
        content: `-- Simulator data management
local SimulatorData = {}

function SimulatorData.init(player)
  local data = {
    coins = 0,
    clickPower = 1,
    coinsPerSecond = 0,
    rebirths = 0,
    multiplier = 1,
  }
  player:SetAttribute("SimCoins", 0)
  player:SetAttribute("ClickPower", 1)
  player:SetAttribute("CoinsPerSecond", 0)
  player:SetAttribute("Rebirths", 0)
  return data
end

function SimulatorData.addCoins(player, amount)
  local current = player:GetAttribute("SimCoins") or 0
  local multiplier = player:GetAttribute("Multiplier") or 1
  player:SetAttribute("SimCoins", current + (amount * multiplier))
end

function SimulatorData.getCoins(player)
  return player:GetAttribute("SimCoins") or 0
end

function SimulatorData.upgradeClick(player)
  local cost = player:GetAttribute("ClickPower") * 100
  local coins = SimulatorData.getCoins(player)
  if coins >= cost then
    player:SetAttribute("SimCoins", coins - cost)
    player:SetAttribute("ClickPower", player:GetAttribute("ClickPower") + 1)
    return true
  end
  return false
end

return SimulatorData
`,
      },
      {
        path: "src/ServerScriptService/GameLogic/AutoClicker.lua",
        content: `-- Auto clicker system
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SimulatorData = require(ReplicatedStorage.Modules.SimulatorData)

while true do
  task.wait(1)
  for _, player in ipairs(Players:GetPlayers()) do
    local cps = player:GetAttribute("CoinsPerSecond") or 0
    if cps > 0 then
      SimulatorData.addCoins(player, cps)
    end
  end
end
`,
      },
    ],
  },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: Template["category"]): Template[] {
  return TEMPLATES.filter(t => t.category === category);
}

export function getAllTemplates(): Template[] {
  return TEMPLATES;
}
