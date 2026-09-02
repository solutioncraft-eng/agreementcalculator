import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  authorizationUrl,
  codeChallenge,
  domainAllowed,
  newHandshake,
  openHandshake,
  openSignup,
  sealHandshake,
  sealSignup,
  statesMatch,
} from "../src/lib/google";

process.env.AUTH_SECRET ??= "test-secret-that-is-long-enough-to-sign-with";

const config = {
  clientId: "client-id.apps.googleusercontent.com",
  clientSecret: "secret",
  redirectUri: "https://www.agreementcalculator.com/api/auth/google/callback",
};

test("the authorization request asks only for identity, with PKCE", () => {
  const handshake = newHandshake();
  const url = new URL(authorizationUrl(config, handshake));
  const params = url.searchParams;

  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(params.get("scope"), "openid email profile");
  assert.equal(params.get("response_type"), "code");
  assert.equal(params.get("redirect_uri"), config.redirectUri);
  assert.equal(params.get("state"), handshake.state);
  assert.equal(params.get("nonce"), handshake.nonce);
  assert.equal(params.get("code_challenge_method"), "S256");
  // The verifier itself must never leave this server.
  assert.equal(params.get("code_challenge"), codeChallenge(handshake.verifier));
  assert.ok(!url.search.includes(handshake.verifier));
});

test("the code challenge is the SHA-256 of the verifier", () => {
  assert.equal(
    codeChallenge("verifier"),
    createHash("sha256").update("verifier").digest("base64url"),
  );
});

test("every handshake is fresh", () => {
  const first = newHandshake();
  const second = newHandshake();
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.verifier, second.verifier);
  assert.notEqual(first.nonce, second.nonce);
});

test("a sealed handshake survives the round trip and nothing else opens", async () => {
  const handshake = newHandshake();
  const sealed = await sealHandshake(handshake);
  assert.deepEqual(await openHandshake(sealed), handshake);

  assert.equal(await openHandshake("not-a-token"), null);
  // A tampered payload fails the signature rather than being trusted.
  const [header, , signature] = sealed.split(".");
  const forged = Buffer.from(
    JSON.stringify({ ...handshake, state: "attacker" }),
    "utf8",
  ).toString("base64url");
  assert.equal(await openHandshake(`${header}.${forged}.${signature}`), null);
});

test("a pending Google signup keeps the identity the callback verified", async () => {
  const identity = { sub: "google-123", email: "new@acme.com", name: "New Person" };
  const sealed = await sealSignup(identity);
  assert.deepEqual(await openSignup(sealed), identity);

  assert.equal(await openSignup("not-a-token"), null);
  // The form must not be able to nominate a different address to administer.
  const [header, , signature] = sealed.split(".");
  const forged = Buffer.from(
    JSON.stringify({ use: "signup", sub: identity.sub, email: "attacker@acme.com" }),
    "utf8",
  ).toString("base64url");
  assert.equal(await openSignup(`${header}.${forged}.${signature}`), null);
});

test("a handshake token is not accepted as a pending signup, or the reverse", async () => {
  const handshake = newHandshake();
  assert.equal(await openSignup(await sealHandshake(handshake)), null);
  assert.equal(
    await openHandshake(await sealSignup({ sub: "s", email: "a@b.com", name: null })),
    null,
  );
});

test("state is compared whole", () => {
  assert.ok(statesMatch("abc", "abc"));
  assert.ok(!statesMatch("abc", "abd"));
  assert.ok(!statesMatch("abc", "abcd"));
  assert.ok(!statesMatch("", "abc"));
});

test("the domain allow-list is off when unset", () => {
  assert.ok(domainAllowed("anyone@example.com", []));
  assert.ok(domainAllowed("person@solutioncraft.ai", ["solutioncraft.ai", "acme.com"]));
  assert.ok(!domainAllowed("person@elsewhere.com", ["solutioncraft.ai"]));
  assert.ok(!domainAllowed("no-domain", ["solutioncraft.ai"]));
});
