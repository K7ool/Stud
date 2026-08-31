import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from "@/components/ui/prompt-input";
import { FileUpload, FileUploadTrigger } from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { PromptSuggestion } from "@/components/ui/prompt-suggestion";
import {
  ChatContainerRoot,
  ChatContainerContent,
} from "@/components/ui/chat-container";
import { ScrollButton } from "@/components/ui/scroll-button";
import { Message, MessageContent } from "@/components/ui/message";
import { ToolCalls } from "@/components/ui/tool-call";
import { ExecutionResultCard } from "@/components/ui/execution-result-card";
import { ToolActivityGroup } from "@/components/ui/tool-activity-group";
import { Loader } from "@/components/ui/loader";
import { Logo, LogoMark } from "@/components/icons/Logo";
import { BotAvatar, UserAvatar } from "@/components/icons/Avatars";
import { Icon } from "@/components/icons/Icon";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ContextChips, ChipAction } from "@/components/chat/ContextChips";
import { QuestionPrompt } from "@/components/chat/QuestionPrompt";
import { InstancePicker } from "@/components/chat/InstancePicker";
import { ChatActions } from "@/components/QuickActions";
import { CommandPalette } from "@/components/CommandPalette";
import { EmptyState } from "@/components/EmptyState";
import { IntentSuggestions } from "@/components/chat/IntentSuggestions";
import { ConnectionPopup } from "@/components/chat/ConnectionPopup";
import { Sidebar } from "@/components/chat/Sidebar";
import { MemoryDialog } from "@/components/chat/MemoryDialog";
import { TaskPanel } from "@/components/chat/TaskPanel";
import { ExecutionModeSelector } from "@/components/chat/ExecutionModeSelector";
import { detectIntent, parseSlashCommand } from "@/lib/intents";
import { useChatStore, Attachment } from "@/stores/chat";
import { useSettingsStore, type ApiKeys, type ProviderType } from "@/stores/settings";
import { useRobloxStore, ConnectionStatus } from "@/stores/roblox";
import { usePluginStore } from "@/stores/plugin";
import { useAuthStore } from "@/stores/auth";
import { useUserAuthStore } from "@/stores/userAuth";
import { useGameMapStore } from "@/stores/gameMap";
import { useMemoryStore } from "@/stores/memory";
import { useTaskStore, registerTaskRunner } from "@/stores/tasks";
import { useChat } from "@/lib/ai/providers";
import { extractMemories, generateConversationTitle } from "@/lib/ai/memory-extract";
import { classifyComplexity, resolveMode } from "@/lib/ai/complexity";
import { buildProviderOptions } from "@/lib/ai/effort";
import type { TaskStep } from "@/lib/chat/api";
import { setAskUserHandler } from "@/lib/roblox/tools";
import { getStudioSiteId } from "@/lib/roblox/client";
import { autoDetectProject, setProjectPath, pickFolder } from "@/lib/file-ops";
import { useAppShortcuts } from "@/hooks/useKeyboardShortcuts";
import { improvePrompt } from "@/lib/ai/prompt-improver";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Maximize2, Shield, User, Coins, PanelLeft, ListChecks, Brain } from "lucide-react";
import { ArrowUp, Square, CheckCircle2, Download, FolderOpen, RefreshCw, Box, FileText, Globe, Play, ListTodo, Settings, Sparkles, Paperclip, X, Image, File, MessageSquarePlus, Trash2, Map, Lightbulb, Users, Key, Copy, Check, House, ArrowLeft } from "lucide-react";

const isWebMode = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

// Heavier panels are code-split and only fetched when first opened, keeping the
// initial shell lean.
const GameMap = lazy(() => import("@/components/chat/GameMap").then((m) => ({ default: m.GameMap })));
const ToolboxSearch = lazy(() => import("@/components/ToolboxSearch").then((m) => ({ default: m.ToolboxSearch })));
const AuthModal = lazy(() => import("@/components/auth/AuthModal").then((m) => ({ default: m.AuthModal })));
const AdminDashboard = lazy(() => import("@/components/admin/AdminDashboard").then((m) => ({ default: m.AdminDashboard })));

const SUGGESTIONS = [
  // Gameplay systems
  "Create an NPC that follows players",
  "Add a currency system with DataStore",
  "Make a gun that shoots projectiles",
  "Design a shop GUI with items",
  "Build a checkpoint system for an obby",
  "Create a leaderboard that saves scores",
  "Make doors that require keys to open",
  "Add a day/night cycle with lighting",
  // UI & Effects
  "Design a main menu with play button",
  "Create floating damage numbers",
  "Add a health bar above players",
  "Make a settings menu with sound toggle",
  // Mechanics
  "Create a sprinting system with stamina",
  "Add double jump ability",
  "Make a grappling hook tool",
  "Build a vehicle spawner",
  // World building
  "Find free models for a forest scene",
  "Create a teleporter between areas",
  "Add ambient sounds to the game",
  "Make parts that change color on touch",
  // Advanced
  "Set up a round-based game system",
  "Create an inventory system",
  "Add achievements that unlock badges",
  "Build a trading system between players",
];

