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

export interface AdminBillingHealthResponse {
  newCheckoutProvider: string;
  stripeNewCheckoutEnabled: boolean;
  stripeConfigured: boolean;
  stripeWebhookConfigured: boolean;
  liveMode: boolean;
  // Optional while the API deployment that adds the safe diagnostic rolls out.
  stripeConfigurationError?: string | null;
  stripeCredentialDiagnostics?: StripeCredentialDiagnostics | null;
}

export interface StripeCredentialDiagnostics {
  expectedEnvironment: "live" | "test";
  secretKeyType: "secret" | "restricted" | "missing" | "invalid";
  secretKeyEnvironment: "live" | "test" | "unknown";
  publishableKeyEnvironment: "live" | "test" | "unknown";
  secretKeyHasOuterWhitespace: boolean;
  publishableKeyHasOuterWhitespace: boolean;
}

export type SystemLogLevel = "Verbose" | "Debug" | "Information" | "Warning" | "Error" | "Fatal";
export interface SystemLogEntry {
  id: number;
  timestamp: string;
  level: SystemLogLevel;
  source: string;
  message: string;
  exceptionType: string | null;
  properties: Record<string, string>;
}
export interface AdminLogsResponse {
  instanceId?: string;
  items: SystemLogEntry[];
  nextBefore: number | null;
  cursor: number;
  capacity: number;
  retentionDays: number;
  oldestAvailableAt: string | null;
  droppedCount: number;
  persistenceAvailable: boolean;
}
export interface AdminLogsLiveResponse extends AdminLogsResponse {
  hasMore: boolean;
  resetRequired: boolean;
}
export interface AdminLogsQuery {
  search?: string;
  level?: SystemLogLevel;
  before?: number;
  limit?: number;
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

export type AdminTrialStatus = "WaitingForEmail" | "NotStarted" | "Active" | "Expired" | "Subscribed" | "Inactive";

export interface AdminConfirmEmailResponse {
  emailConfirmed: boolean;
  isTrialActive: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  alreadyConfirmed: boolean;
}

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
  isPaidPlan: boolean;
  isTrialActive: boolean;
  trialStatus: AdminTrialStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  totalActivitiesGenerated: number;
  lastActivityGeneratedAt: string | null;
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
  isTrialActive: boolean;
  trialStatus: AdminTrialStatus;
  trialPdfsGenerated: number;
}

export type PaymentProvider = "Manual" | "MercadoPago" | "Stripe";

export interface AdminSubscriptionProvider {
  provider?: PaymentProvider;
  hasProviderAgreement?: boolean;
  providerSubscriptionId?: string | null;
  mercadoPagoSubscriptionId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCheckoutSessionId?: string | null;
}

export interface AdminSubscription extends AdminSubscriptionProvider {
  id: string;
  planId: string;
  planName: string | null;
  planSlug: string | null;
  monthlyAmount: number;
  billingFrequencyMonths?: number;
  stripeCustomerId?: string | null;
  stripePriceId?: string | null;
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
  provider?: PaymentProvider;
  providerPaymentId?: string | null;
  mercadoPagoPaymentId?: string | null;
  stripeInvoiceId?: string | null;
  stripePaymentIntentId?: string | null;
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
  /** Id do plano semanal ativo da turma; null quando não tem. */
  activeWeeklyPlanId?: string | null;
}

