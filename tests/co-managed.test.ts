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
    bundles: [
      NO_BUNDLE,
      {
        key: "loyalty",
        label: "Loyalty",
        discountPct: bundlePct,
        sortOrder: 1,
      },
    ],
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

const managed: ServiceTierDef = {
  key: "managed",
  label: "Managed",
  parentKey: null,
};
const coManaged: ServiceTierDef = {
  key: "co",
  label: "Co-Managed",
  parentKey: null,
  coManaged: true,
};

test("a fully managed offering prices exactly as before the co-managed lever existed", () => {
  const [tier] = calculate(costPlus([managed]), INPUTS).tiers;
  // $10 tool × (1 + 3 labor) = $40 floor; / 0.5 SGM = $80.
  assert.equal(tier.coManaged, false);
  assert.equal(tier.overridden, false);
  assert.equal(tier.costFloor, 40);
  assert.equal(tier.standardRate, 80);
});

test("cost-plus prices a co-managed offering with the co-managed labor multiplier", () => {
  const [tier] = calculate(costPlus([coManaged]), INPUTS).tiers;
  // $10 tool × (1 + 1 labor) = $20 floor; / 0.5 SGM = $40.
  assert.equal(tier.coManaged, true);
  assert.equal(tier.costFloor, 20);
  assert.equal(tier.standardRate, 40);
});

test("markup prices a co-managed offering with the co-managed markup", () => {
  const [tier] = calculate(markup([coManaged]), INPUTS).tiers;
  assert.equal(tier.costFloor, 10);
  assert.equal(tier.standardRate, 20);
});

test("an offering built on a co-managed root is co-managed; its add-ons still use the add-on lever", () => {
  const child: ServiceTierDef = { key: "plus", label: "Plus", parentKey: "co" };
  const [, plus] = calculate(costPlus([coManaged, child]), INPUTS).tiers;
  assert.equal(plus.coManaged, true);
  // Base $10 × 2 + add-on $10 raw = $30 floor; base $40 + add-on $10 × 4 = $80.
  assert.equal(plus.costFloor, 30);
  assert.equal(plus.standardRate, 80);
});

test("a flat-rate override replaces the formula, summing every component set", () => {
  const priced: ServiceTierDef = {
    ...managed,
    rateOverride: { perUser: 5, perDevice: 1, perLocation: 10, flat: 25 },
  };
  const [tier] = calculate(costPlus([priced]), INPUTS).tiers;
  // 5×10 + 1×20 + 10×2 + 25 = 115, above the $40 floor.
  assert.equal(tier.overridden, true);
  assert.equal(tier.standardRate, 115);
  assert.equal(tier.discountedRate, 115);
  assert.equal(tier.costFloor, 40);
});

test("an override of all zeros is no override", () => {
  const priced: ServiceTierDef = {
    ...managed,
    rateOverride: { perUser: 0, perDevice: 0, perLocation: 0, flat: 0 },
  };
  const [tier] = calculate(costPlus([priced]), INPUTS).tiers;
  assert.equal(tier.overridden, false);
  assert.equal(tier.standardRate, 80);
});

test("an override under the cost floor charges the floor and asks for review", () => {
  const priced: ServiceTierDef = {
    ...managed,
    rateOverride: { perUser: 2, perDevice: 0, perLocation: 0, flat: 0 },
  };
  const result = calculate(costPlus([priced]), INPUTS);
  const [tier] = result.tiers;
  assert.equal(tier.standardRate, 20);
  assert.equal(tier.discountedRate, 40);
  assert.ok(
    result.triggers.some((trigger) => trigger.code === "OVERRIDE_BELOW_COST"),
  );
  assert.equal(result.needsApproval, true);
});

test("bundle discounts come off an overridden rate but never below cost", () => {
  const priced: ServiceTierDef = {
    ...managed,
    rateOverride: { perUser: 5, perDevice: 0, perLocation: 0, flat: 0 },
  };
  const [tier] = calculate(costPlus([priced], 50), {
    ...INPUTS,
    bundleKey: "loyalty",
  }).tiers;
  // $50 − 50% = $25, under the $40 floor, so the discount is capped.
  assert.equal(tier.standardRate, 50);
  assert.equal(tier.discountedRate, 40);
  assert.equal(tier.discountCappedAtCost, true);
});

test("the per-user floor still lifts an overridden rate", () => {
  const priced: ServiceTierDef = {
    ...managed,
    rateOverride: { perUser: 5, perDevice: 0, perLocation: 0, flat: 0 },
  };
  const [tier] = calculate(costPlus([priced]), {
    ...INPUTS,
    perUserFloor: 9,
  }).tiers;
  assert.equal(tier.belowFloor, true);
  assert.equal(tier.headlinePerUser, 9);
});
