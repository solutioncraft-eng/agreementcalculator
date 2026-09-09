import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for third-party credentials a workspace stores here
 * (currently its MSP Cadence bearer secret). The plaintext has to be sent back
 * out to the other system, so it cannot be hashed; instead it is encrypted with
 * AES-256-GCM under a server-only key and decrypted at call time. A database
 * dump on its own therefore reveals nothing.
 *
 * `INTEGRATION_ENCRYPTION_KEY` is deliberately separate from `AUTH_SECRET`: one
 * signs sessions and can be rotated freely, the other is the only way to read
 * stored credentials back and rotating it invalidates them.
 */
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export class CryptoError extends Error {}

/** True when `INTEGRATION_ENCRYPTION_KEY` is set and usable. */
export function encryptionConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

function key(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) throw new CryptoError("INTEGRATION_ENCRYPTION_KEY is not set.");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) {
    throw new CryptoError("INTEGRATION_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
  }
  return bytes;
}

/**
 * Encrypts a secret as `iv:tag:ciphertext`, each part base64. The IV is random
 * per value, so encrypting the same secret twice never produces the same
 * string, and the GCM tag makes tampering with a stored value fail loudly
 * rather than decrypt to garbage.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export function decryptSecret(ciphertext: string): string {
  const [ivPart, tagPart, dataPart] = ciphertext.split(":");
  if (!ivPart || !tagPart || !dataPart) throw new CryptoError("Stored secret is not in iv:tag:ciphertext form.");
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64")), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    // Wrong key, or the row was altered.
    throw new CryptoError("Stored secret could not be decrypted. It may need to be re-entered.");
  }
}
