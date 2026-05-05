import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { tokenService } from "@/services/tokenService";
import type {
  LoginRequest, LoginResponse, AdminHealthResponse,
  AdminUsersListResponse, AdminUserDetail, UserListQuery, AdminUpdateUserBody,
  AdminSubscriptionsListResponse, SubscriptionListQuery,
  AdminPlansListResponse, AdminPlanDetail, AdminUpdatePlanBody, ActivityTypeName,
  AdminCreatePlanBody, AdminCreatePlanResponse,
  AdminGrantSubscriptionBody, AdminGrantSubscriptionResponse, AdminChangePlanAdminBody,
  MetricsResponse, AdminEmailLogsResponse, EmailLogsQuery,
} from "@/types";

const API_BASE = (import.meta.env.VITE_API_URL ?? "https://localhost:7166") + "/api";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
});

// Request interceptor — bota o Bearer em toda chamada quando há token salvo.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenService.getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh inflight tracker — evita N requests paralelas de refresh quando 401
// estoura em várias chamadas ao mesmo tempo.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const refresh = tokenService.getRefreshToken();
  if (!refresh) return false;

  refreshInFlight = (async () => {
    try {
      const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken: refresh });
      const { accessToken, refreshToken } = res.data;
      tokenService.setTokens(accessToken, refreshToken);
      return true;
    } catch {
      tokenService.clear();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      const ok = await tryRefresh();
      if (ok) {
        const newToken = tokenService.getAccessToken();
        if (newToken) {
          original.headers = original.headers ?? {};
          (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        }
        return api(original);
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ────────────────────────────────────────────────────────────────
import type { AdminUser } from "@/types";

/// Mapeia a resposta FLAT do backend pro shape `AdminUser` que a UI consome.
function toAdminUser(r: LoginResponse): AdminUser {
  return {
    id: r.userId,
    name: r.name,
    email: r.email,
    role: r.role,
    userType: r.userType,
  };
}

export const authApi = {
  /// Retorna o `AdminUser` mapeado (não a resposta crua) — UI sempre lida com
  /// o shape consistente, mesmo que o backend mude o envelope.
  ///
  /// Importante: endpoint dedicado `/admin/auth/login`. Diferente de `/auth/login`
  /// (público), este REJEITA usuários comuns ANTES de emitir token. Sem isso,
  /// credenciais de qualquer user comum poderiam obter um JWT pelo painel —
  /// o token funcionaria pro app principal e abriria espaço pra uso indevido.
  login: async (input: LoginRequest): Promise<AdminUser> => {
    const res = await api.post<LoginResponse>("/admin/auth/login", input);
    tokenService.setTokens(res.data.accessToken, res.data.refreshToken);
    const user = toAdminUser(res.data);
    tokenService.setUser(user);
    return user;
  },
  logout: async (): Promise<void> => {
    try {
      await api.post("/auth/logout");
    } finally {
      tokenService.clear();
    }
  },
};

// ── Admin ───────────────────────────────────────────────────────────────
export const adminApi = {
  health: async (): Promise<AdminHealthResponse> => {
    const res = await api.get<AdminHealthResponse>("/admin/health");
    return res.data;
  },

  users: {
    list: async (q: UserListQuery = {}): Promise<AdminUsersListResponse> => {
      // URLSearchParams omite chaves undefined automaticamente, mas booleanos
      // viram strings — montamos manualmente pra controlar a serialização.
      const params = new URLSearchParams();
      if (q.search) params.set("search", q.search);
      if (q.isActive !== undefined) params.set("isActive", String(q.isActive));
      if (q.role) params.set("role", q.role);
      if (q.page) params.set("page", String(q.page));
      if (q.pageSize) params.set("pageSize", String(q.pageSize));
      const qs = params.toString();
      const res = await api.get<AdminUsersListResponse>(`/admin/users${qs ? `?${qs}` : ""}`);
      return res.data;
    },
    detail: async (id: string): Promise<AdminUserDetail> => {
      const res = await api.get<AdminUserDetail>(`/admin/users/${id}`);
      return res.data;
    },
    resendEmailConfirmation: async (id: string): Promise<void> => {
      await api.post(`/admin/users/${id}/resend-confirmation`);
    },
    grantSubscription: async (id: string, body: AdminGrantSubscriptionBody): Promise<AdminGrantSubscriptionResponse> => {
      const res = await api.post<AdminGrantSubscriptionResponse>(`/admin/users/${id}/grant-subscription`, body);
      return res.data;
    },
    update: async (id: string, body: AdminUpdateUserBody): Promise<void> => {
      await api.patch(`/admin/users/${id}`, body);
    },
    /// Soft-delete. Backend libera o email pra novo cadastro automaticamente
    /// (índice unique tem filtro `WHERE IsDeleted = false`).
    remove: async (id: string, reason?: string): Promise<void> => {
      await api.delete(`/admin/users/${id}`, { data: { reason } });
    },
  },

  subscriptions: {
    list: async (q: SubscriptionListQuery = {}): Promise<AdminSubscriptionsListResponse> => {
      const params = new URLSearchParams();
      if (q.search) params.set("search", q.search);
      if (q.status) params.set("status", q.status);
      if (q.planId) params.set("planId", q.planId);
      if (q.page) params.set("page", String(q.page));
      if (q.pageSize) params.set("pageSize", String(q.pageSize));
      const qs = params.toString();
      const res = await api.get<AdminSubscriptionsListResponse>(
        `/admin/subscriptions${qs ? `?${qs}` : ""}`
      );
      return res.data;
    },
    cancel: async (id: string, reason?: string, immediate = false): Promise<void> => {
      await api.post(`/admin/subscriptions/${id}/cancel`, { reason, immediate });
    },
    extend: async (id: string, days: number, reason?: string): Promise<void> => {
      await api.post(`/admin/subscriptions/${id}/extend`, { days, reason });
    },
    /// Troca o plano de uma assinatura existente (variante admin — ativa direto, sem MP).
    changePlan: async (id: string, body: AdminChangePlanAdminBody): Promise<void> => {
      await api.post(`/admin/subscriptions/${id}/change-plan`, body);
    },
  },

  plans: {
    list: async (includeInactive = true): Promise<AdminPlansListResponse> => {
      const res = await api.get<AdminPlansListResponse>(
        `/admin/plans?includeInactive=${includeInactive}`
      );
      return res.data;
    },
    detail: async (id: string): Promise<AdminPlanDetail> => {
      const res = await api.get<AdminPlanDetail>(`/admin/plans/${id}`);
      return res.data;
    },
    update: async (id: string, body: AdminUpdatePlanBody): Promise<void> => {
      await api.patch(`/admin/plans/${id}`, body);
    },
    setActivities: async (id: string, activityTypes: ActivityTypeName[]): Promise<void> => {
      await api.put(`/admin/plans/${id}/activities`, { activityTypes });
    },
    create: async (body: AdminCreatePlanBody): Promise<AdminCreatePlanResponse> => {
      const res = await api.post<AdminCreatePlanResponse>("/admin/plans", body);
      return res.data;
    },
    delete: async (id: string): Promise<void> => {
      await api.delete(`/admin/plans/${id}`);
    },
  },

  metrics: {
    get: async (): Promise<MetricsResponse> => {
      const res = await api.get<MetricsResponse>("/admin/metrics");
      return res.data;
    },
  },

  emailLogs: {
    list: async (q: EmailLogsQuery = {}): Promise<AdminEmailLogsResponse> => {
      const params = new URLSearchParams();
      if (q.search) params.set("search", q.search);
      if (q.status) params.set("status", q.status);
      if (q.template) params.set("template", q.template);
      if (q.page) params.set("page", String(q.page));
      if (q.pageSize) params.set("pageSize", String(q.pageSize));
      const qs = params.toString();
      const res = await api.get<AdminEmailLogsResponse>(
        `/admin/email-logs${qs ? `?${qs}` : ""}`
      );
      return res.data;
    },
  },
};
