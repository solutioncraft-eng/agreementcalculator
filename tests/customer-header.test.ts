import assert from "node:assert/strict";
import test from "node:test";
import { isCustomerAssetUrl } from "../src/lib/mspcadence";
import { exportPayloadSchema } from "../src/lib/schemas";

const base = { docType: "QUOTE", tierKey: "core", clientName: "Acme" };
const ok = (extra: Record<string, unknown>) => exportPayloadSchema.safeParse({ ...base, ...extra }).success;

test("customer header URLs must be real web addresses, and may be blank", () => {
  assert.ok(ok({}));
  assert.ok(ok({ customerLogoUrl: "", customerWebsite: "" }));
  assert.ok(ok({ customerLogoUrl: "https://x.supabase.co/storage/v1/object/public/client-logos/a.png" }));
  assert.ok(ok({ customerWebsite: "http://acme.example" }));
  assert.equal(ok({ customerLogoUrl: "http://x.supabase.co/a.png" }), false);
  assert.equal(ok({ customerLogoUrl: "https://" }), false);
  assert.equal(ok({ customerLogoUrl: "javascript:alert(1)" }), false);
  assert.equal(ok({ customerWebsite: "acme.example" }), false);
  assert.equal(ok({ customerWebsite: "ftp://acme.example" }), false);
});

test("only https assets on the workspace's MSP Cadence host count as customer logos", () => {
  const directory = "https://proj.supabase.co/functions/v1/quote-customer-directory";
  assert.ok(isCustomerAssetUrl("https://proj.supabase.co/storage/v1/object/public/client-logos/a.png", directory));
  assert.equal(isCustomerAssetUrl("http://proj.supabase.co/a.png", directory), false);
  assert.equal(isCustomerAssetUrl("https://evil.example/a.png", directory), false);
  assert.equal(isCustomerAssetUrl("https://proj.supabase.co.evil.example/a.png", directory), false);
  assert.equal(isCustomerAssetUrl("https://proj.supabase.co/a.png", null), false);
  assert.equal(isCustomerAssetUrl(null, directory), false);
});
