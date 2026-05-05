import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { authApi } from "@/services/api";
import { tokenService } from "@/services/tokenService";
import type { AdminUser, LoginRequest } from "@/types";

interface AuthContextType {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<AdminUser>;
  logout: () => Promise<void>;
  refreshAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const buildUserFromStorage = (): AdminUser | null => {
  const stored = tokenService.getUser();
  const token = tokenService.getAccessToken();
  if (stored && token) return stored;
  return null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // Inicialização SÍNCRONA do localStorage — evita flash de "não autenticado"
  // ao recarregar a página com sessão válida.
  const [user, setUser] = useState<AdminUser | null>(buildUserFromStorage);
  const [isLoading, setIsLoading] = useState(false);

  const refreshAuth = useCallback(() => setUser(buildUserFromStorage()), []);

  // Sincroniza entre abas — se outra aba fizer logout, esta também desloga.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith("fp_admin_")) refreshAuth();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshAuth]);

  const login = useCallback(async (creds: LoginRequest) => {
    setIsLoading(true);
    try {
      // authApi.login já mapeia a resposta FLAT do backend pra AdminUser.
      const user = await authApi.login(creds);
      setUser(user);
      return user;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try { await authApi.logout(); }
    catch { /* ignora — token local sempre é limpo */ }
    finally {
      tokenService.clear();
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === "Admin",
    isLoading,
    login,
    logout,
    refreshAuth,
  }), [user, isLoading, login, logout, refreshAuth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
