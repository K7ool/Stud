import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  OAuthAuth,
  DeviceCodeData,
  getStoredAuth,
  clearAuth,
  startOAuthLogin,
  handleOAuthCallback,
  startDeviceCode,
  pollDeviceCode,
  completeDeviceCodeLogin,
  isAuthenticated,
} from "@/lib/auth/codex";
import { useModelsStore } from "./models";

export type AuthMethod = "api_key" | "oauth";

interface AuthState {
  // Current auth method
  authMethod: AuthMethod;
  
  // OAuth state
  oauthAuth: OAuthAuth | null;
  isLoggingIn: boolean;
  loginError: string | null;
  loginUrl: string | null;

  // Actions
  setAuthMethod: (method: AuthMethod) => void;
  startLogin: () => Promise<void>;
  completeLogin: (code: string, state: string) => Promise<void>;
  checkOAuthCallback: () => Promise<boolean>;
  logout: () => void;
  cancelLogin: () => void;

  // Device-code flow (no callback needed; fallback for web)
  deviceCode: DeviceCodeData | null;
  deviceCodePending: boolean;
  startDeviceLogin: () => Promise<void>;
  pollDeviceLogin: () => Promise<boolean>;
  cancelDeviceLogin: () => void;

  // Getters
  isOAuthAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      authMethod: "api_key",
      oauthAuth: getStoredAuth(),
      isLoggingIn: false,
      loginError: null,
      loginUrl: null,
      deviceCode: null,
      deviceCodePending: false,

      setAuthMethod: (method) => {
        set({ authMethod: method });
      },

      startLogin: async () => {
        set({ isLoggingIn: true, loginError: null, loginUrl: null });
        try {
          const { url } = await startOAuthLogin();
          set({ loginUrl: url });
          // On desktop, open the browser via Tauri. On the web, navigate to the
          // authorize URL (which redirects back to REDIRECT_URI with ?code&state).
          if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
            window.location.href = url;
          } else {
            await openUrl(url);
          }
        } catch (error) {
          set({
            loginError: error instanceof Error ? error.message : String(error),
          });
        }
      },

      completeLogin: async (code: string, state: string) => {
        set({ isLoggingIn: true, loginError: null });
        try {
          const auth = await handleOAuthCallback(code, state);
          set({
            oauthAuth: auth,
            isLoggingIn: false,
            authMethod: "oauth",
            loginError: null,
          });
          useModelsStore.getState().fetchModels();
        } catch (error) {
          set({
            loginError: error instanceof Error ? error.message : String(error),
            isLoggingIn: false,
          });
          throw error;
        }
      },

      startDeviceLogin: async () => {
        set({ isLoggingIn: true, loginError: null, deviceCodePending: true });
        try {
          const deviceCode = await startDeviceCode();
          sessionStorage.setItem("codex_device_auth_id", deviceCode.device_auth_id);
          sessionStorage.setItem("codex_device_user_code", deviceCode.user_code);
          set({ deviceCode, deviceCodePending: false });
        } catch (error) {
          set({
            deviceCodePending: false,
            isLoggingIn: false,
            loginError: error instanceof Error ? error.message : String(error),
          });
        }
      },

      pollDeviceLogin: async () => {
        const { deviceCode } = get();
        if (!deviceCode) return false;
        try {
          const data = await pollDeviceCode(deviceCode.device_auth_id, deviceCode.user_code);
          if (!data) return false;
          const auth = await completeDeviceCodeLogin(
            deviceCode.device_auth_id,
            deviceCode.user_code,
            data
          );
          set({
            oauthAuth: auth,
            deviceCode: null,
            deviceCodePending: false,
            isLoggingIn: false,
            authMethod: "oauth",
            loginError: null,
          });
          sessionStorage.removeItem("codex_device_auth_id");
          sessionStorage.removeItem("codex_device_user_code");
          useModelsStore.getState().fetchModels();
          return true;
        } catch (error) {
          set({
            loginError: error instanceof Error ? error.message : String(error),
            isLoggingIn: false,
            deviceCodePending: false,
            deviceCode: null,
          });
          sessionStorage.removeItem("codex_device_auth_id");
          sessionStorage.removeItem("codex_device_user_code");
          return false;
        }
      },

      cancelDeviceLogin: () => {
        sessionStorage.removeItem("codex_device_auth_id");
        sessionStorage.removeItem("codex_device_user_code");
        set({
          deviceCode: null,
          deviceCodePending: false,
          isLoggingIn: false,
          loginError: null,
        });
      },

      cancelLogin: () => {
        set({ isLoggingIn: false, loginError: null, loginUrl: null });
      },

      checkOAuthCallback: async () => {
        // The browser redirects back to REDIRECT_URI with ?code&state. Parse them
        // from the URL, exchange the code, and clean the URL so a refresh doesn't
        // re-run the exchange.
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");
        if (!code || !state) return false;
        try {
          await get().completeLogin(code, state);
          window.history.replaceState({}, document.title, window.location.pathname);
          return true;
        } catch (e) {
          console.error("[Auth] OAuth callback failed:", e);
          window.history.replaceState({}, document.title, window.location.pathname);
          return false;
        }
      },

      logout: () => {
        clearAuth();
        // Clear cached models on logout
        useModelsStore.getState().clearModels();
        set({
          oauthAuth: null,
          authMethod: "api_key",
          loginError: null,
          deviceCode: null,
          deviceCodePending: false,
        });
      },

      isOAuthAuthenticated: () => {
        const result = isAuthenticated();
        if (import.meta.env.DEV) {
          console.log("[Auth] isOAuthAuthenticated:", result);
        }
        return result;
      },
    }),
    {
      name: "stud-auth",
      partialize: (state) => ({ 
        authMethod: state.authMethod,
      }),
    }
  )
);

// Handle OAuth callback on page load and poll for device-code completion.
export function useOAuthCallbackPoller() {
  const { isLoggingIn } = useAuthStore();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // On mount, if the browser redirected back with ?code&state, exchange it.
    useAuthStore.getState().checkOAuthCallback();

    // While a login is in progress, poll the device-code flow periodically.
    if (!isLoggingIn) return;
    const interval = setInterval(async () => {
      const { pollDeviceLogin, isOAuthAuthenticated } = useAuthStore.getState();
      const completed = isOAuthAuthenticated() || (await pollDeviceLogin());
      if (completed) {
        clearInterval(interval);
      }
    }, 1000);

    const timeout = setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isLoggingIn]);
}
