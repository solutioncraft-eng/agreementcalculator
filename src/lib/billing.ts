import type { TenantStatus } from "@prisma/client";
import { trialInfo, type TrialInfo } from "@/lib/trial";

/** How long a workspace keeps working after a payment starts failing. */
export const GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Stripe statuses that mean the workspace is paid up. */
const HEALTHY = new Set(["active", "trialing"]);

/**
 * Stripe statuses that mean a payment is outstanding but the subscription is
 * still alive — Stripe keeps retrying, so the workspace runs on borrowed time
 * rather than being cut off mid-renewal.
 */
const DUNNING = new Set(["past_due", "unpaid"]);

export function graceEndFrom(failedAt: Date): Date {
  return new Date(failedAt.getTime() + GRACE_DAYS * DAY_MS);
}

export interface BillingTenant {
  status: TenantStatus;
  trialEndsAt: Date | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
}

export type AccessReason =
  /** Paid subscription in good standing. */
  | "SUBSCRIBED"
  /** Paid subscription with a failed payment, inside the grace window. */
  | "IN_GRACE"
  /** Switched on by an operator without going through Stripe. */
  | "ACTIVATED"
  /** Free trial still running, or a workspace with no deadline at all. */
  | "TRIAL"
  | "TRIAL_EXPIRED"
  /** Grace window ran out with the payment still failing. */
  | "PAYMENT_FAILED"
  /** Subscription was cancelled or never completed, and no trial is left. */
  | "SUBSCRIPTION_ENDED";

export interface WorkspaceAccess {
  /** Whether the workspace may be used at all. */
  allowed: boolean;
  reason: AccessReason;
  trial: TrialInfo;
  /** Deadline the reason hangs on, when there is one. */
  deadline: Date | null;
}

/**
 * Whether a workspace may be used, and why.
 *
 * Subscription state wins over the trial, because a workspace that subscribes
 * mid-trial must not be cut off when the original deadline passes; the operator
 * `ACTIVE` flag stays as a comp override for workspaces billed outside Stripe.
 * Nothing here talks to Stripe — the webhook is what keeps the stored fields
 * true, so this stays a pure function of the row and can be reasoned about (and
 * tested) on its own.
 */
export function workspaceAccess(
  tenant: BillingTenant,
  now: Date = new Date(),
): WorkspaceAccess {
  const trial = trialInfo(tenant, now);
  const status = tenant.subscriptionStatus;

  if (status && HEALTHY.has(status)) {
    return { allowed: true, reason: "SUBSCRIBED", trial, deadline: tenant.currentPeriodEnd };
  }

  if (status && DUNNING.has(status)) {
    const graceEndsAt = tenant.graceEndsAt;
    if (graceEndsAt && graceEndsAt.getTime() > now.getTime()) {
      return { allowed: true, reason: "IN_GRACE", trial, deadline: graceEndsAt };
    }
    return { allowed: false, reason: "PAYMENT_FAILED", trial, deadline: graceEndsAt };
  }

  if (tenant.status === "ACTIVE") {
    return { allowed: true, reason: "ACTIVATED", trial, deadline: null };
  }

  if (trial.expired) {
    // A cancelled subscription is a different conversation from a trial that
    // simply ran out, even though both end up at the same wall.
    const ended = Boolean(status);
    return {
      allowed: false,
      reason: ended ? "SUBSCRIPTION_ENDED" : "TRIAL_EXPIRED",
      trial,
      deadline: trial.endsAt,
    };
  }

  return { allowed: true, reason: "TRIAL", trial, deadline: trial.endsAt };
}

export interface SubscriptionSnapshot {
  id: string;
  status: string;
  currentPeriodEnd: Date | null;
}

export interface SubscriptionWrite {
  stripeSubscriptionId: string;
  subscriptionStatus: string;
  currentPeriodEnd: Date | null;
  /** Only present when the update decides the grace window: cleared on health. */
  graceEndsAt?: null;
}

/**
 * The fields a webhook writes onto the workspace for a subscription it was told
 * about. The grace deadline is cleared once Stripe reports the subscription
 * healthy again — but left alone otherwise, because `invoice.payment_failed`
 * owns it and a `customer.subscription.updated` for the same failure would
 * otherwise wipe the countdown and lock the workspace out immediately.
 */
export function subscriptionUpdate(snapshot: SubscriptionSnapshot): SubscriptionWrite {
  return {
    stripeSubscriptionId: snapshot.id,
    subscriptionStatus: snapshot.status,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    ...(HEALTHY.has(snapshot.status) ? { graceEndsAt: null } : {}),
  };
}

export function describeAccess(access: WorkspaceAccess): string {
  switch (access.reason) {
    case "SUBSCRIBED":
      return "Subscribed";
    case "IN_GRACE":
      return "Payment failed — action needed";
    case "ACTIVATED":
      return "Activated by SolutionCraft";
    case "TRIAL":
      return "Free trial";
    case "TRIAL_EXPIRED":
      return "Trial ended";
    case "PAYMENT_FAILED":
      return "Suspended for non-payment";
    case "SUBSCRIPTION_ENDED":
      return "Subscription ended";
  }
}
