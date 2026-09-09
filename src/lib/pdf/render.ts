import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { isCustomerAssetUrl } from "@/lib/mspcadence";

let logoCache: Buffer | null | undefined;

/** The product mark, used when a workspace has not uploaded its own logo. */
export async function brandLogo(): Promise<Buffer | undefined> {
  if (logoCache !== undefined) return logoCache ?? undefined;
  try {
    logoCache = await readFile(path.join(process.cwd(), "public", "logo.png"));
  } catch {
    logoCache = null;
  }
  return logoCache ?? undefined;
}

/**
 * Workspace logos live in object storage, so they are fetched per export. A
 * failure is never fatal: the document falls back to the workspace name.
 */
export async function workspaceLogo(logoUrl: string | null): Promise<Buffer | undefined> {
  if (!logoUrl) return brandLogo();
  try {
    const response = await fetch(logoUrl, { cache: "force-cache" });
    if (!response.ok) return undefined;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return undefined;
  }
}

const CUSTOMER_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const CUSTOMER_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);

/**
 * The customer's own logo, for a customer-facing quote. Unlike a workspace
 * logo there is no fallback mark: a customer with no logo simply reads as their
 * name, exactly as an ordinary export does. The URL arrives in the export
 * payload from the browser, so only images hosted by the workspace's own MSP
 * Cadence instance are fetched, and only PNG/JPEG of a sane size.
 */
export async function customerLogo(
  logoUrl: string | null | undefined,
  directoryUrl: string | null | undefined,
): Promise<Buffer | undefined> {
  if (!isCustomerAssetUrl(logoUrl, directoryUrl)) return undefined;
  try {
    const response = await fetch(logoUrl!, { cache: "no-store", redirect: "error" });
    if (!response.ok) return undefined;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!CUSTOMER_LOGO_TYPES.has(type)) return undefined;
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > CUSTOMER_LOGO_MAX_BYTES) return undefined;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > CUSTOMER_LOGO_MAX_BYTES ? undefined : bytes;
  } catch {
    return undefined;
  }
}

/// Human-typable export id that ties a PDF to its export log row.
export function newExportId(): string {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `EX-${stamp}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function renderPdf(doc: ReactElement<DocumentProps>): Promise<{
  bytes: Buffer;
  checksum: string;
}> {
  const bytes = await renderToBuffer(doc);
  return { bytes, checksum: createHash("sha256").update(bytes).digest("hex") };
}
