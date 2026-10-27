import type { AdminSubscription, AdminSubscriptionProvider, PaymentProvider, SubscriptionStatus } from "@/types";
import { parseApiDate } from "./format";

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

type SubscriptionState = AdminSubscriptionProvider & Pick<AdminSubscription, "status" | "hasAccess" | "currentPeriodEnd">;

export function subscriptionPeriodEnd(subscription: SubscriptionState): string | null {
  return (subscription.rawStatus ?? subscription.status) === "Trialing"
    ? subscription.trialEndsAt === undefined ? subscription.currentPeriodEnd : subscription.trialEndsAt
    : subscription.currentPeriodEnd;
}

function hasCurrentPeriod(subscription: SubscriptionState, now: number): boolean {
  const end = subscriptionPeriodEnd(subscription);
  return !!end && parseApiDate(end).getTime() > now;
}

/** Recheck the date while the page is open, including responses from older APIs. */
export function getSubscriptionStatus(subscription: SubscriptionState, now = Date.now()): SubscriptionStatus {
  if ((subscription.status === "Active" || subscription.status === "Trialing") && !hasCurrentPeriod(subscription, now)) return "Expired";
  return subscription.status;
}

export function hasSubscriptionAccess(subscription: SubscriptionState, now = Date.now()): boolean {
  return subscription.hasAccess && hasCurrentPeriod(subscription, now)
    && ["Active", "Trialing", "Cancelled", "PastDue"].includes(getSubscriptionStatus(subscription, now));
}

export function canExtendSubscription(subscription: SubscriptionState, now = Date.now()): boolean {
  return subscription.canExtend !== false && subscription.hasAccess && hasCurrentPeriod(subscription, now)
    && ["Active", "Cancelled"].includes(getSubscriptionStatus(subscription, now));
}

export function canCancelSubscription(subscription: SubscriptionState, now = Date.now()): boolean {
  if (subscription.canCancel === false) return false;
  const status = getSubscriptionStatus(subscription, now);
  const renewal = subscription.canCancelRenewal ?? hasProviderAgreement(subscription);
  return renewal || status !== "Expired" && (status !== "Cancelled" || subscription.hasAccess && hasCurrentPeriod(subscription, now));
}

export function isRenewalCancellation(subscription: SubscriptionState, now = Date.now()): boolean {
  return canCancelSubscription(subscription, now)
    && (subscription.canCancelRenewal ?? hasProviderAgreement(subscription))
    && (!subscription.hasAccess || !hasCurrentPeriod(subscription, now))
    && ["Expired", "Cancelled", "PastDue", "Paused"].includes(getSubscriptionStatus(subscription, now));
}
