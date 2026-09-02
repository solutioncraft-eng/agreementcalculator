import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_BUNDLE,
  applyBundle,
  costFloorLift,
  ratesDiffer,
  type CalcInputs,
  type CogsLine,
  type PricingConfig,
  type ServiceTierDef,
} from "../src/lib/pricing/engine";
import { calculate } from "../src/lib/pricing/models";

const SETTINGS = {
  laborMultiplier: 3,
  defaultSgmPct: 50,
  maxSgmPct: 70,
  minPerUserFloor: 10,
  addonMultiplier: 4,
  coManagedLaborMultiplier: 1,
};

const INPUTS: CalcInputs = {
  users: 10,
  devices: 10,
  locations: 1,
  sgmPct: 50,
  perUserFloor: 10,
  floorOverride: false,
  addonMultiplier: 4,
  markupMultiple: 0,
  bundleKey: NO_BUNDLE.key,
};

const TIERS: ServiceTierDef[] = [
  { key: "core", label: "Core", sortOrder: 0, parentKey: null },
  { key: "plus", label: "Plus", sortOrder: 1, parentKey: "core" },
];

// The add-on offering carries the expensive tool, so a small add-on multiplier
// is enough to put its standard rate under its own cost floor.
const ITEMS: CogsLine[] = [
  { key: "tool-core", label: "Tool Core", unit: "USER", tierKeys: ["core"], unitCost: 1, sortOrder: 0 },
  { key: "tool-plus", label: "Tool Plus", unit: "USER", tierKeys: ["plus"], unitCost: 20, sortOrder: 1 },
];

const CONFIG: PricingConfig = {
  versionId: "v",
  versionLabel: "2026.1",
  costBasis: "test",
  model: "COST_PLUS",
  settings: SETTINGS,
  tiers: TIERS,
  items: ITEMS,
  bundles: [NO_BUNDLE, { key: "loyalty", label: "Loyalty", discountPct: 40, sortOrder: 1 }],
};

test("a standard rate under cost is lifted to the floor without reading as a discount", () => {
  // An add-on multiplier below 1 sells the add-on tools under their licence cost.
  const result = calculate(CONFIG, { ...INPUTS, addonMultiplier: 0.1 });
  const plus = result.tiers[1];

  assert.ok(plus.standardRate < plus.costFloor);
  assert.equal(plus.discountedRate, plus.costFloor);
  assert.equal(plus.discount, 0);
  assert.equal(costFloorLift(plus), plus.costFloor - plus.standardRate);
});

test("a bundle discount is never negative and never exceeds its percentage", () => {
  const discounted = calculate(CONFIG, { ...INPUTS, bundleKey: "loyalty", addonMultiplier: 0.1 });
  for (const tier of discounted.tiers) {
    assert.ok(tier.discount >= 0, `${tier.label} discount is negative`);
    assert.ok(tier.discount <= tier.standardRate * 0.4 + 1e-6);
    assert.ok(tier.discountedRate >= tier.costFloor - 1e-6);
  }
});

test("a rate at or above cost keeps its full discount and needs no lift", () => {
  const result = calculate(CONFIG, { ...INPUTS, bundleKey: "loyalty" });
  const core = result.tiers[0];

  assert.equal(core.discount, core.standardRate - core.discountedRate);
  assert.equal(costFloorLift(core), 0);
});

test("applyBundle caps a discount at the cost floor rather than selling below it", () => {
  const capped = applyBundle(100, 80, 0.5);
  assert.deepEqual(capped, { final: 80, capped: true, discount: 20 });

  const uncapped = applyBundle(100, 40, 0.5);
  assert.deepEqual(uncapped, { final: 50, capped: false, discount: 50 });
});

test("an offering later in display order can price below an earlier one", () => {
  // A standalone offering carries only its own cheap tool, so display order
  // says nothing about which rate is higher.
  const config: PricingConfig = {
    ...CONFIG,
    tiers: [...TIERS, { key: "solo", label: "Solo", sortOrder: 2, parentKey: null }],
    items: [
      ...ITEMS,
      { key: "tool-solo", label: "Tool Solo", unit: "USER", tierKeys: ["solo"], unitCost: 0.5, sortOrder: 2 },
    ],
  };
  const [core, , solo] = calculate(config, { ...INPUTS, perUserFloor: 0 }).tiers;

  assert.ok(solo.index > core.index);
  assert.ok(solo.headlineRate < core.headlineRate);
  assert.equal(ratesDiffer(solo.headlineRate, core.headlineRate), true);
});

test("offerings sharing a floor rate are not treated as an upgrade step", () => {
  // 100 users at the $200/user floor lifts both offerings onto $20,000.
  const result = calculate(CONFIG, { ...INPUTS, users: 100, perUserFloor: 200 });
  const [core, plus] = result.tiers;

  assert.ok(core.belowFloor && plus.belowFloor);
  assert.equal(core.headlineRate, plus.headlineRate);
  assert.equal(ratesDiffer(core.headlineRate, plus.headlineRate), false);
  assert.equal(ratesDiffer(20000, 20000.6), true);
});
