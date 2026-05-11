import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import {
  login as iiLogin,
  logout as iiLogout,
  isAuthenticated,
  getPrincipal,
  loginWithLocalIdentity,
} from "@/services/actor";

interface AuthContextValue {
  login:    () => Promise<void>;
  devLogin: () => Promise<void>;
  logout:   () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  login:    async () => {},
  devLogin: async () => {},
  logout:   async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { setAuthenticated, clearAuth, setLoading } = useAuthStore();

  useEffect(() => {
    const auth = isAuthenticated();
    if (auth) {
      getPrincipal().then((p) => setAuthenticated(p)).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login() {
    await iiLogin();
    const principal = await getPrincipal();
    setAuthenticated(principal);
    navigate("/dashboard");
  }

  async function devLogin() {
    const principal = await loginWithLocalIdentity();
    setAuthenticated(principal);
    navigate("/dashboard");
  }

  async function logout() {
    await iiLogout();
    clearAuth();
    navigate("/");
  }

  return (
    <AuthContext.Provider value={{ login, devLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
