import React, { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { studioRequest } from '@/lib/roblox';

export function ConnectionMonitor() {
  const [status, setStatus] = useState('checking');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const pollCount = useRef(0);
  const failCount = useRef(0);
  const consecutiveFailures = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Monitor connection by polling the bridge status
  const checkConnection = async () => {
    pollCount.current++;
    setLastCheck(new Date());
    
    try {
      const response = await fetch('http://localhost:3001/stud/status');
      
      if (!response.ok) {
        // Server not responding - treat as failure
        consecutiveFailures.current++;
        setError(`Bridge not responding (HTTP ${response.status})`);
        setStatus('disconnected');
        return false;
      }
      
      const status = await response.json();
      
      if (status.connected) {
        // Successfully connected
        if (consecutiveFailures.current > 0) {
          console.log(`[ConnectionMonitor] Reconnected after ${consecutiveFailures.current} failures`);
        }
        consecutiveFailures.current = 0;
        failCount.current = 0;
        setError(null);
        setStatus('connected');
        return true;
      } else {
        // Server running but no client connected
        consecutiveFailures.current++;
        setError('Bridge running but no client connected');
        setStatus('bridge_only');
        return false;
      }
    } catch (err) {
      // Network error or connection refused
      consecutiveFailures.current++;
      failCount.current++;
      
      // Check if this is a permanent connection issue
      if (failCount.current >= 3) {
        // After 3 consecutive failures, attempt to restart the bridge
        console.log('[ConnectionMonitor] Multiple connection failures, attempting bridge recovery...');
        
        // Clear any existing reconnect timeout
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
        }
        
        // Schedule bridge recovery
        reconnectTimeout.current = setTimeout(() => {
          console.log('[ConnectionMonitor] Attempting to restart bridge server...');
          restartBridge()
            .then(() => {
              console.log('[ConnectionMonitor] Bridge restarted successfully');
              // Reset failure counts
              failCount.current = 0;
              consecutiveFailures.current = 0;
              // Check connection immediately after restart
              checkConnection();
            })
            .catch(err => {
              console.error('[ConnectionMonitor] Failed to restart bridge:', err);
            });
        }, 5000); // Wait 5 seconds before attempting restart
      }
      
      const errorMsg = err instanceof Error ? err.message : 'Connection error';
      setError(errorMsg);
      setStatus('disconnected');
      return false;
    }
  };
  
  // Function to restart the bridge server
  const restartBridge = async () => {
    try {
      // Try to restart the bridge server via Tauri
      // Note: This requires additional API calls from the Rust side
      // For now, we'll just return a promise that simulates restart
      // In a real implementation, you'd call the Tauri command to restart
      
      // Simulate restart delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // After simulated restart, test the connection
      const response = await fetch('http://localhost:3001/stud/status', {
        signal: AbortSignal.timeout(2000)
      });
      
      if (!response.ok) {
        throw new Error(`Bridge restart failed - status: ${response.status}`);
      }
      
      return true;
    } catch (err) {
      throw new Error(`Bridge restart failed: ${err}`);
    }
  };
  
  // Start monitoring
  useEffect(() => {
    if (!isMonitoring) {
      setIsMonitoring(true);
      
      // Initial check
      checkConnection();
      
      // Set up polling - more frequent during failures
      const pollInterval = setInterval(() => {
        checkConnection();
      }, 1000); // Poll every second
      
      // Return cleanup function
      return () => {
        clearInterval(pollInterval);
        setIsMonitoring(false);
        
        // Clear any pending reconnect timeout
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
        }
      };
    }
  }, [isMonitoring]);
  
  // Handle user-initiated reconnection
  const reconnect = async () => {
    setStatus('reconnecting');
    setError(null);
    
    try {
      await restartBridge();
      // Check immediately after restart
      await checkConnection();
    } catch (err) {
      setError(`Reconnect failed: ${err}`);
      setStatus('disconnected');
    }
  };
  
  return { status, lastCheck, error, reconnect, pollCount, failCount, consecutiveFailures };
}

export default ConnectionMonitor;