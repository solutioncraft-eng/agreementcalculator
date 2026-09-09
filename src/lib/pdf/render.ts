import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

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

const RASTER_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);
const MAX_CUSTOMER_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * A customer's logo (MSP Cadence's public `client-logos` bucket). Unlike the
 * workspace logo there is no product-mark fallback: no logo means the header
 * simply shows the name. react-pdf renders PNG/JPEG only, so anything else
 * (SVG, WebP, ICO) is dropped rather than failing the export.
 */
export async function customerLogo(logoUrl: string | null | undefined): Promise<Buffer | undefined> {
  if (!logoUrl) return undefined;
  try {
    const response = await fetch(logoUrl, { cache: "force-cache" });
    if (!response.ok) return undefined;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!RASTER_TYPES.has(type)) return undefined;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.byteLength <= MAX_CUSTOMER_LOGO_BYTES ? bytes : undefined;
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
