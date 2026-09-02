import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_BUNDLE,
  includedLines,
  orderedTiers,
  tierChain,
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

/** A cost-plus version with `tiers` offerings, each carrying one $1/user tool. */
function configFor(tiers: ServiceTierDef[], items?: CogsLine[]): PricingConfig {
  const defaultItems: CogsLine[] = tiers.map((tier, index) => ({
    key: `tool-${tier.key}`,
    label: `Tool ${tier.label}`,
    unit: "USER",
    tierKeys: [tier.key],
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
    items: items ?? defaultItems,
    bundles: [NO_BUNDLE],
  };
}

/** Offerings in a chain, each building on the one before it. */
const ladder = (...labels: string[]): ServiceTierDef[] =>
  labels.map((label, index) => ({
    key: label.toLowerCase(),
    label,
    sortOrder: index,
    parentKey: index === 0 ? null : labels[index - 1].toLowerCase(),
  }));

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

test("an offering carries every offering in its parent chain", () => {
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

test("sortOrder decides display order, not insertion order", () => {
  const config = configFor([
    { key: "elite", label: "Elite", sortOrder: 2, parentKey: "plus" },
    { key: "core", label: "Core", sortOrder: 0 },
    { key: "plus", label: "Plus", sortOrder: 1, parentKey: "core" },
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

test("a standalone offering carries only its own items, whatever its position", () => {
  const config = configFor([
    { key: "core", label: "Core", sortOrder: 0 },
    { key: "plus", label: "Plus", sortOrder: 1, parentKey: "core" },
    // Sits above both, but builds on neither.
    { key: "keystone", label: "Co-Managed Keystone", sortOrder: 2 },
  ]);
  const result = calculate(config, INPUTS);

  assert.deepEqual(includedLines(result, "keystone").map((line) => line.key), ["tool-keystone"]);
  // Priced as a base offering: $10 of tools, not $30, and no upgrade step into it.
  assert.deepEqual(
    result.tiers.map((tier) => [tier.key, tier.toolCost, tier.standardRate]),
    [
      ["core", 10, 80],
      ["plus", 20, 120],
      ["keystone", 10, 80],
    ],
  );
  assert.deepEqual(
    result.deltas.map((delta) => [delta.fromKey, delta.toKey]),
    [["core", "plus"]],
  );
});

test("an offering inherits through the whole chain, not just its parent", () => {
  const config = configFor([
    { key: "core", label: "Core", sortOrder: 0 },
    { key: "plus", label: "Plus", sortOrder: 1, parentKey: "core" },
    // Skips a rung in display order but still builds on Plus.
    { key: "keystone", label: "Keystone", sortOrder: 2, parentKey: "plus" },
  ]);
  const result = calculate(config, INPUTS);

  assert.deepEqual(
    tierChain(config.tiers, "keystone").map((tier) => tier.key),
    ["core", "plus", "keystone"],
  );
  assert.equal(tierResultFor(result, "keystone").toolCost, 30);
});

test("a tool shared by a parent and its child is only paid for once", () => {
  const config = configFor(ladder("Core", "Plus"), [
    { key: "rmm", label: "RMM", unit: "USER", tierKeys: ["core", "plus"], unitCost: 1, sortOrder: 0 },
    { key: "edr", label: "EDR", unit: "USER", tierKeys: ["plus"], unitCost: 1, sortOrder: 1 },
  ]);
  const result = calculate(config, INPUTS);

  assert.deepEqual(includedLines(result, "plus").map((line) => line.key), ["rmm", "edr"]);
  assert.deepEqual(
    result.tiers.map((tier) => [tier.key, tier.toolCost, tier.standardRate]),
    [
      ["core", 10, 80],
      // The shared tool stays in the base, so only EDR is priced as an add-on.
      ["plus", 20, 120],
    ],
  );
});

test("one tool can serve two unrelated offerings without doubling its cost", () => {
  const config = configFor(
    [
      { key: "core", label: "Core", sortOrder: 0 },
      { key: "keystone", label: "Keystone", sortOrder: 1 },
    ],
    [
      { key: "rmm", label: "RMM", unit: "USER", tierKeys: ["core", "keystone"], unitCost: 1, sortOrder: 0 },
    ],
  );
  const result = calculate(config, INPUTS);

  assert.deepEqual(
    result.tiers.map((tier) => [tier.key, tier.toolCost]),
    [
      ["core", 10],
      ["keystone", 10],
    ],
  );
});

test("a loop in the parent links still prices, rather than hanging", () => {
  const config = configFor([
    { key: "core", label: "Core", sortOrder: 0, parentKey: "plus" },
    { key: "plus", label: "Plus", sortOrder: 1, parentKey: "core" },
  ]);

  assert.deepEqual(
    tierChain(config.tiers, "plus").map((tier) => tier.key),
    ["core", "plus"],
  );
  const result = calculate(config, INPUTS);
  assert.deepEqual(
    result.tiers.map((tier) => tier.toolCost),
    [20, 20],
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
