import Link from "next/link";
import clsx from "clsx";
import { requireRole } from "@/lib/auth";
import { formatUtc } from "@/lib/quotes";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 75;

const TONE: Record<string, string> = {
  LOGIN_FAILED: "text-orange-dark",
  PDF_EXPORT_BLOCKED: "text-orange-dark",
  VERSION_PUBLISHED: "text-navy",
  QUOTE_APPROVED: "text-navy",
  QUOTE_DENIED: "text-orange-dark",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  const { db } = await requireRole("ADMIN");
  const { page, action } = await searchParams;
  const current = Math.max(1, Number(page ?? 1) || 1);

  const where = action ? { action } : {};
  const [events, total, exports] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (current - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
    db.auditEvent.count({ where }),
    db.exportRecord.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        exportedBy: { select: { name: true } },
        pricingVersion: { select: { label: true } },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 text-[32px] leading-9">Audit log</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Sign-ins, pricing changes, review decisions and every PDF export. Calculator results are never
          stored — only the actions taken and, for exports, the inputs needed to reproduce the document.
        </p>
      </header>

      <section className="card overflow-x-auto p-0">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-navy text-left font-display text-[11px] uppercase tracking-eyebrow text-slate">
              <th className="px-5 py-3">When</th>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">Who</th>
              <th className="px-5 py-3">Detail</th>
              <th className="px-5 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b border-mist last:border-0">
                <td className="whitespace-nowrap px-5 py-2 font-mono text-[11px] text-slate">
                  {formatUtc(event.createdAt)}
                </td>
                <td className={clsx("px-5 py-2 font-mono text-[11px] font-medium", TONE[event.action] ?? "text-slate")}>
                  {event.action}
                </td>
                <td className="px-5 py-2">{event.actor?.name ?? event.actorEmail ?? "—"}</td>
                <td className="px-5 py-2">{event.summary}</td>
                <td className="px-5 py-2 font-mono text-[11px] text-slate">{event.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="flex items-center gap-4 text-[13px]">
        {current > 1 ? (
          <Link href={`/admin/audit?page=${current - 1}`} className="btn-ghost btn-sm">
            ← Newer
          </Link>
        ) : null}
        <span className="text-slate">
          Page {current} of {pages} · {total} events
        </span>
        {current < pages ? (
          <Link href={`/admin/audit?page=${current + 1}`} className="btn-ghost btn-sm">
            Older →
          </Link>
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-[20px]">Recent PDF exports</h2>
        <p className="max-w-2xl text-slate">
          The stamp printed on a PDF (export ID, UTC timestamp, app build, pricing version) resolves to a row
          here, with a SHA-256 of the exact bytes that were generated.
        </p>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-navy text-left font-display text-[11px] uppercase tracking-eyebrow text-slate">
                <th className="px-5 py-3">Export ID</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">By</th>
                <th className="px-5 py-3">Pricing</th>
                <th className="px-5 py-3">Approval</th>
                <th className="px-5 py-3">Checksum</th>
                <th className="px-5 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((record) => (
                <tr key={record.id} className="border-b border-mist last:border-0">
                  <td className="px-5 py-2 font-mono text-[11px] font-medium text-navy">{record.exportId}</td>
                  <td className="px-5 py-2">{record.docType}</td>
                  <td className="px-5 py-2">{record.clientName ?? "—"}</td>
                  <td className="px-5 py-2">{record.exportedBy.name}</td>
                  <td className="px-5 py-2">{record.pricingVersion.label}</td>
                  <td className="px-5 py-2">{record.approvalState}</td>
                  <td className="px-5 py-2 font-mono text-[11px] text-slate">
                    {record.checksum?.slice(0, 16) ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2 font-mono text-[11px] text-slate">
                    {formatUtc(record.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
