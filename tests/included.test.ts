import assert from "node:assert/strict";
import test from "node:test";
import { groupInclusions, serviceCategory } from "../src/lib/pdf/included";

test("a configured heading wins over the label guess", () => {
  assert.equal(serviceCategory({ label: "Endpoint detection", category: "Custom stack" }), "Custom stack");
  assert.equal(
    serviceCategory({ label: "Endpoint detection", category: "  " }),
    "Security & Threat Protection",
  );
});

test("unlabelled lines are guessed from their name", () => {
  assert.equal(serviceCategory({ label: "Cloud mailbox and file backup" }), "Data Protection & Recovery");
  assert.equal(serviceCategory({ label: "Remote monitoring and management" }), "Proactive Maintenance");
  assert.equal(serviceCategory({ label: "Password manager" }), "Security & Threat Protection");
  assert.equal(serviceCategory({ label: "Shared service desk portal" }), "Service & Support");
});

test("groups keep template order, then custom headings, and always include the baseline", () => {
  const groups = groupInclusions([
    { label: "Documentation platform", category: "Zeta extras" },
    { label: "File backup" },
    { label: "Patch management", category: "Proactive Maintenance" },
    { label: "Email security" },
  ]);
  assert.deepEqual(
    groups.map((g) => g.category),
    [
      "Security & Threat Protection",
      "Proactive Maintenance",
      "Data Protection & Recovery",
      "Service & Support",
      "Zeta extras",
    ],
  );
  const maintenance = groups.find((g) => g.category === "Proactive Maintenance");
  assert.deepEqual(maintenance?.items, ["Patch management"]);
  const support = groups.find((g) => g.category === "Service & Support");
  assert.deepEqual(support?.items, ["Unlimited remote support", "24/7 monitoring and remediation"]);
});
