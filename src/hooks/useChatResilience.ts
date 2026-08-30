import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useChatStore } from '@/stores/chat';
import { usePersistenceStore } from '@/stores/persistence';
import { studioRequest } from '@/lib/roblox';

export interface ChatState {
  messages: any[];
  isStreaming: boolean;
  error: string | null;
  isConnecting: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
  isBuffering: boolean;
}

export interface ChatActions {
  sendMessage: (content: string) => Promise<void>;
  continueChat: () => void;
  bufferMessage: (message: any) => void;
  flushBuffer: () => Promise<void>;
  setConnectionQuality: (quality: ChatState['connectionQuality']) => void;
  setIsConnecting: (connecting: boolean) => void;
}

export function useChatResilience() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isStreaming: false,
    error: null,
    isConnecting: false,
    connectionQuality: 'excellent',
    isBuffering: false,
  });

  const { messages, isStreaming, error, isConnecting, connectionQuality, isBuffering } = state;
  const chatStore = useChatStore();
  const persistenceStore = usePersistenceStore();
  const continuityInterval = useRef<NodeJS.Timeout | null>(null);
  const bufferTimeout = useRef<NodeJS.Timeout | null>(null);
  const retryAttempts = useRef<number>(0);
  const lastSuccessfulOperation = useRef<number>(Date.now());

  // Enhanced message sending with buffering and retry logic
  const sendMessage = useCallback(async (content: string) => {
    const now = Date.now();
    
    // Check if we're in a state where we can send directly
    if (state.connectionQuality === 'offline' || !navigator.onLine) {
      // Buffer the message for later
      const message = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content,
        createdAt: new Date(),
        retryCount: 0,
        maxRetries: 3,
      };
      
      persistenceStore.addBufferedMessage(message);
      setState(prev => ({ ...prev, isBuffering: true }));
      return;
    }
    
    // Try to send immediately
    try {
      setState(prev => ({ ...prev, isConnecting: true, error: null }));
      
      // Check connection quality before sending
      const isGoodConnection = await checkConnectionQuality();
      
      if (isGoodConnection || state.connectionQuality === 'good') {
        // Send directly with enhanced error handling
        const result = await studioRequest('/chat', { message: content });
        
        if (result.success) {
          // Success - update UI and reset retry attempts
          retryAttempts.current = 0;
          lastSuccessfulOperation.current = now;
          
          // Add message to chat store
          chatStore.addMessage({
            role: 'user',
            content,
          });
          
          setState(prev => ({
            ...prev,
            isConnecting: false,
            isBuffering: false,
          }));
        } else {
          // API error - buffer and retry
          throw new Error(result.error || 'Chat API error');
        }
      } else {
        // Poor connection - buffer for later
        const message = {
          id: crypto.randomUUID(),
          role: 'user' as const,
          content,
          createdAt: new Date(),
          retryCount: 0,
          maxRetries: 3,
        };
        
        persistenceStore.addBufferedMessage(message);
        setState(prev => ({ ...prev, isBuffering: true }));
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      
      // Increment retry attempts
      retryAttempts.current++;
      
      // Check if we should buffer based on error type
      const shouldBuffer = shouldBufferOperation(errorMessage);
      
      if (shouldBuffer && retryAttempts.current < 3) {
        // Buffer and retry later
        const message = {
          id: crypto.randomUUID(),
          role: 'user' as const,
          content,
          createdAt: new Date(),
          retryCount: retryAttempts.current,
          maxRetries: 3,
        };
        
        persistenceStore.addBufferedMessage(message);
        setState(prev => ({
          ...prev,
          error: `${errorMessage} (will retry)`, 
          isBuffering: true,
        }));
      } else {
        // Too many failures or unrecoverable error
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : String(error),
          isConnecting: false,
          isBuffering: false,
        }));
      }
    }
  }, [state.connectionQuality]);

  // Enhanced connection quality check
  const checkConnectionQuality = useCallback(async (): Promise<boolean> => {
    const now = Date.now();
    const timeSinceLastSuccess = now - lastSuccessfulOperation.current;
    
    // If we were successful recently and connection is good, return true
    if (timeSinceLastSuccess < 30000 && state.connectionQuality === 'good') {
      return true;
    }
    
    try {
      // Perform a lightweight connectivity test
      const bridgeTest = await Promise.race([
        studioRequest('/health'),
        new Promise<{ success: boolean }>((resolve) => 
          setTimeout(() => resolve({ success: false }), 3000)
        )
      ]);
      
      if (bridgeTest.success) {
        setState(prev => ({ ...prev, connectionQuality: 'good' }));
        persistenceStore.updateConnectionQuality('good');
        return true;
      } else {
        setState(prev => ({ ...prev, connectionQuality: 'poor' }));
        persistenceStore.updateConnectionQuality('poor');
        return false;
      }
    } catch (error) {
      // Network error or timeout
      const isNetworkDown = !navigator.onLine;
      
      if (isNetworkDown) {
        setState(prev => ({ ...prev, connectionQuality: 'offline' }));
        persistenceStore.updateConnectionQuality('offline');
        return false;
      } else {
        setState(prev => ({ ...prev, connectionQuality: 'poor' }));
        persistenceStore.updateConnectionQuality('poor');
        return false;
      }
    }
  }, [state.connectionQuality]);

  // Determine if an operation should be buffered based on error type
  const shouldBufferOperation = useCallback((errorMessage: string): boolean => {
    const error = errorMessage.toLowerCase();
    
    // Buffer for network errors, timeouts, and rate limits
    const bufferableErrors = [
      'network',
      'timeout',
      'connection',
      'rate limit',
      '503',
      '502',
      'failed to fetch',
      'network error',
    ];
    
    return bufferableErrors.some(err => error.includes(err));
  }, []);

  // Force continue chat even with poor connection
  const continueChat = useCallback(() => {
    console.log('[ChatResilience] Continuing chat despite connection issues');
    
    // Clear any error states
    setState(prev => ({
      ...prev,
      error: null,
      isConnecting: false,
    }));
    
    // Attempt to flush buffer
    if (state.isBuffering) {
      bufferTimeout.current = setTimeout(() => {
        flushBuffer();
      }, 1000);
    }
    
    // Start continuity monitoring
    if (!continuityInterval.current) {
      continuityInterval.current = setInterval(() => {
        // Periodically check if we can sync
        if (state.isBuffering && Date.now() - lastSuccessfulOperation.current > 60000) {
          flushBuffer();
        }
      }, 30000);
    }
  }, [state.isBuffering]);

  // Flush buffered messages to server
  const flushBuffer = useCallback(async () => {
    if (!state.isBuffering) return;
    
    try {
      setState(prev => ({ ...prev, isBuffering: true }));
      
      const persistedState = usePersistenceStore.getState();
      if (persistedState.bufferedMessages.length === 0) {
        setState(prev => ({ ...prev, isBuffering: false }));
        return;
      }
      
      // Process messages in batches
      const batchSize = 3;
      const messagesToProcess = persistedState.bufferedMessages.slice(0, batchSize);
      
      for (const message of messagesToProcess) {
        try {
          const result = await studioRequest('/chat', { message: message.content });
          
          if (result.success) {
            // Success - remove from buffer
            persistenceStore.removeBufferedMessage(message.id);
            lastSuccessfulOperation.current = Date.now();
          } else {
            // Failed - increment retry count
            persistenceStore.removeBufferedMessage(message.id);
            persistenceStore.addBufferedMessage({
              ...message,
              retryCount: (message as any).retryCount + 1,
            });
          }
        } catch (error) {
          // Network error - keep in buffer
          persistenceStore.removeBufferedMessage(message.id);
          persistenceStore.addBufferedMessage({
            ...message,
            retryCount: (message as any).retryCount + 1,
          });
        }
      }
      
      setState(prev => ({
        ...prev,
        isBuffering: persistedState.bufferedMessages.length > batchSize,
      }));
      
    } catch (error) {
      console.error('[ChatResilience] Error flushing buffer:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to flush buffer',
        isBuffering: true,
      }));
    }
  }, [state.isBuffering]);

  // Buffer a message for later sending
  const bufferMessage = useCallback((message: any) => {
    persistenceStore.addBufferedMessage(message);
    setState(prev => ({ ...prev, isBuffering: true }));
  }, []);

  // Set connection quality
  const setConnectionQuality = useCallback((quality: ChatState['connectionQuality']) => {
    setState(prev => ({ ...prev, connectionQuality: quality }));
    persistenceStore.updateConnectionQuality(quality);
  }, []);

  // Set connecting state
  const setIsConnecting = useCallback((connecting: boolean) => {
    setState(prev => ({ ...prev, isConnecting: connecting }));
  }, []);

  // Periodic buffer flush
  useEffect(() => {
    // Flush buffer every 2 minutes if we have messages
    const flushInterval = setInterval(() => {
      if (state.isBuffering) {
        flushBuffer();
      }
    }, 120000);
    
    return () => {
      clearInterval(flushInterval);
      if (continuityInterval.current) {
        clearInterval(continuityInterval.current);
      }
      if (bufferTimeout.current) {
        clearTimeout(bufferTimeout.current);
      }
    };
  }, [state.isBuffering, flushBuffer]);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({ ...prev, connectionQuality: 'good' }));
      persistenceStore.updateConnectionQuality('good');
      // Try to flush buffer when coming back online
      if (state.isBuffering) {
        flushBuffer();
      }
    };
    
    const handleOffline = () => {
      setState(prev => ({ ...prev, connectionQuality: 'poor' }));
      persistenceStore.updateConnectionQuality('poor');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [state.isBuffering, flushBuffer]);

  return {
    ...state,
    sendMessage,
    continueChat,
    bufferMessage,
    flushBuffer,
    setConnectionQuality,
    setIsConnecting,
  };
}

export default useChatResilience;