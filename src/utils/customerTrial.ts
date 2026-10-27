import type { AdminTrialStatus } from "@/types";
import { parseApiDate } from "./format";

export type CustomerTrial = {
  trialStatus?: AdminTrialStatus;
  isTrialActive: boolean;
  trialEndsAt: string | null;
  isActive?: boolean;
  emailConfirmed?: boolean;
  subscriptionEndsAt?: string | null;
};

export type CustomerAccessStatus = AdminTrialStatus | "SubscriptionExpired";

export function customerSubscriptionIsCurrent(user: { isPaidPlan: boolean; subscriptionEndsAt?: string | null }, now = Date.now()): boolean {
  return user.isPaidPlan && (user.subscriptionEndsAt === undefined
    || !!user.subscriptionEndsAt && parseApiDate(user.subscriptionEndsAt).getTime() > now);
}

/** Dates may invalidate an old active response, but cannot grant trial eligibility. */
export function getCustomerTrialStatus(user: CustomerTrial, now = Date.now()): CustomerAccessStatus | undefined {
  if (user.isActive === false || user.trialStatus === "Inactive") return "Inactive";
  if (user.trialStatus === "Subscribed") return customerSubscriptionIsCurrent({
    isPaidPlan: true, subscriptionEndsAt: user.subscriptionEndsAt,
  }, now) ? "Subscribed" : "SubscriptionExpired";
  if (user.emailConfirmed === false || user.trialStatus === "WaitingForEmail") return "WaitingForEmail";

  const end = user.trialEndsAt?.trim();
  const expiresAt = end ? parseApiDate(end).getTime() : NaN;
  const reportsActive = user.trialStatus === "Active" || (!user.trialStatus && user.isTrialActive);
  if (reportsActive) {
    if (!Number.isFinite(expiresAt)) return undefined;
    return expiresAt > now ? "Active" : "Expired";
  }
  if (user.trialStatus) return user.trialStatus;
  // Legacy APIs did not expose the enum. A past end is sufficient to show
  // expiry; a future end alone is never sufficient to activate a trial.
  return Number.isFinite(expiresAt) && expiresAt <= now ? "Expired" : undefined;
}
