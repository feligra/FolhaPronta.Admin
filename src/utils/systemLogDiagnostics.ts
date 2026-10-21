import type { SystemLogEntry } from "@/types";
import { formatDateTime } from "@/utils/format";

// Historical entries may predate structured FailureReason/SuggestedAction fields.
// These messages describe a local configuration check, not a Stripe API response.
const CONFIGURATION_HELP: Record<string, { reason: string; action: string }> = {
  "Stripe secret key must match the configured environment.": {
    reason: "A chave secreta não corresponde ao ambiente configurado. Em versões antigas da API, esse registro também podia indicar chave ausente ou formato inválido.",
    action: "Confira STRIPE_SECRET e STRIPE_LIVE_MODE. STRIPE_SECRET_KEY também é aceito e, se definido, tem prioridade sobre STRIPE_SECRET. Chaves de teste exigem false; chaves de produção, true. Depois publique novamente a API.",
  },
  "Stripe secret key is missing.": {
    reason: "A API não recebeu a chave secreta.",
    action: "Confira se STRIPE_SECRET do GitHub Actions está sendo repassado ao contêiner da API. STRIPE_SECRET_KEY também é aceito. Após ajustar, publique novamente a API.",
  },
  "Stripe secret key has an invalid format.": {
    reason: "A chave secreta recebida pela API tem formato inválido.",
    action: "Confira STRIPE_SECRET: use uma chave secreta sk_ ou restrita rk_, sem aspas ou espaços internos. STRIPE_SECRET_KEY também é aceito. Publique novamente a API após ajustar.",
  },
  "Stripe publishable key must match the configured environment.": {
    reason: "A chave pública não corresponde ao ambiente configurado. Em versões antigas da API, esse registro também podia indicar chave ausente ou formato inválido.",
    action: "Confira STRIPE_PUBLIC (ou STRIPE_PUBLISHABLE_KEY) e STRIPE_LIVE_MODE. As chaves pública e secreta devem ser da mesma conta e do mesmo ambiente. Publique novamente a API.",
  },
  "Stripe publishable key is missing.": {
    reason: "A API não recebeu a chave pública.",
    action: "Confira se STRIPE_PUBLIC do GitHub Actions está sendo repassado ao contêiner da API. STRIPE_PUBLISHABLE_KEY também é aceito. Após ajustar, publique novamente a API.",
  },
  "Stripe publishable key has an invalid format.": {
    reason: "A chave pública recebida pela API tem formato inválido.",
    action: "Confira STRIPE_PUBLIC: use uma chave pk_, sem aspas ou espaços internos. STRIPE_PUBLISHABLE_KEY também é aceito. Publique novamente a API após ajustar.",
  },
  "Stripe billing currency must be BRL.": {
    reason: "A moeda configurada para a integração é incompatível.",
    action: "Configure Stripe__Currency=brl na API e publique novamente.",
  },
  "New Stripe checkouts are disabled.": {
    reason: "Novas assinaturas estão desabilitadas na configuração local.",
    action: "Confira a configuração de pagamentos em Planos e STRIPE_ENABLED antes de habilitar novas assinaturas no deploy da API.",
  },
  "Stripe account ID is required before opening checkout.": {
    reason: "O identificador da conta Stripe não foi configurado.",
    action: "Informe STRIPE_ACCOUNT_ID com o ID acct_ da conta das chaves e publique novamente a API.",
  },
  "Stripe webhook signing secret is required before opening checkout.": {
    reason: "O segredo de assinatura do webhook não foi configurado.",
    action: "Configure STRIPE_WEBHOOK_SECRET com o segredo whsec_ do endpoint /api/webhooks/stripe, no mesmo ambiente das chaves, e publique novamente a API.",
  },
  "Stripe WebBaseUrl must be HTTPS (localhost is allowed in test mode).": {
    reason: "O endereço público do site não atende à configuração exigida.",
    action: "Confira DOMAIN_WEB no deploy da API: use o endereço público HTTPS do site. HTTP é permitido somente em localhost no modo de teste.",
  },
};

export const LOG_FIELD_LABELS: Record<string, string> = {
  ErrorMessage: "Mensagem da exceção", InnerErrors: "Causas internas", ErrorStackTrace: "Local da falha",
  ErrorType: "Tipo do erro", FailureType: "Tipo da falha", ExceptionType: "Tipo da exceção",
  FailureCode: "Código da falha", FailureReason: "Motivo identificado", SuggestedAction: "Próxima ação",
  CheckoutStage: "Etapa do checkout", StripeStage: "Etapa da Stripe", StripeCode: "Código da Stripe",
  StripeType: "Tipo de erro Stripe", StripeParameter: "Parâmetro rejeitado", StripeRequestId: "Requisição Stripe",
  HttpStatus: "Status HTTP", StatusCode: "Status HTTP", RequestMethod: "Método HTTP", RequestPath: "Rota",
  TraceId: "ID da trajetória (TraceId)", RequestId: "ID da requisição", CorrelationId: "ID de correlação",
  UserId: "Usuário", SubscriptionId: "Assinatura", PlanId: "Plano", CustomerId: "Cliente",
  CheckoutAttemptId: "Tentativa de checkout", CheckoutSessionId: "Sessão de checkout", PaymentProvider: "Provedor",
  Provider: "Provedor", ConfigurationError: "Verificação de configuração local", Environment: "Ambiente",
  LiveMode: "Ambiente de produção", EventId: "Evento", WebhookEventId: "Evento do webhook",
};

