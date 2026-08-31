import { create } from "zustand";
import { persist } from "zustand/middleware";
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
  loginUrl: string | null; // URL to show as fallback
  
  // Actions
  setAuthMethod: (method: AuthMethod) => void;
  startLogin: () => Promise<void>;
  completeLogin: (code: string, state: string) => Promise<void>;
  logout: () => void;
  checkOAuthCallback: () => Promise<boolean>;
  cancelLogin: () => void;

  // Device-code flow (works on web and desktop)
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
        // On the web, OpenAI's Codex client forces a localhost:1455 callback that a
        // browser cannot serve, so the PKCE redirect cannot work. Use the official
        // device-code flow instead (no callback needed).
        if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
          await get().startDeviceLogin();
          return;
        }
        try {
          const { url } = await startOAuthLogin();
          // Store the URL for fallback display
          set({ loginUrl: url });
          // Try to open in default browser using Tauri's opener
          await openUrl(url);
        } catch (error) {
          // Even if browser open fails, we have the URL to show
          set({ 
            loginError: error instanceof Error ? error.message : String(error),
          });
        }
      },

      startDeviceLogin: async () => {
        set({ isLoggingIn: true, loginError: null, loginUrl: null, deviceCodePending: true });
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
          loginUrl: null,
        });
      },

      cancelLogin: () => {
        set({ isLoggingIn: false, loginUrl: null, loginError: null });
      },

      completeLogin: async (code: string, state: string) => {
        set({ isLoggingIn: true, loginError: null });
        try {
          const auth = await handleOAuthCallback(code, state);
          set({
            oauthAuth: auth,
            isLoggingIn: false,
            authMethod: "oauth",
          });
          // Fetch models after successful login
          useModelsStore.getState().fetchModels();
        } catch (error) {
          set({ 
            loginError: error instanceof Error ? error.message : String(error),
            isLoggingIn: false 
          });
          throw error;
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

      checkOAuthCallback: async () => {
        // The local OAuth callback server only exists in the Tauri desktop
        // app. In web mode there is no localhost:1455 listener, so polling it
        // only produces ERR_CONNECTION_REFUSED noise — skip it entirely.
        if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
          return false;
        }
        // Poll the OAuth callback server for pending auth data
        try {
          const response = await fetch("http://localhost:1455/auth/poll");
          if (!response.ok) return false;
          
          const data = await response.json();
          if (!data.pending) return false;
          
          const { code, state } = data;
          
          // Clear the callback data from the server
          await fetch("http://localhost:1455/auth/clear", { method: "POST" });
          
          if (code && state) {
            await get().completeLogin(code, state);
            return true;
          }
        } catch (error) {
          // Server not running or network error - ignore
          console.debug("[OAuth] Poll failed:", error);
        }
        return false;
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

// Poll for OAuth callback completion
export function useOAuthCallbackPoller() {
  const { checkOAuthCallback, isLoggingIn } = useAuthStore();
  
  // Check periodically while logging in
  if (typeof window !== "undefined" && isLoggingIn) {
    const interval = setInterval(async () => {
      let completed = false;
      // On the web use the device-code poller; on desktop poll the local callback
      // server. In desktop mode there is no deviceCode, so fall back to the server.
      const isWeb = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
      if (isWeb) {
        const { pollDeviceLogin } = useAuthStore.getState();
        completed = await pollDeviceLogin();
      } else {
        completed = await checkOAuthCallback();
      }
      if (completed) {
        clearInterval(interval);
      }
    }, 1000);
    
    // Cleanup after 5 minutes
    setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
  }
}
