import assert from "node:assert/strict";
import test from "node:test";
import { isValidSlug } from "../src/lib/slug";
import { TRIAL_DAYS, describeDaysLeft, trialEndFrom, trialInfo } from "../src/lib/trial";

const start = new Date("2026-08-26T12:00:00Z");

test("a trial runs for the advertised number of days", () => {
  assert.equal(trialEndFrom(start).toISOString(), "2026-09-09T12:00:00.000Z");
  assert.equal(TRIAL_DAYS, 14);
});

test("days left are rounded up, so the final day still reads as a day", () => {
  const endsAt = trialEndFrom(start);
  const tenant = { status: "TRIAL" as const, trialEndsAt: endsAt };

  assert.deepEqual(trialInfo(tenant, start), { onTrial: true, expired: false, daysLeft: 14, endsAt });
  assert.equal(trialInfo(tenant, new Date("2026-09-09T11:59:00Z")).daysLeft, 1);
  assert.equal(describeDaysLeft(1), "1 day left");
  assert.equal(describeDaysLeft(14), "14 days left");
});

test("the deadline expires the workspace exactly once it passes", () => {
  const endsAt = trialEndFrom(start);
  const tenant = { status: "TRIAL" as const, trialEndsAt: endsAt };

  assert.equal(trialInfo(tenant, new Date(endsAt.getTime() - 1)).expired, false);
  assert.equal(trialInfo(tenant, endsAt).expired, true);
  assert.equal(trialInfo(tenant, new Date(endsAt.getTime() + 1)).expired, true);
});

test("a deadline only binds a workspace that is still on trial", () => {
  const past = new Date("2026-01-01T00:00:00Z");

  // Activating a workspace lifts the deadline without clearing the date.
  assert.deepEqual(trialInfo({ status: "ACTIVE", trialEndsAt: past }, start), {
    onTrial: false,
    expired: false,
    daysLeft: 0,
    endsAt: null,
  });
  // Suspension is the operator's own switch and is enforced elsewhere.
  assert.equal(trialInfo({ status: "SUSPENDED", trialEndsAt: past }, start).expired, false);
  // No deadline means no deadline — an operator-created workspace.
  assert.equal(trialInfo({ status: "TRIAL", trialEndsAt: null }, start).expired, false);
  assert.equal(trialInfo({ status: "TRIAL", trialEndsAt: null }, start).onTrial, false);
});

test("signup cannot claim the product's own hostnames as a workspace address", () => {
  assert.equal(isValidSlug("signup"), false);
  assert.equal(isValidSlug("pricing"), false);
  assert.equal(isValidSlug("acme"), true);
});
