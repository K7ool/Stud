import { create } from "zustand";

export interface BufferedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  retryCount: number;
  maxRetries: number;
  toolCalls?: any[];
  contextChips?: string[];
}

export interface OfflineQueueEntry {
  id: string;
  type: "message" | "tool_call";
  data: any;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export interface PersistenceState {
  // Persistent storage for offline operations
  bufferedMessages: BufferedMessage[];
  offlineQueue: OfflineQueueEntry[];
  lastSuccessfulSync: number;
  isOnline: boolean;
  connectionQuality: "excellent" | "good" | "poor" | "offline";
  
  // Actions
  addBufferedMessage: (message: BufferedMessage) => void;
  addToOfflineQueue: (entry: OfflineQueueEntry) => void;
  removeBufferedMessage: (id: string) => void;
  removeFromOfflineQueue: (id: string) => void;
  updateConnectionQuality: (quality: PersistenceState["connectionQuality"]) => void;
  setOnlineStatus: (isOnline: boolean) => void;
  syncWithOnline: () => Promise<boolean>;
  retryFailedOperations: () => Promise<{ success: number; failed: number }>;
}

export const usePersistenceStore = create<PersistenceState>()((set, get) => ({
  // Initialize with empty state
  bufferedMessages: [],
  offlineQueue: [],
  lastSuccessfulSync: 0,
  isOnline: true,
  connectionQuality: "excellent",

  addBufferedMessage: (message) => {
    set((state) => ({
      bufferedMessages: [...state.bufferedMessages, message],
    }));
  },

  addToOfflineQueue: (entry) => {
    set((state) => ({
      offlineQueue: [...state.offlineQueue, entry],
    }));
  },

  removeBufferedMessage: (id) => {
    set((state) => ({
      bufferedMessages: state.bufferedMessages.filter((msg) => msg.id !== id),
    }));
  },

  removeFromOfflineQueue: (id) => {
    set((state) => ({
      offlineQueue: state.offlineQueue.filter((entry) => entry.id !== id),
    }));
  },

  updateConnectionQuality: (quality) => {
    set((state) => ({
      connectionQuality: quality,
      // Adjust behavior based on connection quality
      isOnline: quality !== "offline",
    }));
  },

  setOnlineStatus: (isOnline) => {
    set({ isOnline });
  },

  syncWithOnline: async () => {
    const state = get();
    let successCount = 0;
    let failedCount = 0;

    // Try to sync buffered messages
    for (const message of state.bufferedMessages) {
      try {
        // Attempt to send the message
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            // Simulate API call
            if (Math.random() > 0.3) { // 70% success rate
              resolve(true);
            } else {
              reject(new Error("Network error"));
            }
          }, 1000);
        });
        
        successCount++;
        // Remove successfully sent message
        set((s) => ({
          bufferedMessages: s.bufferedMessages.filter((msg) => msg.id !== message.id),
        }));
      } catch (error) {
        failedCount++;
        console.log(`Failed to send message ${message.id}:`, error);
      }
    }

    // Try to sync offline queue operations
    for (const entry of state.offlineQueue) {
      try {
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            if (Math.random() > 0.4) { // 60% success rate
              resolve(true);
            } else {
              reject(new Error("Operation failed"));
            }
          }, 2000);
        });
        
        successCount++;
        set((s) => ({
          offlineQueue: s.offlineQueue.filter((e) => e.id !== entry.id),
        }));
      } catch (error) {
        failedCount++;
        console.log(`Failed to sync operation ${entry.id}:`, error);
        
        // Increment retry count
        if (entry.retryCount < entry.maxRetries) {
          set((s) => ({
            offlineQueue: s.offlineQueue.map((e) =>
              e.id === entry.id
                ? { ...e, retryCount: e.retryCount + 1 }
                : e
            ),
          }));
        }
      }
    }

    if (successCount > 0 || failedCount === 0) {
      set({ lastSuccessfulSync: Date.now() });
    }

    return successCount > 0;
  },

  retryFailedOperations: async () => {
    const state = get();
    let success = 0;
    let failed = 0;

    for (const entry of state.offlineQueue) {
      if (entry.retryCount < entry.maxRetries) {
        try {
          await new Promise((resolve, reject) => {
            setTimeout(() => {
              if (Math.random() > 0.3) { // 70% retry success
                resolve(true);
              } else {
                reject(new Error("Retry failed"));
              }
            }, 1000);
          });
          
          success++;
          set((s) => ({
            offlineQueue: s.offlineQueue.filter((e) => e.id !== entry.id),
          }));
        } catch (error) {
          failed++;
          console.log(`Retry failed for operation ${entry.id}:`, error);
          
          if (entry.retryCount + 1 >= entry.maxRetries) {
            set((s) => ({
              offlineQueue: s.offlineQueue.filter((e) => e.id !== entry.id),
            }));
          }
        }
      } else {
        failed++;
      }
    }

    return { success, failed };
  },
}));