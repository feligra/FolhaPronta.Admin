import type { AdminSubscription, AdminSubscriptionProvider, PaymentProvider } from "@/types";

export function paymentProviderLabel(provider?: PaymentProvider): string {
  switch (provider) {
    case "Stripe": return "Stripe";
    case "MercadoPago": return "Mercado Pago";
    case "Manual": return "Administrativo";
    default: return "Não informado";
  }
}

export function subscriptionReference(subscription: AdminSubscriptionProvider): string | null {
  return subscription.providerSubscriptionId ?? subscription.stripeSubscriptionId
    ?? subscription.mercadoPagoSubscriptionId ?? subscription.stripeCheckoutSessionId ?? null;
}

export function hasProviderAgreement(subscription: AdminSubscriptionProvider): boolean {
  return subscription.hasProviderAgreement ?? (subscription.provider === "Stripe" || !!subscriptionReference(subscription));
}

export function canCancelSubscription(subscription: AdminSubscriptionProvider & Pick<AdminSubscription, "status" | "hasAccess">): boolean {
  return hasProviderAgreement(subscription)
    || subscription.status !== "Expired" && (subscription.status !== "Cancelled" || subscription.hasAccess);
}
