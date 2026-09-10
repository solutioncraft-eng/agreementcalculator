/**
 * A co-managed offering is priced as a share of the premium agreement rather
 * than against the per-user floor, and only sells to clients at or above the
 * seat count it was configured for.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NO_BUNDLE,
  type CalcInputs,
  type CogsLine,
  type PricingConfig,
  type ServiceTierDef,
} from "../src/lib/pricing/engine";
import { calculate } from "../src/lib/pricing/models";

const INPUTS: CalcInputs = {
  users: 10,
  devices: 20,
  locations: 2,
  sgmPct: 50,
  perUserFloor: 1,
  premiumPct: null,
  floorOverride: false,
  addonMultiplier: 4,
  markupMultiple: 4,
  bundleKey: NO_BUNDLE.key,
};

/** Each offering carries one $1/user tool, so base tool cost is $10 at 10 users. */
function items(tiers: ServiceTierDef[]): CogsLine[] {
  return tiers.map((tier, index) => ({
    key: `tool-${tier.key}`,
    label: `Tool ${tier.label}`,
    unit: "USER",
    tierKeys: [tier.key],
    unitCost: 1,
    sortOrder: index,
  }));
}

function costPlus(tiers: ServiceTierDef[], bundlePct = 0): PricingConfig {
  return {
    versionId: "v",
    versionLabel: "2026.1",
    costBasis: "test",
    model: "COST_PLUS",
    settings: {
      laborMultiplier: 3,
      defaultSgmPct: 50,
      maxSgmPct: 70,
      minPerUserFloor: 1,
      addonMultiplier: 4,
      coManagedLaborMultiplier: 1,
    },
    tiers,
    items: items(tiers),
    bundles: [NO_BUNDLE, { key: "loyalty", label: "Loyalty", discountPct: bundlePct, sortOrder: 1 }],
  };
}

function markup(tiers: ServiceTierDef[]): PricingConfig {
  return {
    versionId: "v",
    versionLabel: "2026.1",
    costBasis: "test",
    model: "MARKUP_MULTIPLE",
    settings: {
      defaultMarkup: 4,
      minMarkup: 3,
      minPerUserFloor: 1,
      maxDiscountPct: 15,
      addonMarkup: 2.5,
      coManagedMarkup: 2,
    },
    tiers,
    items: items(tiers),
    bundles: [NO_BUNDLE],
  };
}

/** Premium prices at $80 cost-plus; co-managed at $40. */
const premium: ServiceTierDef = {
  key: "premium",
  label: "Premium",
  parentKey: null,
  premium: true,
};
const helpdesk: ServiceTierDef = {
  key: "helpdesk",
  label: "Co-managed helpdesk",
  parentKey: null,
  coManaged: true,
  premiumPct: 65,
};

test("cost-plus measures a co-managed offering against the premium rate before any bundle discount", () => {
  const result = calculate(costPlus([premium, helpdesk], 50), { ...INPUTS, bundleKey: "loyalty" });
  const [top, co] = result.tiers;
  assert.equal(top.standardRate, 80);
  assert.equal(co.premiumPct, 65);
  // 65% of the $80 pre-discount premium rate, not of the $40 discounted one.
  assert.equal(co.premiumTarget, 52);
});

test("markup measures the same way on its own multiples", () => {
  const [top, co] = calculate(markup([premium, helpdesk]), INPUTS).tiers;
  assert.equal(top.standardRate, 40);
  assert.equal(co.premiumTarget, 26);
});

test("a co-managed rate under its share is flagged, not lifted", () => {
  const result = calculate(costPlus([premium, helpdesk]), INPUTS);
  const co = result.tiers[1];
  assert.equal(co.standardRate, 40);
  assert.equal(co.headlineRate, 40);
  assert.equal(co.belowPremiumPct, true);
  const trigger = result.triggers.find((t) => t.code === "BELOW_PREMIUM_PCT");
  assert.equal(trigger?.tierKey, "helpdesk");
  assert.equal(result.needsApproval, true);
});

