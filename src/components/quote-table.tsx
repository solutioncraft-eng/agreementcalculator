import Link from "next/link";
import clsx from "clsx";
import type { QuoteRequest, Tenant } from "@prisma/client";
import { moneyRounded } from "@/lib/pricing/engine";
import { STATUS_CLASS, STATUS_LABEL, formatUtc, tierName } from "@/lib/quotes";

type Row = QuoteRequest & { submittedBy?: { name: string } };

export function QuoteTable({
  quotes,
  tenant,
  hrefBase,
  showSubmitter,
}: {
  quotes: Row[];
  tenant: Pick<Tenant, "advantageLabel" | "pinnacleLabel">;
  hrefBase: string;
  showSubmitter?: boolean;
}) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-navy text-left font-display text-[11px] uppercase tracking-eyebrow text-slate">
            <th className="px-5 py-3">Reference</th>
            <th className="px-5 py-3">Client</th>
            {showSubmitter ? <th className="px-5 py-3">Submitted by</th> : null}
            <th className="px-5 py-3">Tier</th>
            <th className="px-5 py-3 text-right">Rate</th>
            <th className="px-5 py-3">Flags</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((quote) => {
            const rate = (
              quote.requestedTier === "PINNACLE" ? quote.pinnacleRate : quote.advantageRate
            ).toNumber();
            return (
              <tr key={quote.id} className="border-b border-mist last:border-0 hover:bg-paper">
                <td className="px-5 py-3 font-mono text-[12px]">
                  <Link href={`${hrefBase}/${quote.id}`} className="font-semibold text-orange">
                    {quote.ref}
                  </Link>
                </td>
                <td className="px-5 py-3 font-medium text-navy">{quote.clientName}</td>
                {showSubmitter ? (
                  <td className="px-5 py-3 text-slate">{quote.submittedBy?.name ?? "—"}</td>
                ) : null}
                <td className="px-5 py-3">{tierName(tenant, quote.requestedTier)}</td>
                <td className="px-5 py-3 text-right font-medium">{moneyRounded(rate)}</td>
                <td className="px-5 py-3 text-slate">{quote.triggers.length}</td>
                <td className="px-5 py-3">
                  <span
                    className={clsx(
                      "inline-block rounded-brand px-2 py-1 font-display text-[10px] font-bold uppercase tracking-eyebrow",
                      STATUS_CLASS[quote.status],
                    )}
                  >
                    {STATUS_LABEL[quote.status]}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-[11px] text-slate">
                  {formatUtc(quote.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
