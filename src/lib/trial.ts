import type { TenantStatus } from "@prisma/client";

/** Length of the free trial a self-serve signup gets. */
export const TRIAL_DAYS = 14;

/** List price, per company per month, unlimited users. */
export const PRICE_PER_MONTH = 69;

const DAY_MS = 24 * 60 * 60 * 1000;

export function trialEndFrom(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * DAY_MS);
}

export interface TrialInfo {
  /** In a trial that has not run out. */
  onTrial: boolean;
  /** In a trial whose deadline has passed — the workspace is read-nothing. */
  expired: boolean;
  /** Whole days left, rounded up, so the last day still reads "1 day left". */
  daysLeft: number;
  endsAt: Date | null;
}

/**
 * Where a workspace stands in its trial.
 *
 * A deadline only means anything while the workspace is still `TRIAL`:
 * converting it to `ACTIVE` is what the operator does when it starts paying,
 * and that alone lifts the deadline without having to clear the date (which is
 * worth keeping — it says when the trial began to run out).
 */
export function trialInfo(
  tenant: { status: TenantStatus; trialEndsAt: Date | null },
  now: Date = new Date(),
): TrialInfo {
  const endsAt = tenant.trialEndsAt;
  if (tenant.status !== "TRIAL" || !endsAt) {
    return { onTrial: false, expired: false, daysLeft: 0, endsAt: null };
  }

  const remaining = endsAt.getTime() - now.getTime();
  if (remaining <= 0) return { onTrial: false, expired: true, daysLeft: 0, endsAt };
  return { onTrial: true, expired: false, daysLeft: Math.ceil(remaining / DAY_MS), endsAt };
}

export function describeDaysLeft(daysLeft: number): string {
  return daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
}
