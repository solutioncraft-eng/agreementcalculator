import assert from "node:assert/strict";
import test from "node:test";
import { accentStyle } from "../src/lib/branding";
import { approvalLabel, type StampInfo } from "../src/lib/pdf/stamp";

function stamp(overrides: Partial<StampInfo>): StampInfo {
  return {
    exportId: "EX-1",
    exportedAt: new Date("2026-01-01T00:00:00Z"),
    exportedBy: "am@example.com",
    appVersion: "1.0.0",
    pricingVersion: "2026.1",
    costBasis: "cost-plus",
    approvalState: "STANDARD",
    ...overrides,
  };
}

test("an accent colour repaints the accent channels", () => {
  assert.deepEqual(accentStyle("#3366CC"), {
    "--accent-rgb": "51 102 204",
    "--accent-dark-rgb": "43 87 173",
    "--accent-tint-rgb": "122 156 222",
    "--accent-contrast-rgb": "255 255 255",
  });
  assert.deepEqual(accentStyle("#fff"), {
    "--accent-rgb": "255 255 255",
    "--accent-dark-rgb": "217 217 217",
    "--accent-tint-rgb": "255 255 255",
    "--accent-contrast-rgb": "18 37 58",
  });
});

test("text on an accent surface stays legible whatever the workspace picks", () => {
  const contrastOf = (accent: string) =>
    (accentStyle(accent) as Record<string, string> | undefined)?.["--accent-contrast-rgb"];
  const white = "255 255 255";
  const navy = "18 37 58";

  // The house orange and other mid-to-dark accents carry white.
  assert.equal(contrastOf("#F26B21"), white);
  assert.equal(contrastOf("#12253A"), white);
  // Pale accents would leave white text unreadable, so navy takes over.
  assert.equal(contrastOf("#FFD166"), navy);
  assert.equal(contrastOf("#9AE6B4"), navy);
});

test("an absent or malformed accent leaves the house colour alone", () => {
  assert.equal(accentStyle(null), undefined);
  assert.equal(accentStyle(""), undefined);
  assert.equal(accentStyle("not-a-colour"), undefined);
});

test("the approval label keeps the quote reference out of the state itself", () => {
  assert.equal(approvalLabel(stamp({ approvalState: "APPROVED", quoteRef: "QR-7" })), "APPROVED · QR-7");
  assert.equal(approvalLabel(stamp({})), "STANDARD");
});
