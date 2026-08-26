import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { formatUtc } from "@/lib/quotes";
import { createDraft } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-orange-tint/25 text-orange-dark",
  PUBLISHED: "bg-navy text-white",
  ARCHIVED: "bg-mist text-slate",
};

export default async function PricingVersionsPage() {
  await requireRole("ADMIN");
  const versions = await prisma.pricingVersion.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      publishedBy: { select: { name: true } },
      _count: { select: { cogsItems: true, quoteRequests: true, exports: true } },
    },
  });
  const hasDraft = versions.some((v) => v.status === "DRAFT");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 className="mt-2 text-[32px] leading-9">Pricing versions</h1>
          <p className="mt-2 max-w-2xl text-slate">
            COGS items, unit allocation and the pricing model live inside a version. Publishing freezes it:
            every quote and PDF points at the exact version it was produced with.
          </p>
        </div>
        <form action={createDraft}>
          <button type="submit" className="btn-primary">
            {hasDraft ? "Open the working draft" : "Create a new draft"}
          </button>
        </form>
      </header>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-navy text-left font-display text-[11px] uppercase tracking-eyebrow text-slate">
              <th className="px-5 py-3">Version</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Cost basis</th>
              <th className="px-5 py-3 text-right">Items</th>
              <th className="px-5 py-3 text-right">Quotes</th>
              <th className="px-5 py-3 text-right">Exports</th>
              <th className="px-5 py-3">Published</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr key={version.id} className="border-b border-mist last:border-0 hover:bg-paper">
                <td className="px-5 py-3">
                  <Link href={`/admin/pricing/${version.id}`} className="font-semibold text-orange">
                    {version.label}
                  </Link>
                  <span className="block text-[12px] text-slate">by {version.createdBy.name}</span>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={clsx(
                      "inline-block rounded-brand px-2 py-1 font-display text-[10px] font-bold uppercase tracking-eyebrow",
                      STATUS_CLASS[version.status],
                    )}
                  >
                    {version.status}
                  </span>
                </td>
                <td className="px-5 py-3">{version.costBasis}</td>
                <td className="px-5 py-3 text-right">{version._count.cogsItems}</td>
                <td className="px-5 py-3 text-right">{version._count.quoteRequests}</td>
                <td className="px-5 py-3 text-right">{version._count.exports}</td>
                <td className="px-5 py-3 font-mono text-[11px] text-slate">
                  {version.publishedAt ? formatUtc(version.publishedAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
