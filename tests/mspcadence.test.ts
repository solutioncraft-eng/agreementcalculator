import assert from "node:assert/strict";
import test from "node:test";
import { isMspCadenceAssetUrl, mspCadenceConfigured } from "../src/lib/mspcadence";
import { exportPayloadSchema } from "../src/lib/schemas";

const base = { docType: "QUOTE", tierKey: "core", clientName: "Acme" };

test("customer header fields are optional and validated as URLs where they are URLs", () => {
  assert.ok(exportPayloadSchema.safeParse(base).success);
  const full = exportPayloadSchema.safeParse({
    ...base,
    customerLogoUrl: "https://x.supabase.co/storage/v1/object/public/client-logos/a.png",
    customerWebsite: "https://acme.example",
    customerPhone: "555-0100",
    customerTechnicalContactName: "Tech",
    customerTechnicalContactEmail: "tech@acme.example",
    customerExecutiveSponsorName: null,
    customerExecutiveSponsorEmail: "",
  });
  assert.ok(full.success);
  assert.equal(exportPayloadSchema.safeParse({ ...base, customerLogoUrl: "not a url" }).success, false);
  assert.equal(exportPayloadSchema.safeParse({ ...base, customerLogoUrl: "javascript:alert(1)" }).success, false);
  assert.equal(exportPayloadSchema.safeParse({ ...base, customerWebsite: "ftp://acme.example" }).success, false);
});

test("the lookup is dormant without a directory key", () => {
  const saved = process.env.MSPCADENCE_DIRECTORY_KEY;
  delete process.env.MSPCADENCE_DIRECTORY_KEY;
  try {
    assert.equal(mspCadenceConfigured(), false);
    assert.equal(isMspCadenceAssetUrl("https://rifynfswkfuzfwmrfnif.supabase.co/x.png"), false);
  } finally {
    if (saved !== undefined) process.env.MSPCADENCE_DIRECTORY_KEY = saved;
  }
});

test("only logos on the MSP Cadence host are fetched for the PDF", () => {
  const saved = { ...process.env };
  process.env.MSPCADENCE_DIRECTORY_KEY = "k";
  process.env.MSPCADENCE_DIRECTORY_URL = "https://proj.supabase.co/functions/v1/quote-customer-directory";
  try {
    assert.equal(mspCadenceConfigured(), true);
    assert.equal(isMspCadenceAssetUrl("https://proj.supabase.co/storage/v1/object/public/client-logos/a.png"), true);
    assert.equal(isMspCadenceAssetUrl("http://proj.supabase.co/a.png"), false);
    assert.equal(isMspCadenceAssetUrl("https://evil.example/a.png"), false);
    assert.equal(isMspCadenceAssetUrl(null), false);
  } finally {
    process.env.MSPCADENCE_DIRECTORY_KEY = saved.MSPCADENCE_DIRECTORY_KEY;
    process.env.MSPCADENCE_DIRECTORY_URL = saved.MSPCADENCE_DIRECTORY_URL;
  }
});
