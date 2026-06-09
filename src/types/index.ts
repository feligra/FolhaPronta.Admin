// Tipos compartilhados pelo painel admin. Mantidos enxutos — Fase 1 só
// precisa de auth/usuário; tipos de domínio entram nas próximas fases.

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  userType: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Espelha a resposta FLAT do `LoginOutput` do backend FolhaPronta —
 * sem `user` aninhado. O `authApi.login()` mapeia isso pra `AdminUser`
 * antes de devolver pra UI.
 */
export interface LoginResponse {
  userId: string;
  name: string;
  email: string;
  userType: number;
  role: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  emailConfirmed: boolean;
  hasActiveSubscription: boolean;
  isTrialActive: boolean;
}

export interface AdminHealthResponse {
  status: string;
  adminId: string;
  email: string;
  timestamp: string;
}

/// Resposta padronizada de erro do backend (BaseController.BuildError).
export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    errors?: Record<string, string[]>;
  };
}

// ── Admin · Users ─────────────────────────────────────────────────────
// Tipos espelham as DTOs em FolhaPronta.Application/UseCases/Admin/Users.

export type SubscriptionStatus =
  | "PendingPayment"
  | "Active"
  | "Trialing"
  | "Cancelled"
  | "Paused"
  | "PastDue"
  | "Expired";

export type PaymentRecordStatus =
  | "Pending"
  | "InProcess"
  | "Approved"
  | "Rejected"
  | "Refunded"
  | "Cancelled"
  | "ChargedBack";

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  userType: number;
  role: string;
  isActive: boolean;
  emailConfirmed: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  planSlug: string | null;
  subscriptionStatus: SubscriptionStatus | null;
}

export interface AdminUsersListResponse {
  items: AdminUserListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** Update parcial de usuário pelo admin. Cada campo null/undefined = não mexe. */
export interface AdminUpdateUserBody {
  name?: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
  role?: string;
  userType?: number;
}

export interface AdminAddress {
  zipCode: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
}

export interface AdminUserProfile {
  id: string;
  name: string;
  email: string;
  userType: number;
  role: string;
  isActive: boolean;
  emailConfirmed: boolean;
  phone: string | null;
  cpf: string | null;
  address: AdminAddress | null;
  createdAt: string;
  lastLoginAt: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialPdfsGenerated: number;
}

export interface AdminSubscription {
  id: string;
  planId: string;
  planName: string | null;
  planSlug: string | null;
  monthlyAmount: number;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  hasAccess: boolean;
  createdAt: string;
}

export interface AdminPaymentRecord {
  id: string;
  subscriptionId: string | null;
  type: "Subscription" | "Manual";
  status: PaymentRecordStatus;
  amount: number;
  currency: string;
  paymentMethod: string | null;
  description: string | null;
  createdAt: string;
  paidAt: string | null;
  failureReason: string | null;
}

export interface AdminActivityCount {
  type: string;
  count: number;
}

export interface AdminClassroom {
  id: string;
  name: string;
  studentCount: number;
  createdAt: string;
}

export interface AdminUserDetail {
  user: AdminUserProfile;
  currentSubscription: AdminSubscription | null;
  payments: AdminPaymentRecord[];
  totalActivitiesGenerated: number;
  activitiesByType: AdminActivityCount[];
  classrooms: AdminClassroom[];
}

export interface UserListQuery {
  search?: string;
  isActive?: boolean;
  role?: string;
  page?: number;
  pageSize?: number;
}

// ── Admin · Login history ─────────────────────────────────────────────
export interface AdminLoginEvent {
  id: string;
  occurredAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
}

export interface AdminLoginHistoryResponse {
  totalCount: number;
  items: AdminLoginEvent[];
}

// ── Admin · Subscriptions ─────────────────────────────────────────────
export interface AdminSubscriptionListItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planId: string;
  planName: string;
  planSlug: string;
  monthlyAmount: number;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  hasAccess: boolean;
  createdAt: string;
}

