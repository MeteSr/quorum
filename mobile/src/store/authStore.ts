import { create } from "zustand";
import { getIdentity, getPrincipal, logout as icpLogout, saveDelegation, loadDelegation } from "@/services/actor";
import { DelegationChain } from "@dfinity/identity";

interface AuthState {
  isAuthenticated: boolean;
  principal:       string | null;
  isLoading:       boolean;
  checkAuth:       () => Promise<void>;
  finishLogin:     (delegationJson: object) => Promise<void>;
  logout:          () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  principal:       null,
  isLoading:       true,

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const identity = await getIdentity();
      if (identity) {
        const principal = await getPrincipal();
        set({ isAuthenticated: true, principal });
      } else {
        set({ isAuthenticated: false, principal: null });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  // Called by LoginScreen after the II WebView delivers the delegation JSON.
  finishLogin: async (delegationJson: object) => {
    const chain = DelegationChain.fromJSON(delegationJson);
    await saveDelegation(chain);
    const principal = await getPrincipal();
    set({ isAuthenticated: true, principal });
  },

  logout: async () => {
    await icpLogout();
    set({ isAuthenticated: false, principal: null });
  },
}));
