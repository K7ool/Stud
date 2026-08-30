import { create } from "zustand";
import { isStudioConnected, isBridgeRunning, getGameInfo, type GameInfo } from "@/lib/roblox";
import { useChatStore } from "./chat";

export type ConnectionStatus = "disconnected" | "bridge_only" | "connected" | "reconnecting";

// Add missing type definitions at the top
export interface RobloxState {
  status: ConnectionStatus;
  lastCheck: Date | null;
  error: string | null;
  lastSuccessfulPoll: Date | null;
  consecutiveFailures: number;
  reconnectAttempts: number;
  gameInfo: GameInfo | null;
  
  // Script path caching
  lastScriptFetch: string | null;
  
  // Recent failures tracking for rate limiting
  recentFailures: Array<{ time: number; error: string }>;
  
  // Connection health indicators
  connectionHealth: {
    lastStablePeriod: number;
    failuresSinceLastSuccess: number;
    consecutiveTimeouts: number;
  };
  
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
  // Script path caching
  lastScriptFetch: null,
  // Recent failures tracking for rate limiting
  recentFailures: [],
  // Connection health indicators
  connectionHealth: {
    lastStablePeriod: Date.now(),
    failuresSinceLastSuccess: 0,
    consecutiveTimeouts: 0,
  },
  
  setStatus: (status) => set({ status }),
  
  checkConnection: async () => {
    const state = get();
    const now = new Date();
    
    // Prevent excessive polling during reconnection attempts
    if (state.status === "reconnecting" && state.consecutiveFailures < 3) {
      const timeSinceLastCheck = state.lastCheck ? Date.now() - state.lastCheck.getTime() : Infinity;
      if (timeSinceLastCheck < 500) return;
    }
    
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
            get().fetchGameInfo();
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
          get().fetchGameInfo();
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
    
    // Track last poll time to prevent excessive calls
    let lastPollTime = Date.now();
    let pollTimeout: NodeJS.Timeout | null = null;
    
    const poll = () => {
      const now = Date.now();
      const state = get();
      
      // Skip poll during AI streaming — plugin is busy executing scripts and
      // may not respond to health checks, causing false "disconnected" flickers
      if (useChatStore.getState().isStreaming) {
        pollTimeout = setTimeout(poll, 2000);
        return;
      }
      
      // Prevent excessive polling during reconnection attempts
      if (state.status === "reconnecting" && state.consecutiveFailures < 3) {
        const timeSinceLastCheck = state.lastCheck ? Date.now() - state.lastCheck.getTime() : Infinity;
        if (timeSinceLastCheck < 500) {
          pollTimeout = setTimeout(poll, 500);
          return;
        }
      }
      
      // Calculate base interval based on connection state
      let interval: number;
      if (state.status === "disconnected") {
        // Poll frequently when disconnected to reconnect quickly
        interval = Math.max(1000, 3000 - state.consecutiveFailures * 100);
      } else if (state.status === "reconnecting" && state.consecutiveFailures < 3) {
        // Poll every 500ms during reconnection
        interval = 500;
      } else {
        // Normal polling when connected
        interval = 2000;
      }
      
      // Ensure minimum interval between polls
      const timeSinceLastPoll = now - lastPollTime;
      const waitTime = Math.max(interval - timeSinceLastPoll, 0);
      
      lastPollTime = now + waitTime;
      
      // Schedule next poll after waiting
      pollTimeout = setTimeout(poll, waitTime);
      
      // Check connection without blocking the poll timer
      get().checkConnection();
    };
    
    // Start the polling loop
    pollTimeout = setTimeout(poll, 100);
    
    // Return cleanup function
    return () => {
      if (pollTimeout) clearTimeout(pollTimeout);
    };
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
  
  // Track last successful operations to prevent unnecessary reloads
  lastScriptFetch: null as string | null,
  
  // Track recent failures to prevent spam
  recentFailures: [] as { time: number; error: string }[],
  
  // Track connection health indicators
  connectionHealth: {
    lastStablePeriod: number;
    failuresSinceLastSuccess: number;
    consecutiveTimeouts: number;
  },

  fetchGameInfo: async () => {
    const state = get();
    if (state.status !== "connected" && state.status !== "bridge_only") return;
    
    // Don't fetch if we've just fetched recently (within 5 seconds)
    if (state.gameInfo && state.lastSuccessfulPoll) {
      const timeSinceLastPoll = Date.now() - state.lastSuccessfulPoll.getTime();
      if (timeSinceLastPoll < 5000) return;
    }
    
    try {
      const info = await getGameInfo();
      if (info) {
        set({ gameInfo: info, lastSuccessfulPoll: new Date() });
      } else {
        set({ gameInfo: null });
      }
    } catch {
      set({ gameInfo: null });
    }
  },
}));
