import type { AdminUser } from "@/types";

// Chaves separadas do app principal (`fp.*`) pra evitar colisão se o admin
// rodar no mesmo browser que o FolhaProntaWeb durante o dev.
const ACCESS_KEY = "fp_admin_access";
const REFRESH_KEY = "fp_admin_refresh";
const USER_KEY = "fp_admin_user";

export const tokenService = {
  getAccessToken: (): string | null => {
    try { return localStorage.getItem(ACCESS_KEY); } catch { return null; }
  },
  getRefreshToken: (): string | null => {
    try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
  },
  getUser: (): AdminUser | null => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AdminUser) : null;
    } catch { return null; }
  },
  setTokens: (access: string, refresh: string) => {
    try {
      localStorage.setItem(ACCESS_KEY, access);
      localStorage.setItem(REFRESH_KEY, refresh);
    } catch (e) { console.error("Erro salvando tokens:", e); }
  },
  setUser: (user: AdminUser) => {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); }
    catch (e) { console.error("Erro salvando user:", e); }
  },
  clear: () => {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
    } catch { /* noop */ }
  },
  isAuthenticated: (): boolean => {
    try {
      const t = localStorage.getItem(ACCESS_KEY);
      return !!t && t.length > 0;
    } catch { return false; }
  },
};
