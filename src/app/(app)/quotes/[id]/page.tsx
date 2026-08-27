import Link from "next/link";
import { notFound } from "next/navigation";
import { canReview, requireTenant } from "@/lib/auth";
import { QuoteDetail } from "@/components/quote-detail";
import { QuoteActions } from "./quote-actions";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, role, db } = await requireTenant();
  const quote = await db.quoteRequest.findUnique({
    where: { id },
    include: {
      submittedBy: { select: { name: true, email: true } },
      pricingVersion: { select: { label: true, costBasis: true } },
      reviews: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
    },
  });
  if (!quote) notFound();
  if (quote.submittedById !== user.id && !canReview(role)) notFound();

  const exports = await db.exportRecord.findMany({
    where: { quoteId: quote.id },
    orderBy: { createdAt: "desc" },
    include: { exportedBy: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <Link href="/quotes" className="text-[13px] font-medium text-slate hover:text-orange">
        ← All quotes
      </Link>
      <QuoteDetail quote={quote} db={db} />
      <QuoteActions
        quoteId={quote.id}
        status={quote.status}
        tierKey={quote.requestedTierKey}
        clientName={quote.clientName}
        canWithdraw={quote.submittedById === user.id || role === "ADMIN"}
        exports={exports.map((record) => ({
          exportId: record.exportId,
          docType: record.docType,
          by: record.exportedBy.name,
          at: record.createdAt.toISOString(),
          checksum: record.checksum,
        }))}
      />
    </div>
  );
}
