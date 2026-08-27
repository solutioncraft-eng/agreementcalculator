import { createHash, randomBytes } from "node:crypto";

/** How long a reset link stays usable. */
export const RESET_TTL_MINUTES = 60;

/** Links a person may ask for inside {@link RESET_WINDOW_MINUTES}. */
export const RESET_MAX_REQUESTS = 5;
export const RESET_WINDOW_MINUTES = 15;

/**
 * The token travels in a URL and is therefore treated as a bearer credential:
 * the database keeps only its digest, so a stolen row cannot be replayed as a
 * link. SHA-256 rather than bcrypt because the lookup has to be by hash, and a
 * 256-bit random token has no entropy to stretch.
 */
export function newResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resetExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TTL_MINUTES * 60_000);
}

export function resetWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - RESET_WINDOW_MINUTES * 60_000);
}

export interface ResetTokenRow {
  expiresAt: Date;
  usedAt: Date | null;
}

/** A link works once, and only until it expires. */
export function resetTokenUsable(row: ResetTokenRow, now: Date = new Date()): boolean {
  return row.usedAt === null && row.expiresAt.getTime() > now.getTime();
}
