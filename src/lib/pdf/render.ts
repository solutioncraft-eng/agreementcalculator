import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

let logoCache: Buffer | null | undefined;

export async function brandLogo(): Promise<Buffer | undefined> {
  if (logoCache !== undefined) return logoCache ?? undefined;
  try {
    logoCache = await readFile(path.join(process.cwd(), "public", "infinit-logo.png"));
  } catch {
    logoCache = null;
  }
  return logoCache ?? undefined;
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
