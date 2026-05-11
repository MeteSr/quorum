import { create } from "zustand";

interface AuthState {
  isAuthenticated: boolean;
  principal:       string | null;
  isLoading:       boolean;
  setAuthenticated: (principal: string) => void;
  clearAuth:        () => void;
  setLoading:       (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  principal:       null,
  isLoading:       true,
  setAuthenticated: (principal) => set({ isAuthenticated: true, principal, isLoading: false }),
  clearAuth:        ()          => set({ isAuthenticated: false, principal: null, isLoading: false }),
  setLoading:       (isLoading) => set({ isLoading }),
}));
