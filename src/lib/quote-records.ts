import { randomBytes } from "node:crypto";

export function newQuoteRef(): string {
  const now = new Date();
  const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `QR-${month}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

export function purgeDate(retentionMonths: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + retentionMonths);
  return d;
}
