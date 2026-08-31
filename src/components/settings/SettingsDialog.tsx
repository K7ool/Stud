import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icons/Icon";
import { ProviderIcon } from "@/components/icons/ProviderIcon";
import { Loader } from "@/components/ui/loader";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { useModelsStore } from "@/stores/models";
import { cn } from "@/lib/utils";
import { LogOut, Sparkles, Key, Copy, Check, X, RefreshCw, Bug, Sun, Moon, Monitor, Globe } from "lucide-react";

// Theme selector component
function ThemeSelector() {
  const { appSettings, setTheme } = useSettingsStore();

  const themes = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: Monitor },
  ];

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Theme</label>
      <div className="flex gap-2">
        {themes.map(({ value, label, icon: IconComponent }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-medium transition-all",
              appSettings.theme === value
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
            )}
          >
            <IconComponent className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Debug panel to show current auth/model status
function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { authMethod, isOAuthAuthenticated, oauthAuth } = useAuthStore();
  const { selectedModel, selectedProvider, apiKeys } = useSettingsStore();
  const { codexModels, lastFetched, isLoading } = useModelsStore();

  const isOAuth = isOAuthAuthenticated();

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground pt-4"
      >
        <Bug className="w-3 h-3" />
        Show Debug Info
      </button>
    );
  }

  return (
    <div className="pt-4 border-t space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Debug Info
        </h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Hide
        </button>
      </div>
      <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs space-y-1">
        <div><span className="text-muted-foreground">Auth Method:</span> {authMethod}</div>
        <div><span className="text-muted-foreground">OAuth Authenticated:</span> {isOAuth ? "true" : "false"}</div>
        <div><span className="text-muted-foreground">OAuth Auth Object:</span> {oauthAuth ? "exists" : "null"}</div>
        <div><span className="text-muted-foreground">Has OpenAI Key:</span> {apiKeys.openai ? "true" : "false"}</div>
        <div><span className="text-muted-foreground">Has Anthropic Key:</span> {apiKeys.anthropic ? "true" : "false"}</div>
        <div><span className="text-muted-foreground">Has OpenRouter Key:</span> {apiKeys.openrouter ? "true" : "false"}</div>
        <div><span className="text-muted-foreground">Selected Provider:</span> {selectedProvider}</div>
        <div><span className="text-muted-foreground">Selected Model:</span> {selectedModel}</div>
        <div><span className="text-muted-foreground">Models Count:</span> {codexModels.length}</div>
        <div><span className="text-muted-foreground">Models Loading:</span> {isLoading ? "true" : "false"}</div>
        <div><span className="text-muted-foreground">Last Fetched:</span> {lastFetched ? new Date(lastFetched).toLocaleString() : "never"}</div>
      </div>
      <p className="text-xs text-muted-foreground">
        Check browser console (F12) for detailed logs when sending messages.
      </p>
    </div>
  );
}

interface ApiKeyInputProps {
  provider: "openai" | "anthropic" | "openrouter";
  label: string;
  placeholder: string;
  icon?: React.ReactNode;
  description?: string;
}

