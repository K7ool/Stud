import { useState, useCallback, useEffect, useRef } from "react";
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
import { GameMap } from "@/components/chat/GameMap";
import { detectIntent, parseSlashCommand } from "@/lib/intents";
import { useChatStore, Attachment } from "@/stores/chat";
import { useSettingsStore } from "@/stores/settings";
import { useRobloxStore, ConnectionStatus } from "@/stores/roblox";
import { usePluginStore } from "@/stores/plugin";
import { useAuthStore } from "@/stores/auth";
import { useUserAuthStore } from "@/stores/userAuth";
import { useGameMapStore } from "@/stores/gameMap";
import { useChat } from "@/lib/ai/providers";
import { setAskUserHandler } from "@/lib/roblox/tools";
import { getStudioSiteId } from "@/lib/roblox/client";
import { ToolboxSearch } from "@/components/ToolboxSearch";
import { AuthModal } from "@/components/auth/AuthModal";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { autoDetectProject, setProjectPath, pickFolder } from "@/lib/file-ops";
import { useAppShortcuts } from "@/hooks/useKeyboardShortcuts";
import { improvePrompt } from "@/lib/ai/prompt-improver";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Maximize2, Shield, User, Coins } from "lucide-react";
import { ArrowUp, Square, CheckCircle2, Download, FolderOpen, RefreshCw, Box, FileText, Globe, Play, ListTodo, Settings, Sparkles, Paperclip, X, Image, File, MessageSquarePlus, Trash2, Map, Lightbulb, Users } from "lucide-react";

const isWebMode = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

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

  const { rootFeature, setRootFeature, addFeature } = useGameMapStore();
  const { appSettings } = useSettingsStore();

  const messages = getCurrentMessages();
  const { hasApiKey } = useSettingsStore();
  const { status: studioStatus, startPolling, gameInfo, fetchGameInfo } = useRobloxStore();
  const { sendMessage } = useChat();
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const hasConfiguredProvider = hasApiKey("openai") || hasApiKey("anthropic") || useAuthStore.getState().isOAuthAuthenticated();
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

    // Deduct 1 credit for generation
    deductCredit(1);

    const userMessage = input.trim();

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

    console.log("[Home] Submitting message:", userMessage, "with context:", chipContext, "intent:", intent.type);

    // Add user message (show without context prefix for cleaner UI, but store chips)
    addMessage({ role: "user", content: userMessage, contextChips: activeChips.length > 0 ? [...activeChips] : undefined });

    // Add placeholder for assistant
    const assistantId = addMessage({ role: "assistant", content: "" });

    setStreaming(true);
    setError(null);

    try {
      const chatMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: fullMessage },
      ];

      console.log("[Home] Sending", chatMessages.length, "messages to AI");

      let fullText = "";

      await sendMessage(chatMessages, {
        onToken: (token) => {
          fullText += token;
          updateMessage(assistantId, fullText);
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
        },
        onFinish: () => {
          console.log("[Home] Stream finished, total length:", fullText.length);
          setStreaming(false);
        },
        onError: (error) => {
          console.error("[Home] Stream error:", error);
          setError(error.message);
          setStreaming(false);
        },
      });
    } catch (error) {
      console.error("[Home] Chat error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(errorMessage);
      setStreaming(false);
    }
  }, [input, isStreaming, messages, activeChips, addMessage, updateMessage, addToolCall, updateToolCall, setStreaming, setError, sendMessage, hasCredits, deductCredit]);

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

  // Show connection screen if not connected (unless workWithoutStudio is enabled).
  const canWorkOffline = appSettings.workWithoutStudio;
  if (!isConnected && !canWorkOffline) {
    return <ConnectionScreen status={studioStatus} />;
  }

  // Empty state - show centered input (connected but no messages)
  if (messages.length === 0) {
    return (
      <div className="h-screen flex flex-col bg-background">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-4">
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
            {currentUser?.isAdmin && (
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
                What would you like to build?
              </h1>
              <p className="text-muted-foreground">
                I can help you create scripts, design systems, and build games in Roblox Studio.
              </p>
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
      </div>
    );
  }

  // Chat view
  return (
    <div className="h-screen flex flex-col bg-background">
      <ToolboxSearch open={toolboxOpen} onOpenChange={setToolboxOpen} onInserted={() => setToolboxOpen(false)} />
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
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
          {currentUser?.isAdmin && (
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

                {/* Tool calls (shown before content for assistant) */}
                {message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0 && (
                  <ToolCalls toolCalls={message.toolCalls} />
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

      {/* Toolbox Search */}
      <ToolboxSearch
        open={toolboxOpen}
        onOpenChange={setToolboxOpen}
      />

      {/* Auth Modal (Login / Register) */}
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        onOpenAdmin={() => {
          setAuthModalOpen(false);
          setAdminDashboardOpen(true);
        }}
      />

      {/* Admin Dashboard */}
      <AdminDashboard
        open={adminDashboardOpen}
        onOpenChange={setAdminDashboardOpen}
      />

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

      {/* Game Map */}
      <GameMap
        open={showGameMap}
        onOpenChange={setShowGameMap}
        onSelectSuggestion={handleGameMapSuggestion}
      />
    </div>
  );
}

export default Home;
