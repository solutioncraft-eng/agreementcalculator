import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_INPUTS,
  SEED_COGS_ITEMS,
  SEED_COST_PLUS_SETTINGS,
  SEED_SERVICE_TIERS,
} from "../src/lib/pricing/defaults";
import { NO_BUNDLE, includedLines, tierChain, type CalcInputs } from "../src/lib/pricing/engine";
import { calculate } from "../src/lib/pricing/models";
import { seedConfig } from "../src/lib/pricing/seed-config";

const INPUTS: CalcInputs = {
  ...DEFAULT_INPUTS,
  sgmPct: SEED_COST_PLUS_SETTINGS.defaultSgmPct,
  perUserFloor: SEED_COST_PLUS_SETTINGS.minPerUserFloor,
  floorOverride: false,
  addonMultiplier: SEED_COST_PLUS_SETTINGS.addonMultiplier,
  markupMultiple: 0,
  bundleKey: NO_BUNDLE.key,
};

const ownItems = (tierKey: string) => SEED_COGS_ITEMS.filter((i) => i.tierKeys.some((k) => k === tierKey));

test("a new workspace starts with a parent, an add-on built on it, and a standalone", () => {
  const config = seedConfig();
  const keys = config.tiers.map((t) => t.key);
  assert.deepEqual(keys, ["parent", "addon", "co-managed"]);

  assert.deepEqual(
    tierChain(config.tiers, "addon").map((t) => t.key),
    ["parent", "addon"],
  );
  assert.deepEqual(
    tierChain(config.tiers, "co-managed").map((t) => t.key),
    ["co-managed"],
  );
});

test("every seeded offering carries COGS items of its own", () => {
  for (const tier of SEED_SERVICE_TIERS) {
    assert.ok(ownItems(tier.key).length > 0, `${tier.label} has no items of its own`);
  }
});

test("the standalone offering costs only its own membership", () => {
  const result = calculate(seedConfig(), INPUTS);
  const included = includedLines(result, "co-managed").map((i) => i.key);

  assert.deepEqual(
    included,
    ownItems("co-managed").map((i) => i.key),
  );
  // Items the parent agreement introduces stay out of a standalone offering.
  assert.ok(!included.includes("pam"));
  assert.ok(!included.includes("net"));
});

test("the add-on offering includes the parent's items plus its own", () => {
  const result = calculate(seedConfig(), INPUTS);
  const included = includedLines(result, "addon").map((i) => i.key);

  for (const item of ownItems("parent")) assert.ok(included.includes(item.key));
  for (const item of ownItems("addon")) assert.ok(included.includes(item.key));
  assert.ok(!included.includes("portal"));
});