export interface AdminSubscriptionsListResponse {
  items: AdminSubscriptionListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface SubscriptionListQuery {
  search?: string;
  status?: SubscriptionStatus;
  planId?: string;
  page?: number;
  pageSize?: number;
}

// ── Admin · Plans ─────────────────────────────────────────────────────
// Lista de TODOS os tipos de atividade conhecidos pelo backend (espelha
// o enum ActivityType em FolhaPronta.Domain). Mantenha em ordem com o C#.
//
// CHECKLIST quando adicionar nova atividade:
//   1. Domain: novo valor em ActivityType.cs
//   2. Renderer + DI em ApplicationExtensions
//   3. Rota no ActivityTypeRouteParser
//   4. Cliente front (web): activities.ts ActivityCatalog + ActivityIcon mapping
//   5. ESTE ARQUIVO: ALL_ACTIVITY_TYPES + ACTIVITY_TYPE_LABEL no admin
//   6. PNG do ícone em /icons/activities + opcionalmente PNG_SLUGS
// Sem o passo 5 a atividade fica invisível na matriz "Plano × Atividade"
// — admin não consegue habilitar ela em nenhum plano.
export const ALL_ACTIVITY_TYPES = [
  "Labyrinth", "ConnectDots", "Syllable", "WordSearch", "WritingSounding",
  "NameFigure", "SymbolHunt", "VisionScreening", "Handwriting", "Coloring",
  "DrawingCopy", "Arithmetic", "NumberSequence", "Counting", "NumberToWords",
  "Crossword", "LogicPattern", "LogicOddOneOut", "LogicClassify",
  "LogicCauseEffect", "LogicSudoku", "ShapeArithmetic", "MatchColors",
  "GeographyFlags", "ColorNaming", "Bingo", "CountSticks", "Adedonha",
  "TimeClock",
] as const;
export type ActivityTypeName = (typeof ALL_ACTIVITY_TYPES)[number];

export interface AdminPlanListItem {
  id: string;
  name: string;
  slug: string;
  monthlyPrice: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  /** 0 = porta aberta (libera todas). > 0 = restritivo. */
  allowedActivitiesCount: number;
  hasActivityRestrictions: boolean;
  mercadoPagoPlanId: string | null;
  /** Quando true, este plano dá acesso ao Planejador semanal. */
  includesWeeklyPlanner: boolean;
}

export interface AdminPlansListResponse {
  items: AdminPlanListItem[];
  totalActivityTypes: number;
}

export interface AdminPlanDetail {
  id: string;
  name: string;
  slug: string;
  monthlyPrice: number;
  description: string | null;
  featuresJson: string | null;
  isActive: boolean;
  sortOrder: number;
  mercadoPagoPlanId: string | null;
  includesWeeklyPlanner: boolean;
  /** Lista vazia = porta aberta (libera todas). */
  allowedActivities: ActivityTypeName[];
  /** Total de assinaturas (qualquer status) usando esse plano. */
  subscriptionCount: number;
}

export interface AdminUpdatePlanBody {
  name?: string;
  monthlyPrice?: number;
  description?: string | null;
  featuresJson?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  includesWeeklyPlanner?: boolean;
}

export interface AdminCreatePlanBody {
  name: string;
  slug: string;
  monthlyPrice: number;
  description?: string;
  featuresJson?: string;
  isActive?: boolean;
  sortOrder?: number;
  includesWeeklyPlanner?: boolean;
}

export interface AdminCreatePlanResponse {
  id: string;
  slug: string;
}

// ── Admin · Subscription CRUD por cliente ──────────────────────────────
export interface AdminGrantSubscriptionBody {
  planId: string;
  days: number;
  reason?: string;
}

export interface AdminGrantSubscriptionResponse {
  subscriptionId: string;
  currentPeriodEnd: string;
}

export interface AdminChangePlanAdminBody {
  newPlanId: string;
  days: number;
  reason?: string;
}

// ── Admin · Metrics ───────────────────────────────────────────────────
export interface UsersMetrics {
  total: number;
  active: number;
  withActiveTrial: number;
  last7Days: number;
  last30Days: number;
}

export interface SubscriptionsMetrics {
  /** Status (string) → count. Status sem registros não aparece no objeto. */
  byStatus: Partial<Record<SubscriptionStatus, number>>;
  /** Monthly Recurring Revenue — soma do MonthlyAmount das Active. */
  mrr: number;
}

export interface PaymentsMetrics {
  approved30d: number;
  rejected30d: number;
  pending30d: number;
  revenue30d: number;
}

export interface TopActivityType {
  type: string;
  count: number;
}

export interface ActivitiesMetrics {
  totalGenerated: number;
  last7Days: number;
  last30Days: number;
  top5: TopActivityType[];
}

export interface EmailsMetrics {
  sent30d: number;
  failed30d: number;
  pending30d: number;
  skippedDev30d: number;
}

export interface MetricsResponse {
  users: UsersMetrics;
  subscriptions: SubscriptionsMetrics;
  payments: PaymentsMetrics;
  activities: ActivitiesMetrics;
  emails: EmailsMetrics;
  generatedAt: string;
}

// ── Admin · Email Logs ────────────────────────────────────────────────
export type EmailLogStatus = "Pending" | "Sent" | "Failed" | "SkippedDev";

export interface AdminEmailLogItem {
  id: string;
  toEmail: string;
  subject: string;
  templateName: string;
  status: EmailLogStatus;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface AdminEmailLogsResponse {
  items: AdminEmailLogItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface EmailLogsQuery {
  search?: string;
  status?: EmailLogStatus;
  template?: string;
  page?: number;
  pageSize?: number;
}
