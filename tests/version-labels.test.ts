import { test } from "node:test";
import assert from "node:assert/strict";
import { freeLabel, nextLabel } from "../src/lib/pricing/labels";
import { SEED_VERSION_LABEL } from "../src/lib/pricing/defaults";

test("nextLabel bumps the trailing number, or starts a series", () => {
  assert.equal(nextLabel("2026.3"), "2026.4");
  assert.equal(nextLabel("2026.9"), "2026.10");
  assert.equal(nextLabel("Baseline"), "Baseline.1");
  assert.equal(nextLabel(), SEED_VERSION_LABEL);
});

test("freeLabel bumps past labels archived versions still hold", () => {
  assert.equal(freeLabel("2026.3", ["2026.3"]), "2026.4");
  assert.equal(freeLabel("2026.3", ["2026.3", "2026.4", "2026.5"]), "2026.6");
  assert.equal(freeLabel("2026.3", ["2026.3", "2026.5"]), "2026.4");
  assert.equal(freeLabel("Baseline", ["Baseline", "Baseline.1"]), "Baseline.2");
  assert.equal(freeLabel(undefined, [SEED_VERSION_LABEL]), nextLabel(SEED_VERSION_LABEL));
});
