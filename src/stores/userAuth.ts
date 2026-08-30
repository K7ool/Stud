import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UserAccount {
  id: string;
  username: string;
  role: "admin" | "user";
  credits: number;
  unlimitedCredits: boolean;
  createdAt: string;
  lastLoginAt: string;
}

export interface UserAuthState {
  currentUser: UserAccount | null;
  users: UserAccount[];
  globalUnlimitedCredits: boolean;
  defaultStartingCredits: number;

  // Actions
  login: (username: string, password?: string) => { success: boolean; error?: string };
  register: (username: string, password?: string) => { success: boolean; error?: string };
  logout: () => void;
  deductCredit: (amount?: number) => boolean;
  hasCredits: () => boolean;
  
  // Admin actions
  adminSetCredits: (userId: string, credits: number) => void;
  adminToggleUnlimited: (userId: string, unlimited?: boolean) => void;
  adminSetGlobalUnlimited: (enabled: boolean) => void;
  adminGiveSelfCredits: (amount: number) => void;
  adminDeleteUser: (userId: string) => void;
}

const DEFAULT_ADMIN: UserAccount = {
  id: "admin-root",
  username: "admin",
  role: "admin",
  credits: 9999,
  unlimitedCredits: true,
  createdAt: new Date().toISOString(),
  lastLoginAt: new Date().toISOString(),
};

export const useUserAuthStore = create<UserAuthState>()(
  persist(
    (set, get) => ({
      currentUser: DEFAULT_ADMIN, // Default to logged in as admin for immediate ease of use
      users: [DEFAULT_ADMIN],
      globalUnlimitedCredits: false,
      defaultStartingCredits: 100,

      login: (username, password) => {
        const cleanUser = username.trim().toLowerCase();
        const cleanPass = password?.trim() ?? "";

        // Check if admin
        if (cleanUser === "admin") {
          if (cleanPass === "admin" || cleanPass === "") {
            let adminAcc = get().users.find((u) => u.username.toLowerCase() === "admin");
            if (!adminAcc) {
              adminAcc = DEFAULT_ADMIN;
              set((s) => ({ users: [...s.users, DEFAULT_ADMIN] }));
            }
            adminAcc = { ...adminAcc, lastLoginAt: new Date().toISOString() };
            set({ currentUser: adminAcc });
            return { success: true };
          }
          return { success: false, error: "Invalid admin password. Use 'admin'." };
        }

        // Regular user login
        const existing = get().users.find((u) => u.username.toLowerCase() === cleanUser);
        if (!existing) {
          return { success: false, error: "Account not found. Please register." };
        }

        const updated = { ...existing, lastLoginAt: new Date().toISOString() };
        set((s) => ({
          currentUser: updated,
          users: s.users.map((u) => (u.id === updated.id ? updated : u)),
        }));
        return { success: true };
      },

      register: (username, _password) => {
        const cleanUser = username.trim();
        if (!cleanUser) {
          return { success: false, error: "Username cannot be empty." };
        }
        if (cleanUser.toLowerCase() === "admin") {
          return { success: false, error: "Username 'admin' already exists. Use the Login tab." };
        }

        const existing = get().users.find((u) => u.username.toLowerCase() === cleanUser.toLowerCase());
        if (existing) {
          return { success: false, error: "Username already taken." };
        }

        const newUser: UserAccount = {
          id: crypto.randomUUID(),
          username: cleanUser,
          role: "user",
          credits: get().defaultStartingCredits,
          unlimitedCredits: false,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };

        set((s) => ({
          users: [...s.users, newUser],
          currentUser: newUser,
        }));
        return { success: true };
      },

      logout: () => {
        set({ currentUser: null });
      },

      hasCredits: () => {
        const state = get();
        if (state.globalUnlimitedCredits) return true;
        if (!state.currentUser) return true; // Allow guest if not strictly locked
        if (state.currentUser.unlimitedCredits) return true;
        return state.currentUser.credits > 0;
      },

      deductCredit: (amount = 1) => {
        const state = get();
        if (state.globalUnlimitedCredits) return true;
        if (!state.currentUser) return true;
        if (state.currentUser.unlimitedCredits) return true;

        if (state.currentUser.credits < amount) {
          return false;
        }

        const newBal = Math.max(0, state.currentUser.credits - amount);
        const updatedUser = { ...state.currentUser, credits: newBal };

        set((s) => ({
          currentUser: updatedUser,
          users: s.users.map((u) => (u.id === updatedUser.id ? updatedUser : u)),
        }));
        return true;
      },

      adminSetCredits: (userId, credits) => {
        set((s) => ({
          users: s.users.map((u) => (u.id === userId ? { ...u, credits } : u)),
          currentUser: s.currentUser?.id === userId ? { ...s.currentUser, credits } : s.currentUser,
        }));
      },

      adminToggleUnlimited: (userId, unlimited) => {
        set((s) => {
          const target = s.users.find((u) => u.id === userId);
          const newVal = unlimited !== undefined ? unlimited : !target?.unlimitedCredits;
          return {
            users: s.users.map((u) => (u.id === userId ? { ...u, unlimitedCredits: newVal } : u)),
            currentUser: s.currentUser?.id === userId ? { ...s.currentUser, unlimitedCredits: newVal } : s.currentUser,
          };
        });
      },

      adminSetGlobalUnlimited: (enabled) => {
        set({ globalUnlimitedCredits: enabled });
      },

      adminGiveSelfCredits: (amount) => {
        set((s) => {
          if (!s.currentUser) return s;
          const updated = { ...s.currentUser, credits: s.currentUser.credits + amount };
          return {
            currentUser: updated,
            users: s.users.map((u) => (u.id === updated.id ? updated : u)),
          };
        });
      },

      adminDeleteUser: (userId) => {
        set((s) => ({
          users: s.users.filter((u) => u.id !== userId),
          currentUser: s.currentUser?.id === userId ? null : s.currentUser,
        }));
      },
    }),
    {
      name: "stud-user-auth",
    }
  )
);
