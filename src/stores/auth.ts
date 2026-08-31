import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  OAuthAuth,
  DeviceCodeData,
  getStoredAuth,
  clearAuth,
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
  
  // Actions
  setAuthMethod: (method: AuthMethod) => void;
  startLogin: () => Promise<void>;
  logout: () => void;
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
      deviceCode: null,
      deviceCodePending: false,

      setAuthMethod: (method) => {
        set({ authMethod: method });
      },

      startLogin: async () => {
        // The ChatGPT Codex client forces a localhost:1455 callback that a
        // website cannot serve, so we always use the official device-code flow
        // (no callback needed) regardless of platform.
        await get().startDeviceLogin();
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
        set({ isLoggingIn: false, loginError: null });
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

// Poll for device-code authorization completion
export function useOAuthCallbackPoller() {
  const { isLoggingIn } = useAuthStore();
  
  // Check periodically while logging in
  if (typeof window !== "undefined" && isLoggingIn) {
    const interval = setInterval(async () => {
      const { pollDeviceLogin } = useAuthStore.getState();
      const completed = await pollDeviceLogin();
      if (completed) {
        clearInterval(interval);
      }
    }, 1000);
    
    // Cleanup after 5 minutes
    setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
  }
}
