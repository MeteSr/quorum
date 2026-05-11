import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "@/store/authStore";

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: false,
      principal: null,
      isLoading: true,
    });
  });

  it("has correct initial shape", () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.principal).toBeNull();
    expect(state.isLoading).toBe(true);
  });

  it("setAuthenticated marks as authenticated and stores principal", () => {
    useAuthStore.getState().setAuthenticated("aaaaa-bbbbb-ccccc-ddddd-eai");
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.principal).toBe("aaaaa-bbbbb-ccccc-ddddd-eai");
    expect(state.isLoading).toBe(false);
  });

  it("clearAuth resets to unauthenticated", () => {
    useAuthStore.getState().setAuthenticated("some-principal");
    useAuthStore.getState().clearAuth();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.principal).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it("setLoading updates isLoading", () => {
    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);
  });
});