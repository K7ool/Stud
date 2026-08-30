import React, { useState, useEffect, useRef, useCallback } from 'react';
import { studioRequest, isStudioConnected, isBridgeRunning } from '@/lib/roblox';

interface RetryState {
  attempts: number;
  lastAttempt: number;
  backoffMs: number;
  consecutiveFailures: number;
  maxConsecutiveFailures: number;
}

export function useConnectionMonitor() {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessfulPoll, setLastSuccessfulPoll] = useState<Date | null>(null);
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected' | 'error'>('checking');
  
  const retryState = useRef<RetryState>({
    attempts: 0,
    lastAttempt: 0,
    backoffMs: 1000,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 5,
  });
  
  const pollInterval = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const failureTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastSuccessfulCheckRef = useRef<number>(0);
  
  // Get current timestamp
  const now = () => Date.now();
  
  // Check if we should attempt reconnection based on consecutive failures
  const shouldReconnect = useCallback((state: RetryState) => {
    return state.consecutiveFailures >= state.maxConsecutiveFailures;
  }, []);
  
  // Enhanced connection check with better error handling
  const checkConnection = useCallback(async () => {
    const currentTime = now();
    const state = { ...retryState.current };
    state.lastAttempt = currentTime;
    
    setStatus('checking');
    
    try {
      // Track when we last had a successful connection
      const timeSinceLastSuccess = currentTime - lastSuccessfulCheckRef.current;

      // Skip rapid re-checks if we were just successful (debounce)
      if (timeSinceLastSuccess < 2000 && isConnected) {
        return;
      }
      
      // Check if bridge server is running (this is our primary health check)
      let bridgeRunning = false;
      try {
        bridgeRunning = await isBridgeRunning();
        if (!bridgeRunning) {
          throw new Error('Bridge server not responding');
        }
      } catch (err) {
        console.log('[ConnectionMonitor] Bridge check failed:', err);
        state.consecutiveFailures++;
        retryState.current = state;
        
        if (shouldReconnect(state)) {
          // Trigger reconnection with adaptive delay
          const backoffTime = Math.min(
            state.backoffMs * Math.pow(2, Math.min(state.attempts, 4)),
            30000 // Cap at 30 seconds
          );
          
          if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
          
          reconnectTimeout.current = setTimeout(() => {
            attemptRecovery();
          }, backoffTime);
        }
        
        setIsConnected(false);
        setIsReconnecting(false);
        setError('Bridge server not available');
        setStatus('error');
        return;
      }
      
      // Reset failures on successful bridge check
      if (state.consecutiveFailures > 0) {
        state.consecutiveFailures = 0;
        retryState.current = state;
      }
      
      // Check Studio connection specifically
      let studioConnected = false;
      try {
        // Add timeout to prevent hanging
        studioConnected = await Promise.race([
          isStudioConnected(),
          new Promise<boolean>(resolve => setTimeout(() => resolve(false), 3000))
        ]);
      } catch (err) {
        console.log('[ConnectionMonitor] Studio connection check failed:', err);
        studioConnected = false;
      }
      
      if (studioConnected) {
        // Both bridge and Studio are responding
        if (!isConnected) {
          console.log('[ConnectionMonitor] Successfully reconnected');
          setIsConnected(true);
          setIsReconnecting(false);
          setError(null);
          setStatus('connected');
          lastSuccessfulCheckRef.current = currentTime;
          setLastSuccessfulPoll(new Date());
        }
        
        // Reset retry state on success
        retryState.current = {
          attempts: 0,
          lastAttempt: currentTime,
          backoffMs: 1000,
          consecutiveFailures: 0,
          maxConsecutiveFailures: 5,
        };
        
        // Clean up any pending timeouts
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
        }
        if (failureTimeout.current) {
          clearTimeout(failureTimeout.current);
        }
        
      } else {
        // Bridge running but Studio not connected
        state.consecutiveFailures++;
        state.attempts++;
        retryState.current = state;
        
        if (!isReconnecting) {
          setIsConnected(false);
          setIsReconnecting(true);
          setError('Bridge running but Roblox Studio not connected');
          setStatus('disconnected');
        }
        
        // Schedule reconnection if we haven't exceeded max attempts
        if (state.attempts < 3) {
          const backoffTime = Math.min(
            state.backoffMs * Math.pow(2, state.attempts - 1),
            10000
          );
          
          if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
          
          reconnectTimeout.current = setTimeout(() => {
            checkConnection();
            setIsReconnecting(false);
          }, backoffTime);
        }
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection monitor error';
      console.error('[ConnectionMonitor] Unexpected error:', errorMessage);
      
      state.consecutiveFailures++;
      retryState.current = state;
      
      setIsConnected(false);
      setIsReconnecting(false);
      setError(errorMessage);
      setStatus('error');
      
      // Schedule recovery attempt
      if (shouldReconnect(state)) {
        if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = setTimeout(() => {
          attemptRecovery();
        }, 5000);
      }
    }
  }, [isConnected, isReconnecting, shouldReconnect]);
  
  // Attempt to recover from connection issues
  const attemptRecovery = useCallback(() => {
    console.log('[ConnectionMonitor] Attempting connection recovery...');
    setIsReconnecting(true);
    setError('Attempting to reconnect...');
    
    // Try a more aggressive recovery approach
    const recoveryAttempts = retryState.current.attempts;
    
    if (recoveryAttempts < 3) {
      // Wait a moment then try again
      if (failureTimeout.current) clearTimeout(failureTimeout.current);
      failureTimeout.current = setTimeout(() => {
        checkConnection();
        setIsReconnecting(false);
      }, 2000);
    } else {
      setIsReconnecting(false);
      setError('Connection recovery failed - please restart Stud or check plugin installation');
      setStatus('error');
    }
  }, [checkConnection]);
  
  // Start monitoring with adaptive polling
  useEffect(() => {
    // Initial connection check
    checkConnection();
    
    // Adaptive polling interval based on connection state
    const poll = () => {
      const state = retryState.current;
      const currentTime = now();
      // Adjust polling frequency based on connection state
      if (isConnected && !isReconnecting) {
        // Connected - poll less frequently
        return 5000; // 5 seconds
      } else if (isReconnecting) {
        // Reconnecting - poll more frequently
        return 1000; // 1 second
      } else if (state.consecutiveFailures > 0) {
        // Disconnected with failures - decrease interval gradually
        const baseInterval = 2000; // 2 seconds
        const decreaseFactor = Math.min(state.consecutiveFailures, 5);
        return Math.max(500, baseInterval - (decreaseFactor * 100)); // Min 500ms
      } else {
        // Just checking
        return 3000; // 3 seconds
      }
    };
    
    // Set up polling
    pollInterval.current = setInterval(() => {
      checkConnection();
    }, poll());
    
    // Clean up on unmount
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (failureTimeout.current) {
        clearTimeout(failureTimeout.current);
      }
    };
  }, [checkConnection, isConnected, isReconnecting]);
  
  // Manual reconnection trigger
  const reconnect = useCallback(() => {
    console.log('[ConnectionMonitor] Manual reconnection triggered');
    
    // Cancel any pending timeouts
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    if (failureTimeout.current) clearTimeout(failureTimeout.current);
    
    setIsReconnecting(true);
    setError('Manual reconnection in progress...');
    setStatus('checking');
    
    // Immediate check
    checkConnection();
    
    // If still not connected after a delay, force recovery
    if (failureTimeout.current) clearTimeout(failureTimeout.current);
    failureTimeout.current = setTimeout(() => {
      if (!isConnected) {
        attemptRecovery();
      }
    }, 5000);
    
  }, [checkConnection, isConnected, attemptRecovery]);
  
  return {
    isConnected,
    isReconnecting,
    error,
    lastSuccessfulPoll,
    status,
    reconnect,
    checkConnection,
  };
}

export default useConnectionMonitor;