import assert from "node:assert/strict";
import test from "node:test";
import { CrossTenantQueryError, TENANT_MODELS, isForeignRow, scopeArgs } from "../src/lib/db";
import { RESERVED_SLUGS, isValidSlug, slugFromName } from "../src/lib/tenant";

const TENANT = "tenant-a";
const OTHER = "tenant-b";

test("reads are filtered to the active tenant", () => {
  for (const operation of ["findFirst", "findMany", "count", "aggregate", "groupBy"]) {
    const scoped = scopeArgs("QuoteRequest", operation, { where: { status: "PENDING" } }, TENANT);
    assert.deepEqual(scoped.where, { status: "PENDING", tenantId: TENANT });
  }
});

test("a read with no filter at all still gets one", () => {
  assert.deepEqual(scopeArgs("QuoteRequest", "findMany", {}, TENANT).where, { tenantId: TENANT });
});

test("writes are stamped with the active tenant", () => {
  const created = scopeArgs("QuoteRequest", "create", { data: { ref: "Q-1" } }, TENANT);
  assert.deepEqual(created.data, { ref: "Q-1", tenantId: TENANT });

  const many = scopeArgs("CogsItem", "createMany", { data: [{ key: "edr" }, { key: "mfa" }] }, TENANT);
  assert.deepEqual(many.data, [
    { key: "edr", tenantId: TENANT },
    { key: "mfa", tenantId: TENANT },
  ]);

  const upserted = scopeArgs(
    "BundleDiscount",
    "upsert",
    { where: { key: "voip" }, create: { key: "voip" }, update: { discountPct: 5 } },
    TENANT,
  );
  assert.deepEqual(upserted.create, { key: "voip", tenantId: TENANT });
});

test("naming another tenant explicitly is refused, not silently rewritten", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["findMany", { where: { tenantId: OTHER } }],
    ["update", { where: { id: "x", tenantId: OTHER }, data: {} }],
    ["delete", { where: { id: "x", tenantId: OTHER } }],
    ["create", { data: { tenantId: OTHER } }],
    ["createMany", { data: [{ tenantId: TENANT }, { tenantId: OTHER }] }],
    ["upsert", { where: { id: "x" }, create: { tenantId: OTHER }, update: {} }],
  ];
  for (const [operation, args] of cases) {
    assert.throws(
      () => scopeArgs("QuoteRequest", operation, args, TENANT),
      CrossTenantQueryError,
      `${operation} should be refused`,
    );
  }
});

test("naming the active tenant explicitly is allowed", () => {
  const scoped = scopeArgs("QuoteRequest", "create", { data: { tenantId: TENANT, ref: "Q-2" } }, TENANT);
  assert.deepEqual(scoped.data, { tenantId: TENANT, ref: "Q-2" });
});

test("a row belonging to another tenant is recognised as foreign", () => {
  assert.equal(isForeignRow({ id: "q1", tenantId: OTHER }, TENANT), true);
  assert.equal(isForeignRow({ id: "q1", tenantId: TENANT }, TENANT), false);
  // Rows of models without an owner column, and misses, are not "foreign".
  assert.equal(isForeignRow({ id: "u1" }, TENANT), false);
  assert.equal(isForeignRow(null, TENANT), false);
});

test("every tenant-owned model in the schema is scoped", async () => {
  const { readFile } = await import("node:fs/promises");
  const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

  const owned = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
    .filter(([, , body]) => /^\s{2}tenantId\s+String/m.test(body))
    .map(([, name]) => name);

  assert.ok(owned.length > 0, "no tenant-owned models found in the schema");
  for (const model of owned) {
    assert.ok(TENANT_MODELS.has(model), `${model} has tenantId but is not in TENANT_MODELS`);
  }
  for (const model of TENANT_MODELS) {
    assert.ok(owned.includes(model), `${model} is scoped but has no tenantId column`);
  }
});

test("product hostnames cannot be claimed as workspace slugs", () => {
  for (const reserved of RESERVED_SLUGS) assert.equal(isValidSlug(reserved), false);
  assert.equal(isValidSlug("acme"), true);
  assert.equal(isValidSlug("acme-it"), true);
  assert.equal(isValidSlug("a"), false);
  assert.equal(isValidSlug("-acme"), false);
  assert.equal(isValidSlug("Acme"), false);
  assert.equal(isValidSlug("acme.it"), false);
  assert.equal(slugFromName("Acme IT Services, Inc."), "acme-it-services-inc");
});
