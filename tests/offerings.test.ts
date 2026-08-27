import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_BUNDLE,
  includedLines,
  orderedTiers,
  tierResultFor,
  type CalcInputs,
  type CogsLine,
  type PricingConfig,
  type ServiceTierDef,
} from "../src/lib/pricing/engine";
import { calculate } from "../src/lib/pricing/models";
import { storedTier, storedTiers, quoteTierName, tierRatesFrom } from "../src/lib/quotes";

const SETTINGS = {
  laborMultiplier: 3,
  defaultSgmPct: 50,
  maxSgmPct: 70,
  minPerUserFloor: 10,
  addonMultiplier: 4,
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

/** A cost-plus version with `tiers` offerings, each carrying one $1/user tool. */
function configFor(tiers: ServiceTierDef[]): PricingConfig {
  const items: CogsLine[] = tiers.map((tier, index) => ({
    key: `tool-${tier.key}`,
    label: `Tool ${tier.label}`,
    unit: "USER",
    tierKey: tier.key,
    unitCost: 1,
    sortOrder: index,
  }));
  return {
    versionId: "v",
    versionLabel: "2026.1",
    costBasis: "test",
    model: "COST_PLUS",
    settings: SETTINGS,
    tiers,
    items,
    bundles: [NO_BUNDLE],
  };
}

const ladder = (...labels: string[]): ServiceTierDef[] =>
  labels.map((label, index) => ({ key: label.toLowerCase(), label, sortOrder: index }));

test("a single offering prices on its own, with no upgrade steps", () => {
  const result = calculate(configFor(ladder("Core")), INPUTS);

  assert.equal(result.tiers.length, 1);
  assert.deepEqual(result.deltas, []);
  const core = result.tiers[0];
  assert.equal(core.index, 0);
  assert.equal(core.toolCost, 10);
  // tool + 3× imputed labor, then / (1 - 50%)
  assert.equal(core.costFloor, 40);
  assert.equal(core.standardRate, 80);
});

test("offerings are cumulative: each one carries every offering below it", () => {
  const result = calculate(configFor(ladder("Core", "Plus", "Elite")), INPUTS);

  assert.deepEqual(
    result.tiers.map((tier) => [tier.label, tier.toolCost, tier.standardRate]),
    [
      // Base: $10 tool → floor 40 → rate 80.
      ["Core", 10, 80],
      // +$10 of add-on tools at the 4× add-on multiplier.
      ["Plus", 20, 120],
      // Add-ons accumulate rather than replacing the tier below.
      ["Elite", 30, 160],
    ],
  );
  assert.deepEqual(
    result.deltas.map((delta) => [delta.fromKey, delta.toKey, delta.standardRate]),
    [
      ["core", "plus", 40],
      ["plus", "elite", 40],
    ],
  );
  // Every offering's own lines belong to it alone; the cumulative view stacks them.
  assert.deepEqual(
    result.tiers.map((tier) => tier.lines.map((line) => line.key)),
    [["tool-core"], ["tool-plus"], ["tool-elite"]],
  );
  assert.deepEqual(
    includedLines(result, "elite").map((line) => line.key),
    ["tool-core", "tool-plus", "tool-elite"],
  );
  assert.deepEqual(includedLines(result, "core").map((line) => line.key), ["tool-core"]);
});

test("sortOrder decides the ladder, not insertion order", () => {
  const config = configFor([
    { key: "elite", label: "Elite", sortOrder: 2 },
    { key: "core", label: "Core", sortOrder: 0 },
    { key: "plus", label: "Plus", sortOrder: 1 },
  ]);
  assert.deepEqual(
    orderedTiers(config).map((tier) => tier.key),
    ["core", "plus", "elite"],
  );
  assert.deepEqual(
    calculate(config, INPUTS).tiers.map((tier) => tier.key),
    ["core", "plus", "elite"],
  );
});

test("the per-user floor is enforced per offering and names the offering it lifted", () => {
  const config = configFor(ladder("Core", "Plus", "Elite"));
  const result = calculate(config, { ...INPUTS, perUserFloor: 11 });

  // Core prices at $8/user and is lifted; the richer offerings clear the floor.
  assert.deepEqual(
    result.tiers.map((tier) => [tier.label, tier.belowFloor, tier.headlineRate]),
    [
      ["Core", true, 110],
      ["Plus", false, 120],
      ["Elite", false, 160],
    ],
  );
  const floorTriggers = result.triggers.filter((trigger) => trigger.code === "TIER_BELOW_FLOOR");
  assert.equal(floorTriggers.length, 1);
  assert.match(floorTriggers[0].message, /^Core rate/);
  assert.equal(result.needsApproval, true);
});

test("the upgrade step follows the headline rate, so a shared floor shows no step", () => {
  const config = configFor(ladder("Core", "Plus", "Elite"));
  // A floor above both Core ($8/user) and Plus ($12/user) collapses them onto it.
  const result = calculate(config, { ...INPUTS, perUserFloor: 13 });

  assert.deepEqual(
    result.tiers.map((tier) => tier.headlineRate),
    [130, 130, 160],
  );
  assert.deepEqual(
    result.deltas.map((delta) => [delta.headlineRate, delta.discountedRate]),
    [
      // No upgrade price at all, though the un-floored rates differ by 40.
      [0, 40],
      [30, 40],
    ],
  );
});

test("an unknown offering key falls back to the base offering rather than crashing", () => {
  const result = calculate(configFor(ladder("Core", "Plus")), INPUTS);
  assert.equal(tierResultFor(result, "gone").key, "core");
  assert.equal(tierResultFor(result, "plus").key, "plus");
});

test("a quote stores every offering's rate, so its history reads back unchanged", () => {
  const result = calculate(configFor(ladder("Core", "Plus", "Elite")), INPUTS);
  const quote = { requestedTierKey: "plus", tierRates: tierRatesFrom(result.tiers) };

  assert.deepEqual(
    storedTiers(quote).map((tier) => [tier.key, tier.label, tier.rate]),
    [
      ["core", "Core", 100],
      ["plus", "Plus", 120],
      ["elite", "Elite", 160],
    ],
  );
  assert.equal(storedTier(quote)?.rate, 120);
  // A later version renaming its offerings cannot rewrite this quote's label.
  assert.equal(quoteTierName(quote), "Plus");
  assert.equal(quoteTierName({ requestedTierKey: "dropped", tierRates: quote.tierRates }), "dropped");
  assert.equal(quoteTierName({ requestedTierKey: "plus", tierRates: null }), "plus");
});
