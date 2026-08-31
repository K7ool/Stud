import React, { useState, useEffect, useCallback, useRef } from 'react';
import { studioRequest, isStudioConnected, isBridgeRunning } from '@/lib/roblox';

interface RetryState {
  attempts: number;
  lastAttempt: number;
  backoffMs: number;
  consecutiveFailures: number;
}

export function ConnectionManager() {
  const [isConnected, setIsConnected] = useState(false);
  const [isAttemptingReconnect, setIsAttemptingReconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessfulPoll, setLastSuccessfulPoll] = useState<Date | null>(null);
  
  const retryState = useRef<RetryState>({
    attempts: 0,
    lastAttempt: 0,
    backoffMs: 1000,
    consecutiveFailures: 0,
  });
  
  const pollInterval = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const consecutiveFailureTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Enhanced connection check with better error handling and retry logic
  const checkConnection = useCallback(async () => {
    const now = Date.now();
    const state = retryState.current;
    
    try {
      // First, check if bridge is running (this is less expensive)
      const bridgeRunning = await isBridgeRunning();
      if (!bridgeRunning) {
        // Bridge server is not running - this is a major issue
        if (state.consecutiveFailures >= 2) {
          // After 2 consecutive failures, attempt to restart
          console.log('[ConnectionManager] Bridge not running, attempting recovery...');
          setError('Bridge server not running - attempting to restart');
          setIsAttemptingReconnect(true);
          
          if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
          }
          
          // Wait before attempting recovery
          reconnectTimeout.current = setTimeout(() => {
            // In a real implementation, this would restart the bridge server
            // For now, we'll just attempt to check again
            checkConnection();
            setIsAttemptingReconnect(false);
          }, 5000); // Wait 5 seconds before attempting recovery
        } else {
          setIsConnected(false);
          setIsAttemptingReconnect(false);
          setError('Bridge server not running');
        }
        state.consecutiveFailures++;
        return;
      }
      
      // Reset consecutive failures on successful bridge check
      if (state.consecutiveFailures > 0) {
        state.consecutiveFailures = 0;
        retryState.current = { ...state, consecutiveFailures: 0 };
      }
      
      // Now check if Studio is actually connected
      const studioConnected = await isStudioConnected();
      
      if (studioConnected) {
        // Successfully connected to both bridge and Studio
        if (!isConnected) {
          console.log('[ConnectionManager] Successfully connected to Stud Desktop');
          setIsConnected(true);
          setError(null);
          setIsAttemptingReconnect(false);
          setLastSuccessfulPoll(new Date());
        }
        
        // Reset retry state on success
        retryState.current = {
          attempts: 0,
          lastAttempt: now,
          backoffMs: 1000,
          consecutiveFailures: 0,
        };
        
        // Clear any pending reconnect timeouts
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
        }
        
      } else {
        // Bridge running but Studio not connected
        state.consecutiveFailures++;
        retryState.current = { ...state };
        
        if (!isAttemptingReconnect) {
          setIsConnected(false);
          setIsAttemptingReconnect(true);
          setError('Bridge running but Roblox Studio not connected');
          
          // Set up reconnection attempt with exponential backoff
          if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
          }
          
          const backoffTime = state.backoffMs * Math.pow(2, Math.min(state.attempts, 5));
          reconnectTimeout.current = setTimeout(() => {
            checkConnection();
            setIsAttemptingReconnect(false);
          }, backoffTime);
        }
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection check failed';
      console.error('[ConnectionManager] Connection check failed:', errorMessage);
      
      state.consecutiveFailures++;
      retryState.current = { ...state };
      
      // For any error, attempt to reconnect with appropriate backoff
      if (!isAttemptingReconnect) {
        setIsConnected(false);
        setIsAttemptingReconnect(true);
        setError(errorMessage);
        
        // Calculate exponential backoff
        const backoffTime = state.backoffMs * Math.pow(2, Math.min(state.attempts, 5));
        if (backoffTime > 60000) { // Cap at 60 seconds
          retryState.current = { ...state, backoffMs: 60000 };
        }
        
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
        }
        
        reconnectTimeout.current = setTimeout(() => {
          checkConnection();
          setIsAttemptingReconnect(false);
        }, backoffTime);
      }
    }
  }, [isConnected, isAttemptingReconnect]);
  
  // Start monitoring connection with adaptive polling
  useEffect(() => {
    // Initial connection check
    checkConnection();
    
    // Adaptive polling based on connection state
    const poll = () => {
      const state = retryState.current;
      const now = Date.now();
      
      // Adjust polling frequency based on connection state
      if (isConnected && !isAttemptingReconnect) {
        // Connected - poll less frequently
        return 5000; // 5 seconds
      } else if (isAttemptingReconnect) {
        // Reconnecting - poll more frequently
        return 1000; // 1 second
      } else {
        // Disconnected - poll frequently to try to reconnect
        // Gradually decrease frequency if we've been disconnected longer
        const timeSinceLastFailure = now - state.lastAttempt;
        if (timeSinceLastFailure > 60000) { // 1 minute
          return 10000; // 10 seconds after 1 minute of being disconnected
        } else {
          return 2000; // 2 seconds initially
        }
      }
    };
    
    // Set up polling
    const interval = setInterval(() => {
      checkConnection();
    }, poll());
    
    // Clean up
    return () => {
      clearInterval(interval);
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (consecutiveFailureTimeout.current) {
        clearTimeout(consecutiveFailureTimeout.current);
      }
    };
  }, [checkConnection]);
  
  // Manual reconnection function
  const reconnect = useCallback(async () => {
    console.log('[ConnectionManager] Manual reconnection requested');
    
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }
    
    setIsAttemptingReconnect(true);
    setError('Attempting to reconnect...');
    
    // Immediate check first
    await checkConnection();
    
    // If still not connected, wait and try again
    if (!isConnected && reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }
    
    reconnectTimeout.current = setTimeout(() => {
      checkConnection();
      setIsAttemptingReconnect(false);
    }, 2000);
    
  }, [checkConnection, isConnected]);
  
  return {
    isConnected,
    isAttemptingReconnect,
    error,
    lastSuccessfulPoll,
    reconnect,
  };
}

export default ConnectionManager;