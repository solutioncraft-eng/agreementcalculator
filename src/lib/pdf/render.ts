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
