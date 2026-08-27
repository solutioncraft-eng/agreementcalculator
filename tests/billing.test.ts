import assert from "node:assert/strict";
import test from "node:test";
import {
  GRACE_DAYS,
  graceEndFrom,
  subscriptionUpdate,
  workspaceAccess,
  type BillingTenant,
} from "../src/lib/billing";
import { trialEndFrom } from "../src/lib/trial";

const now = new Date("2026-08-26T12:00:00Z");
const trialEnd = trialEndFrom(now);
const afterTrial = new Date(trialEnd.getTime() + 1);

function tenant(overrides: Partial<BillingTenant> = {}): BillingTenant {
  return {
    status: "TRIAL",
    trialEndsAt: trialEnd,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    graceEndsAt: null,
    compExpiresAt: null,
    ...overrides,
  };
}

test("a running trial is allowed and an expired one is not", () => {
  assert.deepEqual(
    { allowed: true, reason: "TRIAL" },
    pick(workspaceAccess(tenant(), now)),
  );
  assert.deepEqual(
    { allowed: false, reason: "TRIAL_EXPIRED" },
    pick(workspaceAccess(tenant(), afterTrial)),
  );
});

test("a healthy subscription outlives the trial deadline", () => {
  const periodEnd = new Date("2026-10-01T00:00:00Z");
  const subscribed = tenant({ subscriptionStatus: "active", currentPeriodEnd: periodEnd });

  const access = workspaceAccess(subscribed, afterTrial);
  assert.deepEqual(pick(access), { allowed: true, reason: "SUBSCRIBED" });
  assert.equal(access.deadline, periodEnd);
});

test("a failed payment keeps the workspace working until the grace window closes", () => {
  const graceEndsAt = graceEndFrom(now);
  assert.equal(graceEndsAt.getTime() - now.getTime(), GRACE_DAYS * 24 * 60 * 60 * 1000);

  for (const status of ["past_due", "unpaid"]) {
    const dunning = tenant({ subscriptionStatus: status, graceEndsAt });
    assert.deepEqual(pick(workspaceAccess(dunning, now)), { allowed: true, reason: "IN_GRACE" });
    assert.deepEqual(pick(workspaceAccess(dunning, new Date(graceEndsAt.getTime() - 1))), {
      allowed: true,
      reason: "IN_GRACE",
    });
    assert.deepEqual(pick(workspaceAccess(dunning, graceEndsAt)), {
      allowed: false,
      reason: "PAYMENT_FAILED",
    });
  }
});

test("a failing payment with no recorded deadline is locked out rather than trusted", () => {
  const dunning = tenant({ subscriptionStatus: "past_due", graceEndsAt: null });
  assert.deepEqual(pick(workspaceAccess(dunning, now)), {
    allowed: false,
    reason: "PAYMENT_FAILED",
  });
});

test("a cancelled subscription is distinguished from a trial that merely ran out", () => {
  const cancelled = tenant({ subscriptionStatus: "canceled" });
  assert.deepEqual(pick(workspaceAccess(cancelled, afterTrial)), {
    allowed: false,
    reason: "SUBSCRIPTION_ENDED",
  });
  // Cancelling mid-trial does not cut the trial short.
  assert.deepEqual(pick(workspaceAccess(cancelled, now)), { allowed: true, reason: "TRIAL" });
});

test("operator activation still comps a workspace with no Stripe subscription", () => {
  const comped = tenant({ status: "ACTIVE", subscriptionStatus: null });
  assert.deepEqual(pick(workspaceAccess(comped, afterTrial)), {
    allowed: true,
    reason: "ACTIVATED",
  });
});

test("a failing subscription outranks operator activation so lapsed cards are noticed", () => {
  const lapsed = tenant({ status: "ACTIVE", subscriptionStatus: "past_due", graceEndsAt: null });
  assert.equal(workspaceAccess(lapsed, now).allowed, false);
});

test("a complimentary workspace works whatever Stripe says", () => {
  const comped = tenant({ status: "COMPLIMENTARY", compExpiresAt: null });
  for (const at of [now, afterTrial]) {
    assert.deepEqual(pick(workspaceAccess(comped, at)), {
      allowed: true,
      reason: "COMPLIMENTARY",
    });
  }

  // A failed card must not shut a comped workspace down: the comp is a decision
  // about the relationship, not about the invoice.
  const compedAndFailing = tenant({
    status: "COMPLIMENTARY",
    subscriptionStatus: "unpaid",
    graceEndsAt: null,
  });
  assert.deepEqual(pick(workspaceAccess(compedAndFailing, afterTrial)), {
    allowed: true,
    reason: "COMPLIMENTARY",
  });
});

test("a complimentary period with an end date closes on it", () => {
  const ends = new Date("2026-09-01T00:00:00Z");
  const comped = tenant({ status: "COMPLIMENTARY", compExpiresAt: ends });
  assert.deepEqual(pick(workspaceAccess(comped, now)), { allowed: true, reason: "COMPLIMENTARY" });
  assert.deepEqual(pick(workspaceAccess(comped, new Date(ends.getTime() + 1))), {
    allowed: false,
    reason: "COMPLIMENTARY_ENDED",
  });
});

test("a subscription taking over an expired comp keeps the workspace open", () => {
  const ends = new Date("2026-09-01T00:00:00Z");
  const subscribed = tenant({
    status: "COMPLIMENTARY",
    compExpiresAt: ends,
    subscriptionStatus: "active",
  });
  assert.deepEqual(pick(workspaceAccess(subscribed, new Date(ends.getTime() + 1))), {
    allowed: true,
    reason: "SUBSCRIBED",
  });
});

test("a reset trial reopens a workspace whose subscription had lapsed", () => {
  // What the operator's trial reset writes: a fresh deadline, and the lapsed
  // subscription state cleared so it cannot keep the paywall up.
  const resetAt = afterTrial;
  const reset = tenant({
    status: "TRIAL",
    trialEndsAt: trialEndFrom(resetAt),
    subscriptionStatus: null,
    graceEndsAt: null,
  });
  assert.deepEqual(pick(workspaceAccess(reset, resetAt)), { allowed: true, reason: "TRIAL" });
  assert.equal(workspaceAccess(reset, trialEndFrom(resetAt)).allowed, false);
});

test("a subscription update clears the grace deadline only once Stripe is happy", () => {
  const healthy = subscriptionUpdate({ id: "sub_1", status: "active", currentPeriodEnd: trialEnd });
  assert.deepEqual(healthy, {
    stripeSubscriptionId: "sub_1",
    subscriptionStatus: "active",
    currentPeriodEnd: trialEnd,
    graceEndsAt: null,
  });

  // The failed-invoice event owns the countdown; an update about the same
  // failure must not wipe it and lock the workspace out early.
  const failing = subscriptionUpdate({ id: "sub_1", status: "past_due", currentPeriodEnd: null });
  assert.equal("graceEndsAt" in failing, false);
});

function pick(access: { allowed: boolean; reason: string }) {
  return { allowed: access.allowed, reason: access.reason };
}