test("a co-managed rate at or above its share raises nothing", () => {
  const higher: ServiceTierDef = { ...helpdesk, premiumPct: 50 };
  const result = calculate(costPlus([premium, higher]), INPUTS);
  assert.equal(result.tiers[1].premiumTarget, 40);
  assert.equal(result.tiers[1].belowPremiumPct, false);
  assert.equal(result.needsApproval, false);
});

test("the higher-tier share sells for less than the helpdesk one", () => {
  const higherTier: ServiceTierDef = { ...helpdesk, key: "higher", premiumPct: 53 };
  const [, hd] = calculate(costPlus([premium, helpdesk]), INPUTS).tiers;
  const [, high] = calculate(costPlus([premium, higherTier]), INPUTS).tiers;
  assert.ok((high.premiumTarget ?? 0) < (hd.premiumTarget ?? 0));
});

test("the premium share replaces the per-user floor for a co-managed offering", () => {
  const [top, co] = calculate(costPlus([premium, helpdesk]), { ...INPUTS, perUserFloor: 9 }).tiers;
  assert.equal(co.perUserFloor, 0);
  assert.equal(co.belowFloor, false);
  assert.equal(co.headlineRate, 40);
  // The floor still holds the fully managed premium offering, and the share is
  // a share of the rate it actually sells for.
  assert.equal(top.belowFloor, true);
  assert.equal(top.headlineRate, 90);
  assert.equal(co.premiumTarget, 58.5);
});

test("a share the account manager set overrides the configured one and is flagged", () => {
  const result = calculate(costPlus([premium, helpdesk]), { ...INPUTS, premiumPct: 40 });
  const co = result.tiers[1];
  assert.equal(co.premiumPct, 40);
  assert.equal(co.premiumTarget, 32);
  assert.equal(co.belowPremiumPct, false);
  const changed = result.triggers.find((t) => t.code === "PREMIUM_PCT_CHANGED");
  assert.equal(changed?.tierKey, "helpdesk");
});

test("with no premium offering chosen the per-user floor still holds a co-managed offering", () => {
  const [co] = calculate(costPlus([helpdesk]), { ...INPUTS, perUserFloor: 9 }).tiers;
  assert.equal(co.premiumPct, null);
  assert.equal(co.premiumTarget, null);
  assert.equal(co.belowFloor, true);
  assert.equal(co.headlinePerUser, 9);
});

test("an offering sells at any size with no minimum configured", () => {
  const [top, co] = calculate(costPlus([premium, helpdesk]), { ...INPUTS, users: 1 }).tiers;
  assert.equal(top.minUsers, null);
  assert.equal(top.available, true);
  assert.equal(co.available, true);
});

test("a co-managed offering is unavailable under its user minimum and available at it", () => {
  const gated: ServiceTierDef = { ...helpdesk, minUsers: 50 };
  const under = calculate(costPlus([premium, gated]), { ...INPUTS, users: 40 }).tiers[1];
  const at = calculate(costPlus([premium, gated]), { ...INPUTS, users: 50 }).tiers[1];
  const over = calculate(costPlus([premium, gated]), { ...INPUTS, users: 60 }).tiers[1];
  assert.equal(under.minUsers, 50);
  assert.equal(under.available, false);
  assert.equal(at.available, true);
  assert.equal(over.available, true);
});

test("an offering built on a gated one inherits the strictest minimum in its chain", () => {
  const gated: ServiceTierDef = { ...helpdesk, minUsers: 50 };
  const child: ServiceTierDef = { key: "plus", label: "Plus", parentKey: "helpdesk", minUsers: 25 };
  const [, , plus] = calculate(costPlus([premium, gated, child]), { ...INPUTS, users: 40 }).tiers;
  assert.equal(plus.minUsers, 50);
  assert.equal(plus.available, false);
});
