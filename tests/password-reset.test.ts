import assert from "node:assert/strict";
import test from "node:test";
import {
  RESET_TTL_MINUTES,
  RESET_WINDOW_MINUTES,
  hashResetToken,
  newResetToken,
  resetExpiry,
  resetTokenUsable,
  resetWindowStart,
} from "../src/lib/password-reset";

test("a token is unguessable and only its digest is meant for storage", () => {
  const a = newResetToken();
  const b = newResetToken();

  assert.notEqual(a.token, b.token);
  assert.notEqual(a.tokenHash, b.tokenHash);
  assert.equal(a.tokenHash, hashResetToken(a.token));
  assert.match(a.tokenHash, /^[0-9a-f]{64}$/);
  assert.ok(a.token.length >= 40);
  assert.ok(!a.tokenHash.includes(a.token));
});

test("the digest is what a lookup can be done by, and nothing else matches", () => {
  const { token, tokenHash } = newResetToken();

  assert.equal(hashResetToken(token), tokenHash);
  assert.notEqual(hashResetToken(`${token}x`), tokenHash);
  assert.notEqual(hashResetToken(token.toUpperCase()), tokenHash);
});

test("a link expires an hour out and is refused once used or stale", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");
  const expiresAt = resetExpiry(now);

  assert.equal(expiresAt.getTime() - now.getTime(), RESET_TTL_MINUTES * 60_000);
  assert.ok(resetTokenUsable({ expiresAt, usedAt: null }, now));

  const justBeforeExpiry = new Date(expiresAt.getTime() - 1);
  assert.ok(resetTokenUsable({ expiresAt, usedAt: null }, justBeforeExpiry));
  assert.ok(!resetTokenUsable({ expiresAt, usedAt: null }, expiresAt));
  assert.ok(!resetTokenUsable({ expiresAt, usedAt: null }, new Date(expiresAt.getTime() + 1)));

  // Single use: consuming the link retires it even while it is fresh.
  assert.ok(!resetTokenUsable({ expiresAt, usedAt: now }, now));
});

test("the rate-limit window looks back a fixed span", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");
  assert.equal(now.getTime() - resetWindowStart(now).getTime(), RESET_WINDOW_MINUTES * 60_000);
});