// Step indicator for connection flow
function ConnectionStep({ 
  step, 
  title, 
  description, 
  status 
}: { 
  step: number;
  title: string;
  description: string;
  status: "pending" | "active" | "complete";
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
            status === "complete" && "bg-green-100 text-green-600",
            status === "active" && "bg-primary/10 text-primary",
            status === "pending" && "bg-muted text-muted-foreground"
          )}
        >
          {status === "complete" ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : status === "active" ? (
            <Loader variant="circular" size="sm" />
          ) : (
            step
          )}
        </div>
      </div>
      <div className="flex-1 pt-1">
        <h3 className={cn(
          "font-medium",
          status === "complete" && "text-green-600",
          status === "active" && "text-foreground",
          status === "pending" && "text-muted-foreground"
        )}>
          {title}
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// Connection screen shown when bridge is not connected
function ConnectionScreen({ status }: { status: ConnectionStatus }) {
  const { 
    status: pluginStatus, 
    isChecking, 
    isInstalling, 
    checkPlugin, 
    installPlugin 
  } = usePluginStore();
  
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [showManualPath, setShowManualPath] = useState(false);

  // Check plugin status on mount
  useEffect(() => {
    checkPlugin();
  }, [checkPlugin]);

  const handleInstallPlugin = async () => {
    try {
      const result = await installPlugin();
      setInstallMessage(result.message);
    } catch (error) {
      setInstallMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDownloadPlugin = async () => {
    // Fetch a plugin pre-configured with this site's unique ID
    const siteId = getStudioSiteId();
    const url = `/api/stud/plugin?site=${siteId}`;
    try {
      // Trigger a direct browser download
      const a = document.createElement("a");
      a.href = url;
      a.download = "stud-bridge.server.lua";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      setShowManualPath(true);
    }
  };

  const getStepStatus = (step: 1 | 2 | 3): "pending" | "active" | "complete" => {
    if (status === "connected") return "complete";
    if (status === "bridge_only") {
      if (step === 1) return "complete";
      if (step === 2) return "active";
      return "pending";
    }
    // disconnected
    if (step === 1) return "active";
    return "pending";
  };

  const pluginInstalled = pluginStatus?.installed && pluginStatus?.is_current_version;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Minimal header */}
      <header className="flex items-center justify-between px-6 py-4">
        <Logo />
        <div className="flex items-center gap-2">
          <SettingsDialog />
        </div>
      </header>

      {/* Centered content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
        <div className="w-full max-w-md space-y-6">
          {/* Main heading */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-primary/10 mb-4">
              <Loader variant="wave" size="lg" />
            </div>
            <h1 className="text-2xl font-heading text-foreground">
              Connecting to Roblox Studio
            </h1>
            <p className="text-muted-foreground">
              <Loader variant="terminal" text="Waiting for connection" size="sm" />
            </p>
          </div>

          {/* Web-mode: download plugin with embedded site ID */}
          {isWebMode && (
            <div className="bg-card rounded-2xl border-2 border-primary/30 p-5 space-y-3">
              <h2 className="font-medium text-foreground text-lg">Download stud-bridge plugin</h2>
              <p className="text-sm text-muted-foreground">
                One-click download with your unique site ID baked in. Save the file to your
                Roblox Plugins folder, enable HTTP requests in Game Settings → Security,
                then restart Studio.
              </p>
              <Button
                variant="default"
                size="lg"
                className="w-full"
                onClick={handleDownloadPlugin}
              >
                <Download className="w-4 h-4 mr-2" />
                Download stud-bridge plugin
              </Button>
              <p className="text-xs text-muted-foreground">
                Site ID: <span className="font-mono select-all">{getStudioSiteId()}</span>
              </p>
            </div>
          )}

          {/* Connection steps */}
          <div className="bg-card rounded-2xl border border-border p-6 space-y-6">
            <ConnectionStep
              step={1}
              title="Start Stud Desktop"
              description="The bridge server starts automatically with this app"
              status={getStepStatus(1)}
            />

            <div className="border-l-2 border-dashed border-border ml-4 h-4" />

            <ConnectionStep
              step={2}
              title="Open Roblox Studio"
              description="Launch Roblox Studio and open your project"
              status={getStepStatus(2)}
            />

            <div className="border-l-2 border-dashed border-border ml-4 h-4" />

            <ConnectionStep
              step={3}
              title="Connect stud-bridge Plugin"
              description="Click 'Connect' in the stud-bridge plugin toolbar"
              status={getStepStatus(3)}
            />
          </div>

          {/* Plugin Installation Card */}
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">Plugin Status</span>
                {isChecking ? (
                  <Loader variant="circular" size="sm" />
                ) : pluginInstalled ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    Installed
                  </span>
                ) : pluginStatus?.installed ? (
                  <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    Update Available
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    Not Installed
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => checkPlugin()}
                disabled={isChecking}
              >
                <RefreshCw className={cn("w-4 h-4", isChecking && "animate-spin")} />
              </Button>
            </div>

            {/* Install Message */}
            {installMessage && (
              <p className={cn(
                "text-sm p-2 rounded-lg",
                installMessage.startsWith("Error") 
                  ? "bg-red-50 text-red-700" 
                  : "bg-green-50 text-green-700"
              )}>
                {installMessage}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={handleInstallPlugin}
                disabled={isInstalling || (pluginInstalled ?? false)}
                className="flex-1"
              >
                {isInstalling ? (
                  <>
                    <Loader variant="circular" size="sm" className="mr-2" />
                    Installing...
                  </>
                ) : pluginInstalled ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Up to Date
                  </>
                ) : pluginStatus?.installed ? (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Update Plugin
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Install Automatically
                  </>
                )}
              </Button>
              
              <Button
                variant="outline"
                onClick={handleDownloadPlugin}
                title="Download plugin file for manual installation"
              >
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>

            {/* Manual path info */}
            {showManualPath && pluginStatus && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="font-medium text-foreground">Manual Installation:</p>
                <p>Copy the plugin to your Roblox Plugins folder:</p>
                <code className="block bg-background px-2 py-1 rounded text-xs break-all">
                  {pluginStatus.plugins_folder}
                </code>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// Status badge for the header
function StatusBadge({ status, gameInfo }: { status: ConnectionStatus; gameInfo?: { name: string; placeId: number; playerCount: number } | null }) {
  const config = {
    disconnected: {
      color: "bg-zinc-400",
      label: "Offline",
    },
    bridge_only: {
      color: "bg-amber-500",
      label: "Waiting",
    },
    connected: {
      color: "bg-green-500",
      label: "Connected",
    },
    reconnecting: {
      color: "bg-amber-500 animate-pulse",
      label: "Reconnecting...",
    },
  };

  const { color, label } = config[status];

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className={cn("w-2 h-2 rounded-full", color)} />
      <span>{label}</span>
      {status === "connected" && gameInfo && (
        <>
          <span className="text-border">|</span>
          <span className="text-foreground font-medium truncate max-w-[200px]" title={gameInfo.name}>
            {gameInfo.name}
          </span>
          <span className="text-muted-foreground text-xs">
            ID:{gameInfo.placeId}
          </span>
          {gameInfo.playerCount > 0 && (
            <span className="text-green-500 text-xs flex items-center gap-0.5">
              <Users className="w-3 h-3" />
              {gameInfo.playerCount}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// WebMainMenu — landing / main menu for the deployed site (stud-weld.vercel.app).
// Shown on web when no auth is configured. Lets the visitor sign in with
// ChatGPT Plus/Pro (device-code flow) or paste an API key without ever leaving
// the page, then falls through to the chat.
function WebMainMenu({ onClose }: { onClose?: () => void } = {}) {
  const {
    isLoggingIn,
    loginError,
    startDeviceLogin,
    cancelDeviceLogin,
    deviceCode,
    isOAuthAuthenticated,
  } = useAuthStore();
  const { apiKeys, selectedProvider, setApiKey, setSelectedModel } = useSettingsStore();

  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyProvider, setKeyProvider] = useState<ProviderType>(
    selectedProvider === "codex" ? "openai" : (selectedProvider as ProviderType)
  );
  const [keyValue, setKeyValue] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [polling, setPolling] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  const handleCopyCode = async () => {
    if (!deviceCode) return;
    try {
      await navigator.clipboard.writeText(deviceCode.user_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      /* clipboard may be blocked; user can still select the code manually */
    }
  };

  const handlePoll = async () => {
    if (polling) return;
    setPolling(true);
    const { pollDeviceLogin } = useAuthStore.getState();
    await pollDeviceLogin();
    setPolling(false);
  };

  const handleSaveKey = () => {
    if (!keyValue.trim()) return;
    setApiKey(keyProvider as keyof ApiKeys, keyValue.trim());
    setSelectedModel(getDefaultModel(keyProvider), keyProvider);
    setKeyValue("");
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  // Once OAuth is authenticated, the parent re-renders and falls through to the
  // chat. We still render a "you're in" state in case the render races.
  if (isOAuthAuthenticated()) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <Logo />
          <div className="flex items-center gap-2">
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
                <ArrowLeft className="w-4 h-4" />
                Back to chat
              </Button>
            )}
            <SettingsDialog />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <Loader variant="circular" size="md" />
        </main>
      </div>
    );
  }

  // Device-code UI replaces the main menu while a sign-in is in progress.
  if (isLoggingIn && deviceCode) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <Logo />
          <div className="flex items-center gap-2">
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
                <ArrowLeft className="w-4 h-4" />
                Back to chat
              </Button>
            )}
            <SettingsDialog />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md space-y-4">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#10a37f] to-[#1a7f64] mb-2">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-heading">Sign in with ChatGPT</h1>
              <p className="text-sm text-muted-foreground">
                Enter this one-time code to authorise this site.
              </p>
            </div>
            <div className="rounded-2xl bg-card border border-primary/20 p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                1. Open{" "}
                <a
                  href={deviceCode.verification_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-medium hover:underline break-all"
                >
                  {deviceCode.verification_url}
                </a>{" "}
                in any browser (or copy it).
              </p>
              <p className="text-sm text-muted-foreground">
                2. Sign in to ChatGPT and enter the code below. Your account must
                have <span className="font-medium text-foreground">"Allow device code login"</span>{" "}
                enabled in ChatGPT settings.
              </p>
              <div className="flex items-center justify-center gap-3 py-2">
                <span className="text-3xl font-mono font-bold tracking-[0.3em] select-all">
                  {deviceCode.user_code}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyCode}
                  className="shrink-0 h-9 w-9 p-0 rounded-lg"
                  aria-label="Copy code"
                >
                  {copiedCode ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Already entered the code? Tap continue below.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handlePoll}
                disabled={polling}
                className="flex-1 rounded-xl bg-gradient-to-r from-[#10a37f] to-[#1a7f64] hover:from-[#0d8f6e] hover:to-[#166b55]"
              >
                {polling ? (
                  <Loader variant="circular" size="sm" className="mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                {polling ? "Checking…" : "I've signed in — continue"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelDeviceLogin}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (isLoggingIn) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <Logo />
          <div className="flex items-center gap-2">
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
                <ArrowLeft className="w-4 h-4" />
                Back to chat
              </Button>
            )}
            <SettingsDialog />
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-6 gap-3">
          <Loader variant="dots" size="md" />
          <Loader variant="text-shimmer" text="Requesting sign-in" size="sm" />
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <Logo />
        <SettingsDialog />
      </header>

      <main className="flex-1 flex items-center justify-center px-6 overflow-auto">
        <div className="w-full max-w-lg space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-primary/10">
              <LogoMark className="w-9 h-9" />
            </div>
            <h1 className="text-3xl font-heading">Stud</h1>
            <p className="text-muted-foreground">
              AI for Roblox Studio. Chat, plan, and edit your game.
            </p>
          </div>

          {loginError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 p-3 rounded-xl text-center">
              {loginError}
            </p>
          )}

          <div className="space-y-3">
            <Button
              onClick={startDeviceLogin}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#10a37f] to-[#1a7f64] hover:from-[#0d8f6e] hover:to-[#166b55]"
            >
              <Play className="w-5 h-5 mr-2 fill-current" />
              Start with ChatGPT Plus/Pro
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowKeyForm((v) => !v)}
              className="w-full h-12 rounded-2xl"
            >
              <Key className="w-5 h-5 mr-2" />
              Use an API key
            </Button>
          </div>

          {showKeyForm && (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Pick a provider and paste your key. It stays in this browser only.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(["openai", "anthropic", "openrouter", "opencode"] as ProviderType[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setKeyProvider(p)}
                    className={cn(
                      "py-2 px-3 rounded-xl text-sm font-medium border transition-colors",
                      keyProvider === p
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    )}
                  >
                    {p === "openai" ? "OpenAI" : p === "anthropic" ? "Anthropic" : p === "openrouter" ? "OpenRouter" : "OpenCode Zen"}
                  </button>
                ))}
              </div>
              <Input
                type="password"
                placeholder={keyProvider === "opencode" ? "Optional (free models work without a key)" : "Paste your API key"}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveKey();
                }}
              />
              {apiKeys[keyProvider as keyof ApiKeys] && (
                <p className="text-xs text-green-600">
                  A key for {keyProvider} is already saved. Saving will replace it.
                </p>
              )}
              <div className="flex gap-2">
                <Button onClick={handleSaveKey} disabled={!keyValue.trim()} className="flex-1 rounded-xl">
                  Save and open chat
                </Button>
                {keySaved && (
                  <span className="flex items-center text-sm text-green-600">
                    <Check className="w-4 h-4 mr-1" /> Saved
                  </span>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            For Roblox Studio editing, install the stud-bridge plugin.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              const siteId = getStudioSiteId();
              const url = `/api/stud/plugin?site=${siteId}`;
              const a = document.createElement("a");
              a.href = url;
              a.download = "stud-bridge.server.lua";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
            className="w-full h-11 rounded-2xl"
          >
            <Download className="w-4 h-4 mr-2" />
            Download stud-bridge plugin
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Save to your Roblox Plugins folder, then restart Studio. Site ID:{" "}
            <span className="font-mono">{getStudioSiteId()}</span>
          </p>
        </div>
      </main>
    </div>
  );
}

function getDefaultModel(provider: ProviderType): string {
  switch (provider) {
    case "anthropic":
      return "claude-sonnet-4.5";
    case "openrouter":
      return "openai/gpt-4o-mini";
    case "opencode":
      return "big-pickle";
    case "openai":
    case "codex":
    default:
      return "gpt-5";
  }
}

export function Home() {
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [adminDashboardOpen, setAdminDashboardOpen] = useState(false);
  const [creditAlertOpen, setCreditAlertOpen] = useState(false);

  const { currentUser, deductCredit, hasCredits } = useUserAuthStore();
  const [input, setInput] = useState("");
  const [activeChips, setActiveChips] = useState<ChipAction[]>([]);
  const [isImproving, setIsImproving] = useState(false);
  const [displayedSuggestions, setDisplayedSuggestions] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [lastIntent, setLastIntent] = useState<string | undefined>();
  const {
    getCurrentMessages,
    isStreaming,
    error,
    pendingQuestion,
    pendingAttachments,
    addMessage,
    updateMessage,
    addToolCall,
    updateToolCall,
    setStreaming,
    setError,
    setPendingQuestion,
    setQuestionResolver,
    answerQuestion,
    clearMessages,
    addAttachment,
    removeAttachment,
    createSession,
    switchSession,
    deleteSession,
    updateSessionTitle,
    sessions,
    currentSessionId,
  } = useChatStore();

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");
  const [showGameMap, setShowGameMap] = useState(false);
  const [dismissConnection, setDismissConnection] = useState(false);
  const [connectionRetrying, setConnectionRetrying] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [mainMenuOpen, setMainMenuOpen] = useState(false);

  const rootFeature = useGameMapStore((s) => s.rootFeature);
  const setRootFeature = useGameMapStore((s) => s.setRootFeature);
  const addFeature = useGameMapStore((s) => s.addFeature);
  const { appSettings } = useSettingsStore();

  const messages = getCurrentMessages();
  const { hasApiKey, selectedProvider } = useSettingsStore();
  // Granular subscriptions so Home only re-renders when these specific values
  // change, not on every 2-second poll (lastSuccessfulPoll/lastCheck mutate
  // each poll and would otherwise re-render the whole component constantly).
  const studioStatus = useRobloxStore((s) => s.status);
  const gameInfo = useRobloxStore((s) => s.gameInfo);
  const startPolling = useRobloxStore((s) => s.startPolling);
  const fetchGameInfo = useRobloxStore((s) => s.fetchGameInfo);
  const checkConnection = useRobloxStore((s) => s.checkConnection);
  const { sendMessage } = useChat();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Granular task subscription so the header badge updates live.
  const activeTaskCount = useTaskStore(
    (s) => s.tasks.filter((t) => t.status === "running" || t.status === "pending" || t.status === "paused").length
  );
  // Next task we can start right now (pending/needs_resume/paused), with
  // nothing currently running. The header "Start" button and the empty-state
  // banner both use this so the user can kick the queue without opening it.
  const nextStartableTask = useTaskStore((s) => {
    if (s.tasks.some((t) => t.status === "running")) return null;
    return (
      s.tasks.find((t) => t.status === "needs_resume") ||
      s.tasks.find((t) => t.status === "pending") ||
      s.tasks.find((t) => t.status === "paused") ||
      null
    );
  });

  // Keyboard shortcuts
  useAppShortcuts({
    onClearChat: () => {
      if (messages.length > 0 && !isStreaming) {
        clearMessages();
      }
    },
    onFocusInput: () => {
      inputRef.current?.focus();
    },
  });

  // Start polling for connection on mount
  useEffect(() => {
    const cleanup = startPolling();
    return cleanup;
  }, [startPolling]);

  // Hydrate chat history + memory from the server on first mount. Local data
  // (already in localStorage) is shown immediately; the server list is merged
  // in once it lands. Neither call blocks the first user message.
  useEffect(() => {
    useChatStore.getState().hydrateFromServer().catch(() => {});
    useMemoryStore.getState().hydrate().catch(() => {});
    useTaskStore.getState().hydrate().catch(() => {});
  }, []);

  // URL routing: /chat/:id selects a conversation, "/" or unknown opens the
  // most recent. Switching chats pushes to history so the back button works.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      const m = window.location.pathname.match(/^\/chat\/([\w-]+)/);
      const target = m ? m[1] : null;
      const state = useChatStore.getState();
      if (target && state.sessions.find((s) => s.id === target) && state.currentSessionId !== target) {
        state.switchSession(target);
      } else if (!target && state.sessions.length > 0 && !state.currentSessionId) {
        state.switchSession(state.sessions[0].id);
      }
    };
    apply();
    const onPop = () => apply();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Reflect the active session in the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!currentSessionId) return;
    const want = `/chat/${currentSessionId}`;
    if (window.location.pathname !== want) {
      window.history.replaceState(window.history.state, "", want);
    }
  }, [currentSessionId]);

  // Fetch game info once connected
  useEffect(() => {
    if (studioStatus === "connected") {
      fetchGameInfo();
    }
  }, [studioStatus, fetchGameInfo]);

  // Shuffle and pick random suggestions on mount and when messages clear
  useEffect(() => {
    const shuffled = [...SUGGESTIONS].sort(() => Math.random() - 0.5);
    setDisplayedSuggestions(shuffled.slice(0, 4));
  }, [messages.length === 0]);

  // Set up the ask_user handler
  useEffect(() => {
    setAskUserHandler((questions) => {
      return new Promise((resolve) => {
        setPendingQuestion({
          id: crypto.randomUUID(),
          toolCallId: "",
          messageId: "",
          questions,
        });
        setQuestionResolver(resolve);
      });
    });

    return () => {
      setAskUserHandler(null);
    };
  }, [setPendingQuestion, setQuestionResolver]);

  // Handle paste events for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const url = URL.createObjectURL(file);
            addAttachment({
              name: `pasted-image-${Date.now()}.png`,
              type: file.type || "image/png",
              size: file.size,
              url,
            });
          }
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [addAttachment]);

  // Auto-detect project on mount
  useEffect(() => {
    const detectProject = async () => {
      try {
        const detected = await autoDetectProject();
        if (detected) {
          console.log("[Home] Auto-detected project:", detected);
          await setProjectPath(detected);
        }
      } catch (err) {
        console.log("[Home] Could not auto-detect project:", err);
      }
    };
    detectProject();
  }, []);

  // Close session dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".group")) {
        document.getElementById("session-dropdown")?.classList.add("hidden");
        document.getElementById("session-dropdown-empty")?.classList.add("hidden");
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const hasConfiguredProvider = hasApiKey("openai") || hasApiKey("anthropic") || hasApiKey("opencode") || selectedProvider === "opencode" || useAuthStore.getState().isOAuthAuthenticated();
  const isConnected = studioStatus === "connected";

  // Improve prompt handler
  const handleImprovePrompt = useCallback(async () => {
    if (!input.trim() || isImproving || isStreaming) return;

    setIsImproving(true);
    try {
      const result = await improvePrompt(input);
      if (result.improved && result.improved !== input) {
        setInput(result.improved);
      }
      if (result.error) {
        console.warn("[Home] Prompt improvement error:", result.error);
      }
    } catch (err) {
      console.error("[Home] Failed to improve prompt:", err);
    } finally {
      setIsImproving(false);
    }
  }, [input, isImproving, isStreaming]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    // Check user credits before submitting
    if (!hasCredits()) {
      setCreditAlertOpen(true);
      return;
    }

    const userMessage = input.trim();

    // Memory management shortcuts. Intercept "remember that …" and
    // "forget …" so they never reach the AI: store/delete the matching
    // memory and reply with a short confirmation in a fresh assistant
    // message. This is a deterministic, low-cost path — no LLM call.
    const rememberMatch = userMessage.match(/^remember(?:\s+that)?\s*[:\-]?\s*(.+)$/i);
    const forgetAllMatch = userMessage.match(/^forget\s+(?:everything|all(?:\s+memories)?)$/i);
    const forgetMatch = !forgetAllMatch && userMessage.match(/^forget\s+(?:about\s+|that\s+)?(.+)$/i);
    if (rememberMatch || forgetAllMatch || forgetMatch) {
      const projectId = getStudioSiteId() || "default";
      const sessionId = useChatStore.getState().currentSessionId || useChatStore.getState().createSession();
      addMessage({ role: "user", content: userMessage });
      try {
        if (forgetAllMatch) {
          await useMemoryStore.getState().forgetAll();
          addMessage({ role: "assistant", content: "Forgot all stored memories." });
        } else if (forgetMatch) {
          const target = forgetMatch[1].trim();
          const all = useMemoryStore.getState().memories;
          const matches = all.filter((m) => `${m.key} ${m.value}`.toLowerCase().includes(target.toLowerCase()));
          await Promise.all(matches.map((m) => useMemoryStore.getState().removeMemory(m.id)));
          addMessage({
            role: "assistant",
            content: matches.length
              ? `Forgot ${matches.length} memor${matches.length === 1 ? "y" : "ies"} matching "${target}".`
              : `No memory matched "${target}".`,
          });
        } else {
          const value = rememberMatch![1].trim();
          const key = value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 60) || "fact";
          await useMemoryStore.getState().addMemory({
            scope: "project",
            category: "IMPORTANT_FACTS",
            key,
            value,
            confidence: 0.9,
            projectId,
            sourceConversationId: sessionId,
          });
          addMessage({ role: "assistant", content: `Got it. I'll remember: ${value}` });
        }
      } catch (e) {
        addMessage({ role: "assistant", content: `Could not update memory: ${(e as Error).message}` });
      }
      setInput("");
      return;
    }

    // Deduct 1 credit for generation
    deductCredit(1);

    // Build context prefix based on active chips
    const prefixes: string[] = [];
    if (activeChips.includes("docs")) {
      prefixes.push("[Search Roblox documentation first]");
    }
    if (activeChips.includes("web")) {
      prefixes.push("[Search the web for information]");
    }
    if (activeChips.includes("search-models")) {
      prefixes.push("[Search the Creator Store for free models if needed]");
    }
    if (activeChips.includes("plan")) {
      prefixes.push("[Create a detailed plan before making changes]");
    }
    const chipContext = prefixes.join(" ");
    const fullMessage = chipContext ? `${chipContext}\n\n${userMessage}` : userMessage;

    setInput("");
    setActiveChips([]); // Clear chips after submit

    // Detect intent for follow-up suggestions
    const intent = detectIntent(userMessage);
    setLastIntent(intent.type);

    // ---- Task control shortcuts -------------------------------------------
    // Recognize explicit stop / cancel / pause / continue / resume / run so
    // the user can drive the queue without opening the TaskPanel.
    const trimmed = userMessage.trim().toLowerCase();
    const isCancelWord = /^(stop|cancel|abort|halt|pause|quit|that['’]?s enough|stop doing that)$/i.test(userMessage.trim());
    const isContinueWord = /^(continue|resume|restart|run|go|go ahead|start|execute|proceed|proceed with the (plan|task)|run the (plan|task))$/i.test(userMessage.trim());
    const ts = useTaskStore.getState();

    if (isCancelWord) {
      const running = ts.currentTask();
      const current = running || ts.tasks.find((t) => t.status === "needs_resume");
      if (current) {
        ts.cancel(current.id);
        addMessage({ role: "user", content: userMessage });
        addMessage({ role: "assistant", content: `Cancelled the task **${current.title || "untitled"}**. Nothing else is running.` });
      } else if (ts.tasks.some((t) => t.status === "pending" || t.status === "paused")) {
        // Cancel everything still queued.
        const queued = ts.tasks.filter((t) => t.status === "pending" || t.status === "paused");
        await Promise.all(queued.map((t) => ts.cancel(t.id)));
        addMessage({ role: "user", content: userMessage });
        addMessage({ role: "assistant", content: "Cancelled the queued tasks. The queue is now empty." });
      } else {
        addMessage({ role: "user", content: userMessage });
        addMessage({ role: "assistant", content: "There are no running or queued tasks to stop." });
      }
      return;
    }

    if (isContinueWord) {
      const paused = ts.tasks.find((t) => t.status === "pending");
      const needsResume = ts.tasks.find((t) => t.status === "needs_resume");
      const target = paused || needsResume;
      if (target) {
        addMessage({ role: "user", content: userMessage });
        addMessage({ role: "assistant", content: `Starting **${target.title || "the task"}**. I'll run it now.` });
        // startTask actually invokes the runner so the chat streams. setStatus
        // alone used to leave tasks stuck in "running" with no execution.
        void ts.startTask(target.id);
        return;
      }
    }

    console.log("[Home] Submitting message:", userMessage, "with context:", chipContext, "intent:", intent.type);

    // Add user message (show without context prefix for cleaner UI, but store chips)
    addMessage({ role: "user", content: userMessage, contextChips: activeChips.length > 0 ? [...activeChips] : undefined });

    // Add placeholder for assistant
    const assistantId = addMessage({ role: "assistant", content: "" });

    // Capture session ID so async work (title, memory) targets the right convo.
    const sessionId = useChatStore.getState().currentSessionId;

    // ---- Task / queue integration ----------------------------------------
    const taskSettings = useTaskStore.getState().settings;
    const isBusyNow = useTaskStore.getState().isBusy();
    const classification = classifyComplexity(userMessage);
    const resolved = resolveMode(classification, taskSettings.mode);
    const isStatusQuestion = classification.complexity === "trivial";

    // Title for the task: a short, user-friendly label.
    const taskTitle = userMessage.length > 80 ? userMessage.slice(0, 77) + "…" : userMessage;

    let taskId: string | null = null;
    const projectId = getStudioSiteId() || "default";

    if (resolved.shouldCreateTask) {
      // Decide initial status:
      //   - Already busy while autoQueue off: pending (queued)
      //   - Otherwise: running (start now). Plan mode also starts now; the AI
      //     first presents a plan via update_task_plan, then executes.
      const isBusyNow = useTaskStore.getState().isBusy();
      const initialStatus: "pending" | "running" = isBusyNow ? "pending" : "running";
      const t = await useTaskStore.getState().enqueue({
        id: crypto.randomUUID(),
        projectId,
        conversationId: sessionId || "default",
        title: taskTitle,
        prompt: userMessage,
        status: initialStatus,
        priority: "normal",
        mode: resolved.mode,
        effort: resolved.effort,
        createdAt: Date.now(),
      });
      if (t) taskId = t.id; // plan mode -> pending (status), but AI runs below
    }

    setStreaming(true);
    setError(null);

    try {
      // Pull a small, relevant slice of memory for this turn. Never blocks
      // the response — a stale or empty list just means we send less.
      const memoryLines = useMemoryStore.getState().toPromptLines(
        useMemoryStore.getState().relevantFor(userMessage, 6).filter(
          (m) => m.scope === "global" || m.projectId === projectId
        )
      );
      const systemExtension = memoryLines
        ? `Relevant memory (use only if it improves your answer; do not mention unless asked):\n${memoryLines}`
        : undefined;

      // Map the user's effort setting to actual provider parameters. Instant
      // mode disables hidden reasoning (effort "none"); otherwise use the
      // user's explicit thinking effort.
      const settings = useSettingsStore.getState();
      const providerOptions = buildProviderOptions(
        settings.selectedProvider,
        settings.selectedModel,
        taskSettings.mode === "instant" ? "none" : taskSettings.effort
      );

      const chatMessages = [
        ...messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: fullMessage },
      ];

      console.log("[Home] Sending", chatMessages.length, "messages to AI");

      let fullText = "";
      // Throttle store updates to once per animation frame instead of once
      // per token. Re-rendering + markdown parsing + localStorage persist on
      // every token dominates streaming cost for long responses.
      let rafId: number | null = null;
      const flushToken = () => {
        rafId = null;
        updateMessage(assistantId, fullText);
      };

      await sendMessage(chatMessages, {
        systemExtension,
        providerOptions: Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
        onToken: (token) => {
          fullText += token;
          if (rafId === null) {
            rafId = requestAnimationFrame(flushToken);
          }
        },
        onToolCall: (toolCall) => {
          console.log("[Home] Tool call received:", toolCall.name);
          // Add tool call to the assistant message
          addToolCall(assistantId, {
            id: toolCall.id,
            name: toolCall.name,
            args: toolCall.input,
          });
          // Mark it as running
          updateToolCall(assistantId, toolCall.id, { status: "running" });
        },
        onToolResult: (toolResult) => {
          console.log("[Home] Tool result received:", toolResult.id, "output:", toolResult.output);
          // Update the tool call with the result
          updateToolCall(assistantId, toolResult.id, {
            status: "complete",
            result: toolResult.output,
          });

          // Handle game map updates
          const output = toolResult.output as { _gameMapUpdate?: boolean; featureName?: string; description?: string; parentFeature?: string; status?: string; _gameMapSuggestions?: boolean; suggestions?: string[] };
          if (output?._gameMapUpdate && output.featureName) {
            console.log("[Home] Game map update:", output.featureName);
            if (output.parentFeature) {
              useGameMapStore.getState().addFeature(output.parentFeature, {
                name: output.featureName,
                description: output.description || "",
                status: (output.status as "idea" | "in-progress" | "completed") || "completed",
              });
            } else if (!useGameMapStore.getState().rootFeature) {
              useGameMapStore.getState().setRootFeature({
                name: output.featureName,
                description: output.description || "",
                status: (output.status as "idea" | "in-progress" | "completed") || "completed",
              });
            }
          }

          // Handle update_task_plan: replace / add / advance / skip steps
          if (taskId && toolResult.output && typeof toolResult.output === "object") {
            const plan = toolResult.output as {
              action?: string;
              steps?: Array<{ id: string; title: string; dependsOn?: string[] }>;
              currentStep?: string;
              note?: string;
            };
            if (
              plan.action &&
              (plan.action === "replace" ||
                plan.action === "add" ||
                plan.action === "advance" ||
                plan.action === "skip")
            ) {
              const ts = useTaskStore.getState();
              const task = ts.tasks.find((t) => t.id === taskId);
              if (task) {
                if (plan.action === "replace" && Array.isArray(plan.steps)) {
                  const newSteps: TaskStep[] = plan.steps.map((s, i) => ({
                    id: s.id,
                    title: s.title,
                    order: i,
                    status: "pending",
                    dependsOn: s.dependsOn || [],
                  }));
                  if (newSteps.length > 0) {
                    newSteps[0] = { ...newSteps[0], status: "in_progress", startedAt: Date.now() };
                  }
                  void ts.patch(taskId, {
                    steps: newSteps,
                    currentStep: newSteps[0]?.id || "",
                    progress: newSteps.length > 0 ? 0.05 : 0,
                  });
                } else if (plan.action === "add" && Array.isArray(plan.steps)) {
                  const startOrder = task.steps.length;
                  const additions: TaskStep[] = plan.steps.map((s, i) => ({
                    id: s.id,
                    title: s.title,
                    order: startOrder + i,
                    status: "pending",
                    dependsOn: s.dependsOn || [],
                  }));
                  void ts.patch(taskId, { steps: [...task.steps, ...additions] });
                } else if (plan.action === "advance" && plan.currentStep) {
                  const sid = plan.currentStep;
                  const steps: TaskStep[] = task.steps.map((s) =>
                    s.id === sid
                      ? { ...s, status: "completed", completedAt: Date.now() }
                      : s
                  );
                  const completedIds = new Set(
                    steps.filter((s) => s.status === "completed").map((s) => s.id)
                  );
                  const next = steps.find(
                    (s) =>
                      s.status === "pending" &&
                      s.dependsOn.every((d) => completedIds.has(d))
                  );
                  if (next) {
                    steps[steps.indexOf(next)] = {
                      ...next,
                      status: "in_progress",
                      startedAt: Date.now(),
                    };
                    void ts.patch(taskId, { steps, currentStep: next.id });
                  } else {
                    void ts.patch(taskId, { steps, currentStep: "" });
                  }
                } else if (plan.action === "skip" && plan.currentStep) {
                  const sid = plan.currentStep;
                  const steps: TaskStep[] = task.steps.map((s) =>
                    s.id === sid
                      ? { ...s, status: "skipped", completedAt: Date.now() }
                      : s
                  );
                  void ts.patch(taskId, { steps });
                }
              }
            }
          }
        },
        onFinish: () => {
          console.log("[Home] Stream finished, total length:", fullText.length);
          setStreaming(false);

          // Mark the task complete (or fail if no meaningful content).
          if (taskId) {
            const ts = useTaskStore.getState();
            const task = ts.tasks.find((t) => t.id === taskId);
            if (task && task.status === "running") {
              // Mark any in_progress step as completed.
              const steps = task.steps.map((s) =>
                s.status === "in_progress"
                  ? { ...s, status: "completed" as const, completedAt: Date.now() }
                  : s
              );
              ts.patch(taskId, {
                status: fullText.trim().length === 0 ? "failed" : "completed",
                progress: 1,
                completedAt: Date.now(),
                steps,
                result: {
                  summary: fullText.slice(0, 280),
                  filesChanged: [],
                  toolsUsed: Array.from(
                    new Set(
                      useChatStore
                        .getState()
                        .sessions.find((s) => s.id === sessionId)
                        ?.messages.flatMap((m) => m.toolCalls?.map((tc) => tc.name) || []) || []
                    )
                  ),
                  verification: "Completed in single streaming pass",
                  duration: Date.now() - (task.startedAt || task.createdAt),
                },
              });
            }
          }

          // If auto-queue and we just finished a task, start the next pending one.
          // We don't actually start another agent run from here — the next user
          // message or a manual "Run now" will pick it up. We just surface it as
          // ready. (Auto-queueing internal continuations is intentionally out of
          // scope to avoid runaway agent loops.)

          // Async title generation: only for the very first user message of
          // a session, and only if the current title is the placeholder.
          if (sessionId) {
            const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
            const isPlaceholderTitle = !session || /^New chat$|^Chat \d/.test(session.title);
            if (isPlaceholderTitle) {
              generateConversationTitle(userMessage, fullText)
                .then((title) => {
                  if (title) useChatStore.getState().updateSessionTitle(sessionId, title);
                })
                .catch(() => {});
            }
            // Async memory extraction. Never blocks; never throws.
            extractMemories({ userMessage, assistantMessage: fullText })
              .then((mems) => {
                if (!mems) return;
                for (const m of mems) {
                  useMemoryStore.getState()
                    .addMemory({
                      scope: m.scope,
                      category: m.category as never,
                      key: m.key,
                      value: m.value,
                      confidence: m.confidence,
                      projectId: m.scope === "project" ? projectId : null,
                      sourceConversationId: sessionId,
                    })
                    .catch(() => {});
                }
              })
              .catch(() => {});
          }
        },
        onError: (error) => {
          console.error("[Home] Stream error:", error);
          setError(error.message);
          setStreaming(false);
          // Mark the task as failed (with retry available).
          if (taskId) {
            useTaskStore.getState().patch(taskId, {
              status: "failed",
              completedAt: Date.now(),
              error: error.message,
            });
          }
        },
      });
    } catch (error) {
      console.error("[Home] Chat error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(errorMessage);
      setStreaming(false);
    }
  }, [input, isStreaming, messages, activeChips, addMessage, updateMessage, addToolCall, updateToolCall, setStreaming, setError, sendMessage, hasCredits, deductCredit]);

  /**
   * runTaskPrompt — execute a prompt for a specific task, streaming the reply
   * into the current chat session and updating the task's status/progress as it
   * goes. Used to auto-advance the queue when the active task finishes, and by
   * the "Run now" / "continue" flows. Mirrors the streaming path in
   * handleSubmit so queued tasks behave identically to interactive ones.
   */
  const advanceQueueRef = useRef<() => void>(() => {});
  const runTaskPromptRef = useRef<(prompt: string, id: string, opts?: { silentUserMessage?: boolean }) => void>(() => {});

  const advanceQueue = useCallback(async () => {
    const ts = useTaskStore.getState();
    const next = ts.queue()[0] || ts.tasks.find((t) => t.status === "needs_resume");
    if (!next) return;
    if (ts.isBusy()) return; // something already running
    await runTaskPromptRef.current(next.prompt || next.title, next.id);
  }, []);

  advanceQueueRef.current = advanceQueue;

  const runTaskPrompt = useCallback(
    async (
      taskPrompt: string,
      taskId: string,
      opts?: { silentUserMessage?: boolean }
    ) => {
      const ts = useTaskStore.getState();
      const sessionId = useChatStore.getState().currentSessionId;
      const projectId = getStudioSiteId() || "default";
      const taskSettings = useTaskStore.getState().settings;

      // Mark running (in case it was pending/needs_resume).
      ts.setStatus(taskId, "running").catch(() => {});

      // Reflect the task prompt into the chat (unless caller suppressed it).
      if (!opts?.silentUserMessage) {
        addMessage({ role: "user", content: taskPrompt });
      }
      const assistantId = addMessage({ role: "assistant", content: "" });

      setStreaming(true);
      setError(null);

      let fullText = "";
      let rafId: number | null = null;
      const flushToken = () => {
        rafId = null;
        updateMessage(assistantId, fullText);
      };

      const sessionMessages = useChatStore.getState().sessions.find((s) => s.id === sessionId)?.messages || [];
      const memoryLines = useMemoryStore.getState().toPromptLines(
        useMemoryStore.getState()
          .relevantFor(taskPrompt, 6)
          .filter((m) => m.scope === "global" || m.projectId === projectId)
      );
      const systemExtension = memoryLines
        ? `Relevant memory (use only if it improves your answer; do not mention unless asked):\n${memoryLines}`
        : undefined;
      const settings = useSettingsStore.getState();
      const providerOptions = buildProviderOptions(
        settings.selectedProvider,
        settings.selectedModel,
        taskSettings.mode === "instant" ? "none" : taskSettings.effort
      );

      const chatMessages = [
        ...sessionMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: taskPrompt },
      ];

      try {
        await sendMessage(chatMessages, {
          systemExtension,
          providerOptions: Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
          onToken: (token) => {
            fullText += token;
            if (rafId === null) rafId = requestAnimationFrame(flushToken);
          },
          onToolCall: (toolCall) => {
            addToolCall(assistantId, { id: toolCall.id, name: toolCall.name, args: toolCall.input });
            updateToolCall(assistantId, toolCall.id, { status: "running" });
          },
          onToolResult: (toolResult) => {
            updateToolCall(assistantId, toolResult.id, {
              status: "complete",
              result: toolResult.output,
            });

            // update_task_plan: reflect step changes into the task.
            if (toolResult.output && typeof toolResult.output === "object") {
              const plan = toolResult.output as {
                action?: string;
                steps?: Array<{ id: string; title: string; dependsOn?: string[] }>;
                currentStep?: string;
              };
              if (
                plan.action &&
                (plan.action === "replace" ||
                  plan.action === "add" ||
                  plan.action === "advance" ||
                  plan.action === "skip")
              ) {
                const t = useTaskStore.getState().tasks.find((x) => x.id === taskId);
                if (t) {
                  const cur = useTaskStore.getState();
                  if (plan.action === "replace" && Array.isArray(plan.steps)) {
                    const newSteps: TaskStep[] = plan.steps.map((s, i) => ({
                      id: s.id,
                      title: s.title,
                      order: i,
                      status: "pending",
                      dependsOn: s.dependsOn || [],
                    }));
                    if (newSteps.length > 0) {
                      newSteps[0] = { ...newSteps[0], status: "in_progress", startedAt: Date.now() };
                    }
                    void cur.patch(taskId, {
                      steps: newSteps,
                      currentStep: newSteps[0]?.id || "",
                      progress: newSteps.length > 0 ? 0.05 : 0,
                    });
                  } else if (plan.action === "add" && Array.isArray(plan.steps)) {
                    const additions: TaskStep[] = plan.steps.map((s, i) => ({
                      id: s.id,
                      title: s.title,
                      order: t.steps.length + i,
                      status: "pending",
                      dependsOn: s.dependsOn || [],
                    }));
                    void cur.patch(taskId, { steps: [...t.steps, ...additions] });
                  } else if (plan.action === "advance" && plan.currentStep) {
                    const steps: TaskStep[] = t.steps.map((s) =>
                      s.id === plan.currentStep
                        ? { ...s, status: "completed", completedAt: Date.now() }
                        : s
                    );
                    const completedIds = new Set(
                      steps.filter((s) => s.status === "completed").map((s) => s.id)
                    );
                    const next = steps.find(
                      (s) => s.status === "pending" && s.dependsOn.every((d) => completedIds.has(d))
                    );
                    if (next) {
                      steps[steps.indexOf(next)] = {
                        ...next,
                        status: "in_progress",
                        startedAt: Date.now(),
                      };
                      void cur.patch(taskId, { steps, currentStep: next.id });
                    } else {
                      void cur.patch(taskId, { steps, currentStep: "" });
                    }
                  } else if (plan.action === "skip" && plan.currentStep) {
                    const steps: TaskStep[] = t.steps.map((s) =>
                      s.id === plan.currentStep
                        ? { ...s, status: "skipped", completedAt: Date.now() }
                        : s
                    );
                    void cur.patch(taskId, { steps });
                  }
                }
              }
            }
          },
          onFinish: () => {
            updateMessage(assistantId, fullText);
            setStreaming(false);
            const t = useTaskStore.getState().tasks.find((x) => x.id === taskId);
            if (t && t.status === "running") {
              const steps = t.steps.map((s) =>
                s.status === "in_progress"
                  ? { ...s, status: "completed" as const, completedAt: Date.now() }
                  : s
              );
              void useTaskStore.getState().patch(taskId, {
                status: fullText.trim().length === 0 ? "failed" : "completed",
                progress: 1,
                completedAt: Date.now(),
                steps,
                result: {
                  summary: fullText.slice(0, 280),
                  filesChanged: [],
                  toolsUsed: [],
                  verification: "Auto-executed queued task via streaming",
                  duration: Date.now() - (t.startedAt || t.createdAt),
                },
              });
            }
            // Auto-advance to the next queued task (sequential execution).
            void advanceQueueRef.current();
          },
          onError: (error) => {
            console.error("[Home] Task run error:", error);
            setError(error.message);
            setStreaming(false);
            void useTaskStore.getState().patch(taskId, {
              status: "failed",
              completedAt: Date.now(),
              error: error.message,
            });
          },
        });
      } catch (error) {
        console.error("[Home] Task chat error:", error);
        setError(error instanceof Error ? error.message : String(error));
        setStreaming(false);
      }
    },
    [addMessage, updateMessage, addToolCall, updateToolCall, setStreaming, setError, sendMessage]
  );

  runTaskPromptRef.current = runTaskPrompt;

  // Register the task runner with the store so panel buttons, the "continue"
  // chat keyword, and any other "start this task" entry point actually stream
  // the chat. Without this, flipping status to "running" is a no-op and the
  // task sits there forever.
  useEffect(() => {
    registerTaskRunner((taskId) => {
      const t = useTaskStore.getState().tasks.find((x) => x.id === taskId);
      if (!t) return;
      // If the chat is already streaming something else, skip — the running
      // task will be re-promoted on completion.
      if (useChatStore.getState().isStreaming) return;
      void runTaskPromptRef.current(t.prompt || t.title, taskId);
    });
    return () => registerTaskRunner(null);
  }, []);



  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  const handleChipClick = (chipId: ChipAction) => {
    // Toggle chip
    setActiveChips(prev =>
      prev.includes(chipId)
        ? prev.filter(c => c !== chipId)
        : [...prev, chipId]
    );

    // For "run-code" chip, pre-fill input template
    if (chipId === "run-code" && !activeChips.includes(chipId)) {
      setInput(prev => prev || "Run this code in Studio:\n```lua\n\n```");
    }
  };

  const handleStop = () => {
    setStreaming(false);
  };

  const handlePickFolder = async () => {
    try {
      const folder = await pickFolder();
      if (folder) {
        console.log("[Home] Selected project folder:", folder);
        await setProjectPath(folder);
      }
    } catch (err) {
      console.error("[Home] Failed to pick folder:", err);
    }
  };

  const handleGameMapSuggestion = (prompt: string, _childName?: string) => {
    setInput(prompt);
    handleSubmit();
  };

  // Manual retry from the connection popup.
  const handleRetryConnection = useCallback(async () => {
    setConnectionRetrying(true);
    try {
      await checkConnection();
    } finally {
      setConnectionRetrying(false);
    }
  }, [checkConnection]);

  // Shared overlay dialogs rendered in both empty-state and chat-view returns.
  const renderOverlays = () => (
    <>
      {showGameMap && (
        <Suspense fallback={null}>
          <GameMap open onOpenChange={setShowGameMap} onSelectSuggestion={handleGameMapSuggestion} />
        </Suspense>
      )}
      {authModalOpen && (
        <Suspense fallback={null}>
          <AuthModal
            open
            onOpenChange={setAuthModalOpen}
            onOpenAdmin={() => {
              setAuthModalOpen(false);
              setAdminDashboardOpen(true);
            }}
          />
        </Suspense>
      )}
      {adminDashboardOpen && (
        <Suspense fallback={null}>
          <AdminDashboard open onOpenChange={setAdminDashboardOpen} />
        </Suspense>
      )}
      {toolboxOpen && (
        <Suspense fallback={null}>
          <ToolboxSearch
            open
            onOpenChange={setToolboxOpen}
            onInserted={() => setToolboxOpen(false)}
          />
        </Suspense>
      )}
      <ConnectionPopup
        open={!isConnected && !dismissConnection}
        status={studioStatus}
        retrying={connectionRetrying}
        onRetry={handleRetryConnection}
        onDismiss={() => setDismissConnection(true)}
      />
      <TaskPanel open={taskPanelOpen} onClose={() => setTaskPanelOpen(false)} />
      <MemoryDialog open={memoryOpen} onOpenChange={setMemoryOpen} />
    </>
  );

  // On the web there is no Roblox Studio to connect to, so the connection
  // screen is never relevant — the chat / main menu is the entry point.
  // The desktop app still honours workWithoutStudio and falls back to the
  // ConnectionScreen when the bridge isn't reachable.
  const canWorkOffline = isWebMode || appSettings.workWithoutStudio;
  if (!isWebMode && !isConnected && !canWorkOffline) {
    return <ConnectionScreen status={studioStatus} />;
  }

  // On the deployed site, show a clean main menu / landing instead of the
  // raw empty-state chat when the user hasn't signed in yet. Once any auth
  // (Codex OAuth or an API key) is configured, fall through to the chat —
  // unless the user explicitly opened the menu via the header "Main menu"
  // button, in which case we always show it.
  if ((isWebMode && !hasConfiguredProvider) || mainMenuOpen) {
    return <WebMainMenu onClose={() => setMainMenuOpen(false)} />;
  }

  // Empty state - show centered input (connected but no messages)
  if (messages.length === 0) {
    return (
      <div className="h-screen flex flex-col bg-background">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -ml-2"
              onClick={() => setSidebarOpen((v) => !v)}
              title="Toggle sidebar"
              aria-label="Toggle sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </Button>
            <Logo />
            {/* Session Switcher */}
            <div className="relative group">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (sessions.length > 0) {
                    document.getElementById("session-dropdown-empty")?.classList.toggle("hidden");
                  } else {
                    createSession();
                  }
                }}
              >
                <MessageSquarePlus className="w-4 h-4" />
                <span className="text-sm">New Chat</span>
              </Button>
              {sessions.length > 0 && (
                <div
                  id="session-dropdown-empty"
                  className="hidden absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden"
                >
                  <div className="p-2 border-b border-border/50">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 text-sm h-8"
                      onClick={() => {
                        createSession();
                        document.getElementById("session-dropdown-empty")?.classList.add("hidden");
                      }}
                    >
                      <MessageSquarePlus className="w-4 h-4" />
                      New Chat
                    </Button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer text-sm",
                          session.id === currentSessionId && "bg-accent"
                        )}
                        onClick={() => {
                          if (editingSessionId === session.id) return;
                          switchSession(session.id);
                          document.getElementById("session-dropdown-empty")?.classList.add("hidden");
                        }}
                      >
                        <MessageSquarePlus className="w-4 h-4 shrink-0 text-muted-foreground" />
                        {editingSessionId === session.id ? (
                          <input
                            type="text"
                            value={editingSessionName}
                            onChange={(e) => setEditingSessionName(e.target.value)}
                            onBlur={() => {
                              if (editingSessionName.trim()) {
                                updateSessionTitle(session.id, editingSessionName.trim());
                              }
                              setEditingSessionId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (editingSessionName.trim()) {
                                  updateSessionTitle(session.id, editingSessionName.trim());
                                }
                                setEditingSessionId(null);
                              }
                              if (e.key === "Escape") {
                                setEditingSessionId(null);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 bg-background border border-border rounded px-1.5 py-0.5 text-sm outline-none"
                            autoFocus
                          />
                        ) : (
                          <span
                            className="flex-1 truncate"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingSessionId(session.id);
                              setEditingSessionName(session.title);
                            }}
                          >
                            {session.title}
                          </span>
                        )}
                        <button
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (sessions.length === 1) {
                              createSession();
                            }
                            deleteSession(session.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={studioStatus} gameInfo={gameInfo} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handlePickFolder}
              title="Open project folder"
            >
              <FolderOpen className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowGameMap(true)}
              title="Game Map"
            >
              <Map className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 relative"
              onClick={() => setTaskPanelOpen((v) => !v)}
              title="Tasks"
              aria-label="Open task panel"
            >
              <ListChecks className="w-4 h-4" />
              {activeTaskCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 text-[9px] bg-primary text-primary-foreground rounded-full min-w-[14px] h-[14px] px-1 flex items-center justify-center">
                  {activeTaskCount > 99 ? "99+" : activeTaskCount}
                </span>
              )}
            </Button>

            {/* Start next task. Visible whenever there's a pending or
                needs_resume task and nothing is already running. Clicking it
                runs startTask, which actually streams the chat (the runner
                is registered by Home on mount). */}
            {nextStartableTask && (
              <Button
                variant="default"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => useTaskStore.getState().startTask(nextStartableTask.id)}
                title={`Start: ${nextStartableTask.title || "next task"}`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Start
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMemoryOpen((v) => !v)}
              title="Memory"
              aria-label="Open memory panel"
            >
              <Brain className="w-4 h-4" />
            </Button>

            {/* User Account / Credits Pill */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10 text-xs"
              onClick={() => setAuthModalOpen(true)}
              title="Account & Credits"
            >
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              <span>{currentUser?.unlimitedCredits ? "∞" : currentUser?.credits ?? 0}</span>
              <span className="text-muted-foreground">|</span>
              <User className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium max-w-[80px] truncate">{currentUser?.username || "Guest"}</span>
            </Button>

            {/* Admin Dashboard (If admin) */}
            {currentUser?.role === "admin" && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                onClick={() => setAdminDashboardOpen(true)}
                title="Admin Control Panel"
              >
                <Shield className="w-3.5 h-3.5" />
                Admin
              </Button>
            )}

            <SettingsDialog />
          </div>
        </header>

        {/* Centered content */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
          <div className="w-full max-w-2xl space-y-8">
            {/* Welcome message */}
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-heading text-foreground">
                What are you building today?
              </h1>
              <p className="text-muted-foreground">
                Build, debug, analyze, and improve your Roblox game — your AI
                Roblox development assistant.
              </p>
            </div>

            {/* Quick panel launcher — the workspace is fully usable before
                you send a single message. */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  key: "tasks",
                  icon: ListChecks,
                  label: "Tasks",
                  desc: activeTaskCount > 0 ? `${activeTaskCount} active` : "Queue & history",
                  onClick: () => setTaskPanelOpen(true),
                  highlight: activeTaskCount > 0,
                },
                {
                  key: "memory",
                  icon: Brain,
                  label: "Memory",
                  desc: "Facts Stud remembers",
                  onClick: () => setMemoryOpen(true),
                },
                {
                  key: "map",
                  icon: Map,
                  label: "Game Map",
                  desc: "Blueprint your game",
                  onClick: () => setShowGameMap(true),
                },
              ].map(({ key, icon: Icon, label, desc, onClick, highlight }) => (
                <button
                  key={key}
                  onClick={onClick}
                  className={cn(
                    "group flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 text-center transition-all",
                    "hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40",
                    highlight ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
                  )}
                >
                  <Icon className={cn("w-6 h-6", highlight ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-[11px] text-muted-foreground">{desc}</span>
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="space-y-3">
              <ContextChips
                onChipClick={handleChipClick}
                activeChips={activeChips}
                disabled={isStreaming || !hasConfiguredProvider}
              />
              <PromptInput
                value={input}
                onValueChange={setInput}
                onSubmit={handleSubmit}
                isLoading={isStreaming}
                className={cn(
                  "rounded-2xl border-2 border-border shadow-lg bg-card",
                  isImproving && "relative overflow-hidden"
                )}
              >
                {/* Skeleton shimmer overlay when improving */}
                {isImproving && (
                  <div className="absolute inset-0 pointer-events-none z-10">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" />
                  </div>
                )}
                <PromptInputTextarea
                  placeholder={
                    isImproving
                      ? "Improving your prompt..."
                      : hasConfiguredProvider
                        ? "Ask me anything about Roblox development..."
                        : "Configure an API key in settings to start..."
                  }
                  disabled={!hasConfiguredProvider || isImproving}
                  className={cn(
                    "min-h-[60px] text-base",
                    isImproving && "opacity-60"
                  )}
                />
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-3 pb-2">
                    {pendingAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 text-sm"
                      >
                        {attachment.type.startsWith("image/") ? (
                          <Image className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <File className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="max-w-[150px] truncate">{attachment.name}</span>
                        <button
                          onClick={() => removeAttachment(attachment.id)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Intent suggestions */}
                <IntentSuggestions
                  input={input}
                  onSelectSuggestion={(suggestion) => setInput(suggestion)}
                  lastIntent={lastIntent}
                  disabled={!hasConfiguredProvider || isStreaming}
                />

                <PromptInputActions className="justify-between px-3 py-2">
                  <div className="flex items-center gap-1">
                    <FileUpload
                      onFilesAdded={(files) => {
                        files.forEach((file) => {
                          const isImage = file.type.startsWith("image/");
                          const url = URL.createObjectURL(file);
                          addAttachment({
                            name: file.name,
                            type: file.type,
                            size: file.size,
                            url,
                          });
                        });
                      }}
                      accept="image/*,.pdf,.doc,.docx,.txt,.lua,.rbxl,.rbxmx"
                      multiple
                    >
                      <FileUploadTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      </FileUploadTrigger>
                    </FileUpload>
                    <InstancePicker
                      onSelect={(path) => setInput((prev) => prev + `@${path} `)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <ExecutionModeSelector />
                    <ModelSelector disabled={!hasConfiguredProvider} />

                    {/* Improve Prompt Button */}
                    <PromptInputAction tooltip="Improve prompt for Stud">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-8 w-8 rounded-lg transition-all",
                          isImproving && "animate-pulse",
                          input.trim() && !isImproving && !isStreaming && "text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                        )}
                        onClick={handleImprovePrompt}
                        disabled={!input.trim() || isImproving || isStreaming || !hasConfiguredProvider}
                      >
                        {isImproving ? (
                          <Loader variant="circular" size="sm" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                      </Button>
                    </PromptInputAction>
                    <Button
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      onClick={handleSubmit}
                      disabled={!input.trim() || isStreaming || !hasConfiguredProvider}
                    >
                      {isStreaming ? (
                        <Square className="h-4 w-4 fill-current" />
                      ) : (
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </PromptInputActions>
              </PromptInput>
            </div>

            {/* Pending task call-to-action: when the queue has a task that
                isn't running yet, surface a big "Start" button so the user
                doesn't have to open the Tasks panel. */}
            {nextStartableTask && (
              <div className="w-full max-w-2xl mx-auto mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-wider text-primary/80 font-semibold">
                    {nextStartableTask.status === "needs_resume" ? "Resume" : "Queued task"}
                  </p>
                  <p className="text-sm font-medium truncate">
                    {nextStartableTask.title || nextStartableTask.prompt || "Untitled task"}
                  </p>
                </div>
                <Button
                  className="rounded-xl gap-1.5"
                  onClick={() => useTaskStore.getState().startTask(nextStartableTask.id)}
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start
                </Button>
              </div>
            )}

            {/* Suggestions */}
            <div className="flex flex-wrap justify-center gap-2">
              {displayedSuggestions.map((suggestion) => (
                <PromptSuggestion
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="rounded-xl"
                >
                  {suggestion}
                </PromptSuggestion>
              ))}
            </div>

            {/* Not configured warning */}
            {!hasConfiguredProvider && (
              <div className="text-center">
                <p className="text-sm text-amber-600">
                  <Icon name="key" size="sm" className="inline mr-1" />
                  No API key configured.{" "}
                  <SettingsDialog>
                    <button className="underline hover:no-underline">
                      Open settings
                    </button>
                  </SettingsDialog>{" "}
                  to add one.
                </p>
              </div>
            )}
          </div>
        </main>

        {renderOverlays()}
      </div>
    );
  }

  // Chat view
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -ml-2"
            onClick={() => setSidebarOpen((v) => !v)}
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
          <LogoMark className="w-8 h-8" />
          <span className="text-lg font-logo">Stud</span>
          <div className="h-4 w-px bg-border mx-1" />
          {/* Session Switcher */}
          <div className="relative group">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (sessions.length > 0) {
                  document.getElementById("session-dropdown")?.classList.toggle("hidden");
                } else {
                  createSession();
                }
              }}
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span className="text-sm">New Chat</span>
            </Button>
            {sessions.length > 0 && (
              <div
                id="session-dropdown"
                className="hidden absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden"
              >
                <div className="p-2 border-b border-border/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 text-sm h-8"
                    onClick={() => {
                      createSession();
                      document.getElementById("session-dropdown")?.classList.add("hidden");
                    }}
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    New Chat
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer text-sm",
                        session.id === currentSessionId && "bg-accent"
                      )}
                      onClick={() => {
                        if (editingSessionId === session.id) return;
                        switchSession(session.id);
                        document.getElementById("session-dropdown")?.classList.add("hidden");
                      }}
                    >
                      <MessageSquarePlus className="w-4 h-4 shrink-0 text-muted-foreground" />
                      {editingSessionId === session.id ? (
                        <input
                          type="text"
                          value={editingSessionName}
                          onChange={(e) => setEditingSessionName(e.target.value)}
                          onBlur={() => {
                            if (editingSessionName.trim()) {
                              updateSessionTitle(session.id, editingSessionName.trim());
                            }
                            setEditingSessionId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (editingSessionName.trim()) {
                                updateSessionTitle(session.id, editingSessionName.trim());
                              }
                              setEditingSessionId(null);
                            }
                            if (e.key === "Escape") {
                              setEditingSessionId(null);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 bg-background border border-border rounded px-1.5 py-0.5 text-sm outline-none"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="flex-1 truncate"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingSessionId(session.id);
                            setEditingSessionName(session.title);
                          }}
                        >
                          {session.title}
                        </span>
                      )}
                      <button
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (sessions.length === 1) {
                            createSession();
                          }
                          deleteSession(session.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={studioStatus} gameInfo={gameInfo} />
          <div className="h-4 w-px bg-border mx-1" />
          {/* Main menu — return to the landing/start screen. The chat state
              stays in the store, so dismissing the menu brings you back to
              exactly where you were. */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMainMenuOpen(true)}
            title="Main menu"
            aria-label="Open main menu"
          >
            <House className="w-4 h-4" />
          </Button>
          {/* Folder Picker */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handlePickFolder}
            title="Open project folder"
          >
            <FolderOpen className="w-4 h-4" />
          </Button>
          {/* Game Map */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowGameMap(true)}
            title="Game Map"
          >
            <Map className="w-4 h-4" />
          </Button>

          {/* User Account / Credits Pill */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10 text-xs"
            onClick={() => setAuthModalOpen(true)}
            title="Account & Credits"
          >
            <Coins className="w-3.5 h-3.5 text-amber-500" />
            <span>{currentUser?.unlimitedCredits ? "∞" : currentUser?.credits ?? 0}</span>
            <span className="text-muted-foreground">|</span>
            <User className="w-3.5 h-3.5 text-primary" />
            <span className="font-medium max-w-[80px] truncate">{currentUser?.username || "Guest"}</span>
          </Button>

          {/* Admin Dashboard (If admin) */}
          {currentUser?.role === "admin" && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
              onClick={() => setAdminDashboardOpen(true)}
              title="Admin Control Panel"
            >
              <Shield className="w-3.5 h-3.5" />
              Admin
            </Button>
          )}

          <div className="h-4 w-px bg-border mx-1" />
          {/* Start next task. Visible whenever there's a pending or
              needs_resume task and nothing is already running. Clicking it
              runs startTask, which actually streams the chat (the runner is
              registered by Home on mount). */}
          {nextStartableTask && (
            <Button
              variant="default"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => useTaskStore.getState().startTask(nextStartableTask.id)}
              title={`Start: ${nextStartableTask.title || "next task"}`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 relative"
            onClick={() => setTaskPanelOpen((v) => !v)}
            title="Tasks"
            aria-label="Open task panel"
          >
            <ListChecks className="w-4 h-4" />
            {activeTaskCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 text-[9px] bg-primary text-primary-foreground rounded-full min-w-[14px] h-[14px] px-1 flex items-center justify-center">
                {activeTaskCount > 99 ? "99+" : activeTaskCount}
              </span>
            )}
          </Button>
          <ChatActions
            onClear={clearMessages}
            disabled={messages.length === 0 || isStreaming}
          />
          <SettingsPanel
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings className="w-4 h-4" />
              </Button>
            }
          />
        </div>
      </header>

      {/* Chat messages */}
      <ChatContainerRoot className="flex-1 relative">
        <ChatContainerContent className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {/* Error alert */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex items-start gap-3">
              <div className="flex-shrink-0 w-5 h-5 mt-0.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium">Error</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="flex-shrink-0 text-red-500 hover:text-red-700"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Empty state when no messages */}
          {messages.length === 0 && !isStreaming && (
            <EmptyState className="py-8" />
          )}

          {messages.map((message) => (
            <Message key={message.id} className="gap-4">
              {message.role === "assistant" ? (
                <BotAvatar />
              ) : (
                <UserAvatar />
              )}
              <div className="flex-1 space-y-3">
                {/* Context chips indicator for user messages */}
                {message.role === "user" && message.contextChips && message.contextChips.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {message.contextChips.map((chip) => (
                      <span
                        key={chip}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-600 rounded-full"
                      >
                        {chip === "search-models" && <><Box className="w-3 h-3" /> Models</>}
                        {chip === "docs" && <><FileText className="w-3 h-3" /> Docs</>}
                        {chip === "web" && <><Globe className="w-3 h-3" /> Web</>}
                        {chip === "run-code" && <><Play className="w-3 h-3" /> Run</>}
                        {chip === "plan" && <><ListTodo className="w-3 h-3" /> Plan</>}
                      </span>
                    ))}
                  </div>
                )}

                {/* Attachments for user messages */}
                {message.role === "user" && message.attachments && message.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {message.attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="group relative bg-muted rounded-lg overflow-hidden"
                      >
                        {attachment.type.startsWith("image/") ? (
                          <button
                            onClick={() => setPreviewImage({ url: attachment.url, name: attachment.name })}
                            className="relative"
                          >
                            <img
                              src={attachment.url}
                              alt={attachment.name}
                              className="h-20 w-20 object-cover rounded-lg cursor-pointer hover:opacity-90"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                              <Maximize2 className="h-5 w-5 text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="h-20 w-20 flex flex-col items-center justify-center p-2 bg-muted rounded-lg">
                            <File className="h-6 w-6 text-muted-foreground" />
                            <span className="text-xs text-center mt-1 truncate max-w-full">
                              {attachment.name}
                            </span>
                          </div>
                        )}
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a
                            href={attachment.url}
                            download={attachment.name}
                            className="p-1.5 bg-white rounded-full shadow hover:bg-gray-100"
                          >
                            <Download className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Execution result (shown first) */}
                {message.role === "assistant" && message.executionResult && (
                  <ExecutionResultCard 
                    result={message.executionResult}
                    toolCallCount={message.toolCalls?.length || 0}
                    className="mb-3"
                  />
                )}

                {/* Tool calls (shown in collapsible group) */}
                {message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0 && (
                  <ToolActivityGroup 
                    toolCalls={message.toolCalls}
                    className="mb-3"
                  />
                )}

                {/* Message content */}
                {message.content ? (
                  <MessageContent
                    markdown={message.role === "assistant"}
                    className={cn(
                      "prose prose-sm max-w-none",
                      message.role === "user" && "bg-muted/50 rounded-2xl px-4 py-3"
                    )}
                  >
                    {message.content}
                  </MessageContent>
                ) : (
                  isStreaming && message.role === "assistant" && !message.toolCalls?.length && (
                    <div className="flex items-center gap-2 h-8">
                      <Loader variant="wave" size="sm" />
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                  )
                )}
              </div>
            </Message>
          ))}

          {/* Pending question from AI */}
          {pendingQuestion && (
            <div className="max-w-2xl mx-auto">
              <QuestionPrompt
                questions={pendingQuestion.questions}
                onSubmit={answerQuestion}
                disabled={false}
              />
            </div>
          )}

          {/* Streaming indicator */}
          {isStreaming && !pendingQuestion && (
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-xl max-w-fit mx-auto">
              <Loader variant="wave" size="sm" />
              {(() => {
                const lastMsg = messages[messages.length - 1];
                const runningTool = lastMsg?.toolCalls?.find(tc => tc.status === "running");
                if (runningTool) {
                  return <span className="text-sm text-muted-foreground">Running {runningTool.name.replace(/_/g, " ")}...</span>;
                }
                return <span className="text-sm text-muted-foreground">AI is working...</span>;
              })()}
            </div>
          )}
        </ChatContainerContent>
        
        {/* Scroll to bottom button */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
          <ScrollButton className="shadow-lg rounded-full" />
        </div>
      </ChatContainerRoot>

      {/* Input */}
      <div className="border-t border-border/50 bg-card/50 backdrop-blur-sm px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          <ContextChips
            onChipClick={handleChipClick}
            activeChips={activeChips}
            disabled={isStreaming}
          />
          <PromptInput
            value={input}
            onValueChange={setInput}
            onSubmit={handleSubmit}
            isLoading={isStreaming}
            className={cn(
              "rounded-2xl border shadow-sm",
              isImproving && "relative overflow-hidden"
            )}
          >
            {/* Skeleton shimmer overlay when improving */}
            {isImproving && (
              <div className="absolute inset-0 pointer-events-none z-10">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" />
              </div>
            )}
            <PromptInputTextarea
              placeholder={isImproving ? "Improving your prompt..." : "Ask a follow-up..."}
              className={cn(
                "min-h-[44px] text-base",
                isImproving && "opacity-60"
              )}
              disabled={isImproving}
            />
            <PromptInputActions className="justify-between px-3 py-2">
              <div className="flex items-center gap-1">
                <FileUpload
                  onFilesAdded={(files) => {
                    files.forEach((file) => {
                      const isImage = file.type.startsWith("image/");
                      const url = URL.createObjectURL(file);
                      addAttachment({
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        url,
                      });
                    });
                  }}
                  accept="image/*,.pdf,.doc,.docx,.txt,.lua,.rbxl,.rbxmx"
                  multiple
                >
                  <FileUploadTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </FileUploadTrigger>
                </FileUpload>
                <InstancePicker
                  onSelect={(path) => setInput((prev) => prev + `@${path} `)}
                />
              </div>
              <div className="flex items-center gap-2">
                <ExecutionModeSelector />
                <ModelSelector />
                {/* Toolbox Button */}
                <PromptInputAction tooltip="Open Toolbox (search Creator Store)">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-primary hover:text-primary hover:bg-primary/10"
                    onClick={() => setToolboxOpen(true)}
                  >
                    <Box className="h-4 w-4" />
                  </Button>
                </PromptInputAction>
                {/* Improve Prompt Button */}
                <PromptInputAction tooltip="Improve prompt for Stud (AI enhances your message)">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8 rounded-lg transition-all",
                      isImproving && "animate-pulse",
                      input.trim() && !isImproving && !isStreaming && "text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                    )}
                    onClick={handleImprovePrompt}
                    disabled={!input.trim() || isImproving || isStreaming}
                  >
                    {isImproving ? (
                      <Loader variant="circular" size="sm" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                </PromptInputAction>
                {isStreaming ? (
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8 rounded-lg"
                    onClick={handleStop}
                  >
                    <Square className="h-4 w-4 fill-current" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={handleSubmit}
                    disabled={!input.trim()}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </PromptInputActions>
          </PromptInput>
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette
        onCommand={(cmd, payload) => {
          if (cmd === "prompt" && typeof payload === "string") {
            setInput(payload);
          }
        }}
        onClearChat={clearMessages}
      />

      {/* Image Preview Modal */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl p-0 bg-black/90 border-none">
          <DialogTitle className="sr-only">{previewImage?.name}</DialogTitle>
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-2 right-2 z-50 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
          >
            <X className="h-5 w-5" />
          </button>
          {previewImage && (
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-h-[80vh] mx-auto object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Out of Credits Alert Dialog */}
      <Dialog open={creditAlertOpen} onOpenChange={setCreditAlertOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="flex items-center gap-2 text-amber-500">
            <Coins className="w-5 h-5" />
            No Credits Remaining
          </DialogTitle>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              You have used all your AI credits. Please log in to your account or visit the Admin Dashboard to top up or enable unlimited credits.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreditAlertOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                onClick={() => {
                  setCreditAlertOpen(false);
                  setAuthModalOpen(true);
                }}
              >
                <User className="w-4 h-4" />
                Account / Top-up
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {renderOverlays()}

      {/* Persistent sidebar (slide-in) */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar
          onOpenMemory={() => setMemoryOpen(true)}
          onClose={() => setSidebarOpen(false)}
        />
      </div>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

    </div>
  );
}

export default Home;