export interface AdminUserDetail {
  user: AdminUserProfile;
  currentSubscription: AdminSubscription | null;
  payments: AdminPaymentRecord[];
  totalActivitiesGenerated: number;
  activitiesByType: AdminActivityCount[];
  recentActivities: { id: string; type: string; title: string; createdAt: string; hasAnswerKey: boolean }[];
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
export interface AdminSubscriptionListItem extends AdminSubscriptionProvider {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planId: string;
  planName: string;
  planSlug: string;
  monthlyAmount: number;
  billingFrequencyMonths?: number;
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
// Sem o passo 5 a atividade pode ficar ausente dos filtros e seletores do admin.
export const ALL_ACTIVITY_TYPES = [
  "Labyrinth", "ConnectDots", "Syllable", "WordSearch", "WritingSounding",
  "NameFigure", "SymbolHunt", "VisionScreening", "Handwriting", "Coloring",
  "DrawingCopy", "Arithmetic", "NumberSequence", "Counting", "NumberToWords",
  "Crossword", "LogicPattern", "LogicOddOneOut", "LogicClassify",
  "LogicCauseEffect", "LogicSudoku", "ShapeArithmetic", "MatchColors",
  "GeographyFlags", "ColorNaming", "Bingo", "CountSticks", "Adedonha",
  "TimeClock", "BeforeAfter", "CompareNumbers", "BodySafety", "CountBlocks",
  "SecretCode", "ConnectPairs",
] as const;
export type ActivityTypeName = (typeof ALL_ACTIVITY_TYPES)[number];

export interface AdminPlanListItem {
  stripeSyncStatus?: "unconfigured" | "pending" | "synced" | "error";
  stripePendingPrice?: number | null;
  stripePendingFirstMonthDiscount?: boolean | null;
  stripeSyncError?: string | null;
  stripePriceVersionId?: string | null;
  id: string;
  name: string;
  slug: string;
  monthlyPrice: number;
  billingFrequencyMonths?: number;
  /** Promoção de 50% somente no primeiro mês de novos assinantes elegíveis. */
  firstMonthDiscountEnabled: boolean;
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

// ── Atividades (ativar/desativar manutenção) ──────────────────────────
export interface AdminActivityItem {
  activityType: number;
  /** Nome do enum (PascalCase). */
  name: string;
  label: string;
  /** true = em manutenção (desativada). */
  disabled: boolean;
}

export interface AdminActivitiesListResponse {
  items: AdminActivityItem[];
  total: number;
  active: number;
  disabled: number;
}

export interface AdminPlanDetail {
  stripeSyncStatus?: "unconfigured" | "pending" | "synced" | "error";
  stripePendingPrice?: number | null;
  stripePendingFirstMonthDiscount?: boolean | null;
  stripeSyncError?: string | null;
  stripePriceVersionId?: string | null;
  stripeActivateOnSync?: boolean;
  id: string;
  name: string;
  slug: string;
  monthlyPrice: number;
  billingFrequencyMonths?: number;
  firstMonthDiscountEnabled: boolean;
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
  firstMonthDiscountEnabled?: boolean;
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
  firstMonthDiscountEnabled?: boolean;
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
  sendEmail?: boolean;
  emailMessageType?: "generic" | "custom";
  emailMessage?: string;
}

export interface AdminGrantSubscriptionResponse {
  subscriptionId: string;
  currentPeriodEnd: string;
  emailStatus: "not_requested" | "queued" | "sent" | "failed";
  emailError?: string | null;
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

export interface MarketingMetricsData {
  since: string;
  consentedVisits: number; registeredVisits: number; planViewVisits: number;
  registrations: number; registeredPayers: number; trials: number; trialPayers: number;
  activatedUsers: number; checkouts: number; paidCheckouts: number; unpaidCheckoutsOver24h: number;
  newPayers: number; renewals: number; cancelledSubscriptions: number;
  acquisitionRevenue: number; recurringRevenue: number; refundedRevenue: number;
  visitRegistrationRate: number | null; registrationPaidRate: number | null;
  checkoutPaidRate: number | null; trialPaidRate: number | null; paymentApprovalRate: number | null;
  averageHoursToFirstPayment: number | null; cac: number | null; roas: number | null;
  capiEnabled: boolean; deliveryMode: string; configurationIssue: string | null;
  deliveryStatus: Record<string, number>;
  campaigns: { source: string; medium: string; campaign: string; visits: number;
    registrations: number; checkouts: number; newPayers: number; revenue: number }[];
}

export interface MarketingDelivery {
  id: string; eventName: string; eventId: string; eventTime: string; status: string;
  attempts: number; lastError: string | null; deliveryMode: string;
}

export interface MetricsResponse {
  marketing?: MarketingMetricsData;
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

export interface NotificationRecipientBody {
  email: string;
  enabled: boolean;
  customerRegistered: boolean;
  paymentApproved: boolean;
  activityReported: boolean;
  contactMessage: boolean;
}

export interface NotificationRecipient extends NotificationRecipientBody {
  id: string;
  createdAt: string;
}

export interface NotificationDeliveryStatus {
  smtpConfigured: boolean;
  pending: number;
  retrying: number;
  delivered: number;
  cancelled: number;
  oldestPendingAt: string | null;
}

export interface AdminEmailTemplate {
  id: string;
  name: string;
  description: string;
  accentColor: string;
}

export interface AdminEmailOptions {
  templates: AdminEmailTemplate[];
  categories: { id: string; label: string }[];
  maxRecipients: number;
  maxSubjectLength: number;
  maxBodyLength: number;
  sendingConfigured: boolean;
}

export interface AdminEmailDraft {
  templateId: string;
  category: string;
  subject: string;
  body: string;
}

export interface AdminEmailPreview {
  subject: string;
  html: string;
}

export interface AdminSendEmailBody extends AdminEmailDraft {
  requestId: string;
  recipients: string[];
}

export interface AdminEmailBatchResult {
  requestId: string;
  total: number;
  queued: number;
  sent: number;
  failed: number;
  results: {
    email: string;
    status: "queued" | "sent" | "failed";
    error?: string | null;
    retrying?: boolean;
    nextAttemptAt?: string | null;
  }[];
}
