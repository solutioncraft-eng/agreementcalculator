import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { CryptoError, decryptSecret, encryptSecret, encryptionConfigured } from "../src/lib/crypto";
import { integrationConfigured, parseApiKey } from "../src/lib/mspcadence";

const KEY = randomBytes(32).toString("base64");

function withKey<T>(key: string | undefined, body: () => T): T {
  const previous = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (key === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
  else process.env.INTEGRATION_ENCRYPTION_KEY = key;
  try {
    return body();
  } finally {
    if (previous === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
    else process.env.INTEGRATION_ENCRYPTION_KEY = previous;
  }
}

test("a stored integration secret survives a round trip but is never stored in the clear", () => {
  withKey(KEY, () => {
    const secret = "quote-directory-bearer-secret";
    const stored = encryptSecret(secret);
    assert.ok(!stored.includes(secret));
    assert.equal(stored.split(":").length, 3);
    assert.equal(decryptSecret(stored), secret);
  });
});

test("the same secret encrypts differently every time, so the ciphertext leaks no repeats", () => {
  withKey(KEY, () => {
    assert.notEqual(encryptSecret("same"), encryptSecret("same"));
  });
});

test("a secret encrypted under another key cannot be read", () => {
  const stored = withKey(KEY, () => encryptSecret("secret"));
  withKey(randomBytes(32).toString("base64"), () => {
    assert.throws(() => decryptSecret(stored), CryptoError);
  });
});

test("a tampered secret is refused rather than decrypted to garbage", () => {
  withKey(KEY, () => {
    const [iv, tag, ciphertext] = encryptSecret("secret").split(":");
    const flipped = Buffer.from(ciphertext, "base64");
    flipped[0] ^= 0xff;
    assert.throws(() => decryptSecret([iv, tag, flipped.toString("base64")].join(":")), CryptoError);
  });
});

test("encryption reports itself unconfigured unless the key is exactly 32 bytes", () => {
  withKey(undefined, () => assert.equal(encryptionConfigured(), false));
  withKey(randomBytes(16).toString("base64"), () => assert.equal(encryptionConfigured(), false));
  withKey(KEY, () => assert.equal(encryptionConfigured(), true));
});

test("a workspace counts as connected only with a url, an encrypted key and a tenant id", () => {
  const full = { mspCadenceUrl: "https://x/y", mspCadenceKeyEnc: "a:b:c", mspCadenceTenantId: "t" };
  assert.equal(integrationConfigured(full), true);
  assert.equal(integrationConfigured({ ...full, mspCadenceKeyEnc: null }), false);
  assert.equal(integrationConfigured({ ...full, mspCadenceUrl: null }), false);
  assert.equal(integrationConfigured({ ...full, mspCadenceTenantId: null }), false);
});

test("parseApiKey derives the directory URL from a well-formed key and rejects the rest", () => {
  const key = `mspc_rifynfswkfuzfwmrfnif_${"ab".repeat(24)}`;
  assert.deepEqual(parseApiKey(`  ${key}\n`), {
    key,
    url: "https://rifynfswkfuzfwmrfnif.supabase.co/functions/v1/quote-customer-directory",
  });
  assert.equal(parseApiKey("not-a-key"), null);
  assert.equal(parseApiKey("mspc_short_abc"), null);
  assert.equal(parseApiKey(`mspc_evil.example.com/_${"ab".repeat(24)}`), null);
  assert.equal(parseApiKey(`mspc_rifynfswkfuzfwmrfnif_${"zz".repeat(24)}`), null);
});
