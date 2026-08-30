import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ApiKeys {
  openai?: string;
  anthropic?: string;
  openrouter?: string;
}

export type ProviderType = "openai" | "anthropic" | "codex" | "openrouter";

export interface AppSettings {
  // UI Settings
  animationsEnabled: boolean;
  soundEnabled: boolean;
  compactMode: boolean;
  showToolDetails: boolean;
  theme: "light" | "dark" | "system";

  // Behavior Settings
  autoScrollChat: boolean;
  confirmDestructiveActions: boolean;
  saveHistory: boolean;
  maxHistoryMessages: number;
  workWithoutStudio: boolean;
}

export interface SettingsState {
  apiKeys: ApiKeys;
  selectedModel: string;
  selectedProvider: ProviderType;
  appSettings: AppSettings;

  // Actions
  setApiKey: (provider: keyof ApiKeys, key: string) => void;
  setSelectedModel: (model: string, provider: ProviderType) => void;
  hasApiKey: (provider: keyof ApiKeys) => boolean;
  getApiKey: (provider: keyof ApiKeys) => string | undefined;
  updateAppSettings: (settings: Partial<AppSettings>) => void;
  resetAppSettings: () => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  getResolvedTheme: () => "light" | "dark";
  applyTheme: () => void;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  animationsEnabled: true,
  soundEnabled: false,
  compactMode: false,
  showToolDetails: true,
  theme: "system",
  autoScrollChat: true,
  confirmDestructiveActions: true,
  saveHistory: true,
  maxHistoryMessages: 100,
  workWithoutStudio: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      apiKeys: {},
      selectedModel: "gpt-4o",
      selectedProvider: "codex" as ProviderType,
      appSettings: DEFAULT_APP_SETTINGS,

      setApiKey: (provider, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        })),

      setSelectedModel: (model, provider) =>
        set({
          selectedModel: model,
          selectedProvider: provider,
        }),

      hasApiKey: (provider) => {
        const key = get().apiKeys[provider];
        return !!key && key.length > 0;
      },

      getApiKey: (provider) => get().apiKeys[provider],

      updateAppSettings: (settings) =>
        set((state) => ({
          appSettings: { ...state.appSettings, ...settings },
        })),

      resetAppSettings: () =>
        set({ appSettings: DEFAULT_APP_SETTINGS }),

      setTheme: (theme) => {
        set((state) => ({
          appSettings: { ...state.appSettings, theme },
        }));
        get().applyTheme();
      },

      getResolvedTheme: () => {
        const { theme } = get().appSettings;
        if (theme === "system") {
          return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        return theme;
      },

      applyTheme: () => {
        const resolved = get().getResolvedTheme();
        const root = document.documentElement;
        if (resolved === "dark") {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }
      },
    }),
    {
      name: "stud-settings",
    }
  )
);
