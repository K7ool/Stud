import { create } from "zustand";
import { isStudioConnected, isBridgeRunning, getGameInfo, type GameInfo } from "@/lib/roblox";
import { useChatStore } from "./chat";

// Throttle game-info refreshes (see checkConnection). Stored outside the store
// so it isn't persisted/serialized.
let lastGameInfoFetch = 0;

export type ConnectionStatus = "disconnected" | "bridge_only" | "connected" | "reconnecting";

export interface RobloxState {
  status: ConnectionStatus;
  lastCheck: Date | null;
  error: string | null;
  lastSuccessfulPoll: Date | null;
  consecutiveFailures: number;
  reconnectAttempts: number;
  gameInfo: GameInfo | null;

  // Actions
  setStatus: (status: ConnectionStatus) => void;
  checkConnection: () => Promise<void>;
  startPolling: () => () => void;
  attemptReconnection: () => Promise<void>;
  fetchGameInfo: () => Promise<void>;
}

export const useRobloxStore = create<RobloxState>()((set, get) => ({
  status: "disconnected",
  lastCheck: null,
  error: null,
  lastSuccessfulPoll: null,
  consecutiveFailures: 0,
  reconnectAttempts: 0,
  gameInfo: null,

  setStatus: (status) => set({ status }),
  
  checkConnection: async () => {
    const state = get();
    const now = new Date();
    
    try {
      // First check if bridge is running
      const bridgeUp = await isBridgeRunning();
      if (!bridgeUp) {
        set({ 
          status: "disconnected", 
          lastCheck: now,
          error: "Bridge server not running",
          consecutiveFailures: state.consecutiveFailures + 1,
        });
        return;
      }
      
      // Then check if Studio is connected
      const studioUp = await isStudioConnected();
      
      if (studioUp) {
        // Refresh game info at most once per 30s; game info rarely changes and
        // fetching it every poll adds a redundant relay round-trip.
        if (Date.now() - lastGameInfoFetch > 30000) {
          lastGameInfoFetch = Date.now();
          get().fetchGameInfo();
        }

        // Successfully connected
        if (state.consecutiveFailures > 0) {
          // Was disconnected, now reconnecting
          set({
            status: "reconnecting",
            lastCheck: now,
            error: null,
            consecutiveFailures: 0,
            reconnectAttempts: 0,
          });
          // Wait a moment before declaring fully connected
          setTimeout(() => {
            set({ status: "connected", lastCheck: new Date() });
          }, 1000);
        } else {
          // Already connected, keep status
          set({
            status: "connected",
            lastCheck: now,
            error: null,
            lastSuccessfulPoll: now,
            consecutiveFailures: 0,
          });
        }
      } else {
        // Bridge running but no client connected
        set({
          status: "bridge_only",
          lastCheck: now,
          error: "Bridge server running but Roblox Studio not connected",
          consecutiveFailures: state.consecutiveFailures + 1,
        });
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Connection error";
      const newFailures = state.consecutiveFailures + 1;
      
      set({ 
        status: "disconnected", 
        lastCheck: now,
        error: errorMsg,
        consecutiveFailures: newFailures,
        reconnectAttempts: newFailures > 3 ? state.reconnectAttempts + 1 : state.reconnectAttempts,
      });
      
      // If more than 3 consecutive failures, attempt reconnection
      if (newFailures >= 3) {
        setTimeout(() => get().attemptReconnection(), 2000);
      }
    }
  },
  
  startPolling: () => {
    // Initial check
    get().checkConnection();
    
    // Poll more frequently when disconnected - decrease over time
    // Start with 1 second, gradually increase to 3 seconds if stable
    const initialInterval = 1000;
    let currentInterval = initialInterval;
    
    const poll = () => {
      const state = get();

      // Skip poll during AI streaming — plugin is busy executing scripts and
      // may not respond to health checks, causing false "disconnected" flickers
      if (useChatStore.getState().isStreaming) {
        return 2000;
      }

      // Adjust polling frequency based on connection state
      if (state.status === "disconnected") {
        // Poll frequently when disconnected to reconnect quickly
        currentInterval = Math.max(1000, 3000 - state.consecutiveFailures * 100);
      } else if (state.status === "reconnecting" && state.consecutiveFailures < 3) {
        // Poll every 500ms during reconnection
        currentInterval = 500;
      } else {
        // Normal polling when connected
        currentInterval = 2000;
      }

      get().checkConnection();

      return currentInterval;
    };
    
    const interval = setInterval(poll, poll());
    
    // Return cleanup function
    return () => clearInterval(interval);
  },
  
  attemptReconnection: async () => {
    const state = get();
    
    if (state.status === "disconnected" && state.reconnectAttempts < 3) {
      set({
        status: "reconnecting",
        error: "Attempting to reconnect...",
        reconnectAttempts: state.reconnectAttempts + 1,
      });
      
      try {
        // Try to restart the bridge server
        // Note: This would require implementing a restart mechanism in the Rust bridge
        // For now, we'll just attempt a status check
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if we can reconnect
        const previousStatus: ConnectionStatus = state.status as ConnectionStatus;
        await get().checkConnection();

        if (previousStatus === "connected" || previousStatus === "reconnecting") {
          // Success
          set({
            status: "connected",
            error: null,
            reconnectAttempts: 0,
          });
        }
      } catch (e) {
        set({
          status: "disconnected",
          error: "Reconnection attempt failed",
        });
      }
    } else if (state.reconnectAttempts >= 3) {
      // Too many reconnection attempts, show error
      set({
        status: "disconnected",
        error: "Connection failed - please check if Stud desktop app is running and the plugin is installed",
      });
    }
  },

  fetchGameInfo: async () => {
    const state = get();
    if (state.status !== "connected" && state.status !== "bridge_only") return;
    try {
      const info = await getGameInfo();
      set({ gameInfo: info });
    } catch {
      set({ gameInfo: null });
    }
  },
}));