export const ERROR_FIELDS = new Set(["ErrorMessage", "InnerErrors", "ErrorStackTrace", "ErrorType", "FailureType", "ExceptionType", "FailureCode", "FailureReason", "SuggestedAction", "ConfigurationError"]);
export const REQUEST_FIELDS = new Set(["TraceId", "RequestId", "CorrelationId", "CheckoutStage", "StripeStage", "StripeCode", "StripeType", "StripeParameter", "StripeRequestId", "HttpStatus", "StatusCode", "RequestMethod", "RequestPath", "UserId", "SubscriptionId", "PlanId", "CustomerId", "CheckoutAttemptId", "CheckoutSessionId", "PaymentProvider", "Provider", "Environment", "LiveMode", "EventId", "WebhookEventId"]);

export function logFieldLabel(key: string): string {
  return Object.prototype.hasOwnProperty.call(LOG_FIELD_LABELS, key) ? LOG_FIELD_LABELS[key] : key;
}

const STAGE_LABELS: Record<string, string> = {
  ValidateConfiguration: "Validação da configuração",
  customer: "Identificação do cliente na Stripe",
  catalog: "Preparação do preço da assinatura",
  checkout: "Criação da sessão de pagamento na Stripe",
  checkout_lookup: "Consulta de sessão de pagamento existente",
  checkout_preflight: "Validação da configuração e dos dados do checkout",
  checkout_persist: "Gravação dos dados do checkout",
  checkout_recovery: "Recuperação de tentativa de pagamento anterior",
  checkout_attach: "Vinculação da sessão de pagamento à assinatura",
  checkout_coordination: "Coordenação da tentativa de checkout",
  checkout_prepare: "Preparação da assinatura para o checkout",
  renewal_resume: "Retomada da renovação da assinatura",
  renewal_suspend: "Suspensão da renovação da assinatura",
  checkout_reconcile: "Conciliação do estado do checkout",
  previous_subscription_cancel: "Cancelamento da assinatura anterior",
  checkout_create: "Criação do checkout",
  checkout_tracking: "Registro dos eventos de acompanhamento do checkout",
  checkout_return: "Preparação da resposta do checkout",
};

export function logFieldValue(key: string, value: string): string {
  return (key === "CheckoutStage" || key === "StripeStage") && Object.prototype.hasOwnProperty.call(STAGE_LABELS, value)
    ? `${STAGE_LABELS[value]} (${value})` : value;
}

export function visibleLogValue(value: string | undefined): string | null {
  return value && value.trim() && value.trim() !== "[oculto]" ? value : null;
}

export function getLogDiagnostic(entry: SystemLogEntry) {
  const props = entry.properties;
  const configuration = visibleLogValue(props.ConfigurationError);
  const configurationHelp = configuration && Object.prototype.hasOwnProperty.call(CONFIGURATION_HELP, configuration)
    ? CONFIGURATION_HELP[configuration] : null;
  const reason = visibleLogValue(props.FailureReason) || visibleLogValue(props.ErrorMessage);
  const stage = visibleLogValue(props.CheckoutStage) || visibleLogValue(props.StripeStage);
  return {
    reason,
    action: visibleLogValue(props.SuggestedAction),
    configuration,
    configurationHelp,
    correlation: visibleLogValue(props.TraceId) || visibleLogValue(props.RequestId),
    stage: stage ? logFieldValue("CheckoutStage", stage) : null,
    httpStatus: visibleLogValue(props.HttpStatus) || visibleLogValue(props.StatusCode),
  };
}

export function logDiagnosticText(entry: SystemLogEntry): string {
  const diagnostic = getLogDiagnostic(entry);
  return [
    `Registro #${entry.id} · ${entry.level} · ${formatDateTime(entry.timestamp)} (Brasília)`,
    `Origem: ${entry.source}`,
    entry.message,
    entry.exceptionType ? `Tipo da exceção: ${entry.exceptionType}` : "",
    ...Object.entries(entry.properties).map(([key, value]) => `${logFieldLabel(key)}: ${logFieldValue(key, value)}`),
    diagnostic.configurationHelp ? `Configuração local: ${diagnostic.configurationHelp.reason}\nRevisão da configuração: ${diagnostic.configurationHelp.action}` : "",
  ].filter(Boolean).join("\n\n");
}