function ApiKeyInput({ provider, label, placeholder, icon, description }: ApiKeyInputProps) {
  const { apiKeys, setApiKey, hasApiKey } = useSettingsStore();
  const [showKey, setShowKey] = useState(false);
  const [value, setValue] = useState(apiKeys[provider] || "");
  const isConfigured = hasApiKey(provider);

  const handleSave = () => {
    setApiKey(provider, value);
  };

  const handleClear = () => {
    setValue("");
    setApiKey(provider, "");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon || <ProviderIcon id={provider} size="sm" />}
          <label className="text-sm font-medium">{label}</label>
        </div>
        {isConfigured && (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Icon name="check" size="sm" />
            Configured
          </span>
        )}
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={showKey ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="pr-10 rounded-xl"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <Icon name={showKey ? "eye-off" : "eye"} size="sm" />
          </button>
        </div>
        {value !== (apiKeys[provider] || "") ? (
          <Button onClick={handleSave} size="sm" className="rounded-xl">
            Save
          </Button>
        ) : isConfigured ? (
          <Button onClick={handleClear} variant="outline" size="sm" className="rounded-xl text-destructive">
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ChatGPT Plus/Pro OAuth component
function ChatGPTAuth() {
  const {
    isLoggingIn,
    loginError,
    loginUrl,
    startLogin,
    logout,
    cancelLogin,
    checkOAuthCallback,
    isOAuthAuthenticated,
  } = useAuthStore();
  const { codexModels, isLoading: isLoadingModels, refreshModels, lastFetched } = useModelsStore();

  const [copied, setCopied] = useState(false);
  const isAuthenticated = isOAuthAuthenticated();
  // ChatGPT OAuth only works in the Tauri desktop app (OpenAI forces a
  // localhost:1455 callback). On the web we surface a desktop-only notice.
  const isWebMode = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

  // Poll for OAuth callback when logging in
  useEffect(() => {
    if (!isLoggingIn) return;
    
    const interval = setInterval(async () => {
      const completed = await checkOAuthCallback();
      if (completed) {
        clearInterval(interval);
      }
    }, 1000);
    
    // Cleanup after 5 minutes
    const timeout = setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isLoggingIn, checkOAuthCallback]);

  const handleCopyUrl = async () => {
    if (loginUrl) {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#10a37f] to-[#1a7f64] flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <label className="text-sm font-medium">ChatGPT Plus/Pro</label>
        </div>
        {isAuthenticated && (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Icon name="check" size="sm" />
            Signed In
          </span>
        )}
      </div>
      
      <p className="text-xs text-muted-foreground">
        Sign in with your ChatGPT Plus or Pro subscription. No API key needed!
      </p>

      {loginError && (
        <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg">
          {loginError}
        </p>
      )}

      {isAuthenticated ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-700">Connected to ChatGPT</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4 mr-1" />
              Sign Out
            </Button>
          </div>
          {/* Model info and refresh */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-muted-foreground">
              {codexModels.length} models available
              {lastFetched && (
                <span className="ml-1">
                  · Updated {new Date(lastFetched).toLocaleTimeString()}
                </span>
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshModels}
              disabled={isLoadingModels}
              className="h-6 px-2 text-xs"
            >
              <RefreshCw className={cn("w-3 h-3 mr-1", isLoadingModels && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      ) : isLoggingIn ? (
        <div className="space-y-3">
          {/* Signing in state with URL fallback */}
          <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl">
            <div className="flex items-center gap-2">
              <Loader variant="dots" size="sm" />
              <Loader variant="text-shimmer" text="Signing in" size="sm" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelLogin}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* URL fallback */}
          {loginUrl && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Browser didn't open? Copy this URL and paste it in your browser:
              </p>
              <div className="flex gap-2">
                <Input
                  value={loginUrl}
                  readOnly
                  className="text-xs font-mono rounded-lg h-9"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyUrl}
                  className="shrink-0 h-9 w-9 p-0 rounded-lg"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Complete sign-in in your browser. This window will update automatically.
          </p>
        </div>
      ) : isWebMode ? (
        <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
          ChatGPT Plus/Pro sign-in is only available in the{" "}
          <span className="font-medium text-foreground">Stud desktop app</span>.
          On the web, use{" "}
          <span className="font-medium text-foreground">OpenCode Zen</span> (free
          models like Big Pickle) or an API key from the tabs above.
        </div>
      ) : (
        <Button 
          onClick={startLogin}
          disabled={isLoggingIn}
          className="w-full rounded-xl bg-gradient-to-r from-[#10a37f] to-[#1a7f64] hover:from-[#0d8f6e] hover:to-[#166b55]"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Sign in with ChatGPT
        </Button>
      )}
    </div>
  );
}

// Auth method tabs
type TabType = "chatgpt" | "apikeys" | "openrouter" | "opencode";

function useAuthTabs() {
  const { isOAuthAuthenticated } = useAuthStore();
  const { hasApiKey, setSelectedModel } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<TabType>("chatgpt");

  const isOAuth = isOAuthAuthenticated();
  const hasAnyKey =
    hasApiKey("openai") || hasApiKey("anthropic") || hasApiKey("openrouter") || hasApiKey("opencode");

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === "openrouter") {
      setSelectedModel("google/gemini-2.0-flash-thinking-exp:free", "openrouter");
    }
    if (tab === "opencode") {
      setSelectedModel("opencode/big-pickle", "opencode");
    }
  };

  return { activeTab, setActiveTab: handleTabChange, isOAuth, hasAnyKey };
}

function AuthMethodTabs({ activeTab, onTabChange, isOAuth, hasAnyKey }: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  isOAuth: boolean;
  hasAnyKey: boolean;
}) {
  return (
    <div className="flex gap-2 p-1 bg-muted rounded-xl">
      <button
        onClick={() => onTabChange("chatgpt")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all",
          activeTab === "chatgpt"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Sparkles className="w-4 h-4" />
        ChatGPT
        {isOAuth && <span className="w-2 h-2 rounded-full bg-green-500" />}
      </button>
      <button
        onClick={() => onTabChange("apikeys")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all",
          activeTab === "apikeys"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Key className="w-4 h-4" />
        API Keys
        {hasAnyKey && <span className="w-2 h-2 rounded-full bg-green-500" />}
      </button>
      <button
        onClick={() => onTabChange("openrouter")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all",
          activeTab === "openrouter"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Globe className="w-4 h-4" />
        Free
        {hasAnyKey && <span className="w-2 h-2 rounded-full bg-green-500" />}
      </button>
      <button
        onClick={() => onTabChange("opencode")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all",
          activeTab === "opencode"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Sparkles className="w-4 h-4" />
        Zen
        {hasAnyKey && <span className="w-2 h-2 rounded-full bg-green-500" />}
      </button>
    </div>
  );
}

// OpenRouter Free Models component
function OpenRouterSection() {
  const { apiKeys, setApiKey, hasApiKey, selectedModel, setSelectedModel } = useSettingsStore();
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [showKey, setShowKey] = useState(false);

  const isConfigured = hasApiKey("openrouter");

  const fetchModels = async () => {
    if (!apiKeys.openrouter) return;
    setIsLoading(true);
    try {
      const { fetchOpenRouterModels } = await import("@/lib/models/openrouter");
      const fetchedModels = await fetchOpenRouterModels(apiKeys.openrouter);
      setModels(fetchedModels.map(m => ({ id: m.id, name: m.name })));
    } catch (error) {
      console.error("Failed to fetch OpenRouter models:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isConfigured) {
      fetchModels();
    }
  }, [isConfigured]);

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModel(e.target.value, "openrouter");
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-xl p-4 border border-purple-500/20">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-5 h-5 text-purple-500" />
          <span className="font-medium">OpenRouter Free Models</span>
          {isConfigured && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Active</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Access free AI models including Gemini, Claude Haiku, Llama, DeepSeek and more. No subscription required!
        </p>

        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKeys.openrouter || ""}
                onChange={(e) => setApiKey("openrouter", e.target.value)}
                placeholder="sk-or-v1-..."
                className="pr-10 rounded-xl"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Icon name={showKey ? "eye-off" : "eye"} size="sm" />
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchModels}
              disabled={!apiKeys.openrouter || isLoading}
              className="rounded-xl"
            >
              {isLoading ? <Loader variant="circular" size="sm" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>

          {models.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Select Model</label>
              <select
                value={selectedModel}
                onChange={handleModelChange}
                className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm"
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Get your API key from{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              openrouter.ai/keys
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// OpenCode Zen Free Models component
function OpenCodeSection() {
  const { apiKeys, setApiKey, selectedModel, selectedProvider, setSelectedModel } = useSettingsStore();
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [showKey, setShowKey] = useState(false);

  const fetchModels = async () => {
    setIsLoading(true);
    try {
      const { fetchOpenCodeModels } = await import("@/lib/models/opencode");
      const fetchedModels = await fetchOpenCodeModels(apiKeys.opencode);
      setModels(fetchedModels.map(m => ({ id: m.id, name: m.name })));
    } catch (error) {
      console.error("Failed to fetch OpenCode models:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const currentModel = selectedProvider === "opencode" && selectedModel ? selectedModel : "opencode/big-pickle";
  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModel(e.target.value, "opencode");
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-xl p-4 border border-emerald-500/20">
        <div className="flex items-center gap-2 mb-2">
          <ProviderIcon id="opencode" size="sm" />
          <span className="font-medium">OpenCode Zen</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Free models like Big Pickle hosted on the OpenCode Zen gateway. No API key required for free models.
        </p>

        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKeys.opencode || ""}
                onChange={(e) => setApiKey("opencode", e.target.value)}
                placeholder="Optional key (free models work without one)"
                className="pr-10 rounded-xl"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Icon name={showKey ? "eye-off" : "eye"} size="sm" />
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchModels}
              disabled={isLoading}
              className="rounded-xl"
            >
              {isLoading ? <Loader variant="circular" size="sm" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>

          {models.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Select Model</label>
              <select
                value={currentModel}
                onChange={handleModelChange}
                className="w-full h-9 px-3 rounded-xl border border-input bg-background text-sm"
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Get an optional free key from{" "}
            <a
              href="https://opencode.ai/zen"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              opencode.ai/zen
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

interface SettingsDialogProps {
  children?: React.ReactNode;
}

export function SettingsDialog({ children }: SettingsDialogProps) {
  const { activeTab, setActiveTab, isOAuth, hasAnyKey } = useAuthTabs();

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="icon" className="rounded-xl">
            <Icon name="settings-gear" size="md" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Settings</DialogTitle>
          <DialogDescription>
            Configure your AI provider to start chatting.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Auth method tabs */}
          <AuthMethodTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isOAuth={isOAuth}
            hasAnyKey={hasAnyKey}
          />

          {/* Auth content based on selected tab */}
          <div className="space-y-4">
            {activeTab === "chatgpt" ? (
              <ChatGPTAuth />
            ) : activeTab === "openrouter" ? (
              <OpenRouterSection />
            ) : activeTab === "opencode" ? (
              <OpenCodeSection />
            ) : (
              <>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  API Keys
                </h3>
                <ApiKeyInput
                  provider="openai"
                  label="OpenAI"
                  placeholder="sk-..."
                />
                <ApiKeyInput
                  provider="anthropic"
                  label="Anthropic"
                  placeholder="sk-ant-..."
                />
              </>
            )}
          </div>

          {/* Theme selector */}
          <div className="pt-4 border-t">
            <ThemeSelector />
          </div>

          <div className="pt-4 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Roblox Studio
            </h3>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  "bg-muted-foreground" // Will change to green when connected
                )} />
                <span className="text-sm">Studio Connection</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Not connected
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Install the Stud plugin in Roblox Studio to enable AI-powered editing.
            </p>
          </div>

          {/* Debug Panel - shows auth status */}
          <DebugPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
