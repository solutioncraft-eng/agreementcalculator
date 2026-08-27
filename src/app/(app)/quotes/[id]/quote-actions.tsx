"use client";

import { useActionState, useState } from "react";
import type { QuoteStatus } from "@prisma/client";
import { downloadExport } from "@/lib/export-client";
import { withdraw, type DecisionState } from "../../reviews/actions";

interface ExportRow {
  exportId: string;
  docType: string;
  by: string;
  at: string;
  checksum: string | null;
}

export function QuoteActions({
  quoteId,
  status,
  tierKey,
  clientName,
  canWithdraw,
  exports,
}: {
  quoteId: string;
  status: QuoteStatus;
  tierKey: string;
  clientName: string;
  canWithdraw: boolean;
  exports: ExportRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [state, withdrawAction, withdrawing] = useActionState<DecisionState, FormData>(withdraw, {});
  const approved = status === "APPROVED";

  async function runExport(docType: "QUOTE" | "COGS") {
    setError(null);
    setBusy(docType);
    const message = await downloadExport({ docType, tierKey, clientName, quoteId });
    setBusy(null);
    if (message) setError(message);
  }

  return (
    <section className="card">
      <h2 className="text-[18px]">Documents</h2>
      {approved ? (
        <p className="mt-2 text-[14px] text-slate">
          Approved — exports are unlocked and stamped with this quote reference.
        </p>
      ) : (
        <p className="mt-2 text-[14px] text-slate">
          Export stays locked until a leader approves this quote.
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-4 rounded-brand bg-orange/10 px-3 py-2 text-[13px] text-orange-dark">
          {error}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="mt-4 rounded-brand bg-orange/10 px-3 py-2 text-[13px] text-orange-dark">
          {state.error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={!approved || busy !== null}
          onClick={() => runExport("QUOTE")}
        >
          {busy === "QUOTE" ? "Generating…" : "Export agreement PDF"}
        </button>
        <button
          type="button"
          className="btn-navy"
          disabled={!approved || busy !== null}
          onClick={() => runExport("COGS")}
        >
          {busy === "COGS" ? "Generating…" : "Export internal COGS PDF"}
        </button>
        {canWithdraw && (status === "PENDING" || status === "CHANGES_REQUESTED") ? (
          <form action={withdrawAction}>
            <input type="hidden" name="quoteId" value={quoteId} />
            <button type="submit" className="btn-ghost" disabled={withdrawing}>
              {withdrawing ? "Withdrawing…" : "Withdraw request"}
            </button>
          </form>
        ) : null}
      </div>

      {exports.length ? (
        <div className="mt-6 border-t border-mist pt-4">
          <h3 className="label">Export log</h3>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-slate">
            {exports.map((row) => (
              <li key={row.exportId}>
                {row.exportId} · {row.docType} · {row.by} · {row.at.slice(0, 16).replace("T", " ")} UTC
                {row.checksum ? ` · sha256 ${row.checksum.slice(0, 16)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
