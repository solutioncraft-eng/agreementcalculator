import type { CalcInputs, Tier } from "@/lib/pricing/engine";

export interface ExportRequest {
  docType: "QUOTE" | "COGS";
  tier: Tier;
  clientName: string;
  notes?: string;
  inputs?: CalcInputs;
  quoteId?: string;
}

/**
 * Posts an export request and saves the returned PDF.
 * Resolves to an error message, or null on success.
 */
export async function downloadExport(request: ExportRequest): Promise<string | null> {
  const body = new FormData();
  body.set("payload", JSON.stringify(request));

  const response = await fetch("/api/export", { method: "POST", body });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    return (detail as { error?: string } | null)?.error ?? "The export failed. Try again.";
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "agreement-export.pdf";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return null;
}
