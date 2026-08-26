import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { canReview, requireUser } from "@/lib/auth";
import { QuoteDetail } from "@/components/quote-detail";
import { QuoteActions } from "./quote-actions";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const quote = await prisma.quoteRequest.findUnique({
    where: { id },
    include: {
      submittedBy: { select: { name: true, email: true } },
      pricingVersion: { select: { label: true, costBasis: true } },
      reviews: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true, role: true } } } },
    },
  });
  if (!quote) notFound();
  if (quote.submittedById !== user.id && !canReview(user.role)) notFound();

  const exports = await prisma.exportRecord.findMany({
    where: { quoteId: quote.id },
    orderBy: { createdAt: "desc" },
    include: { exportedBy: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <Link href="/quotes" className="text-[13px] font-medium text-slate hover:text-orange">
        ← All quotes
      </Link>
      <QuoteDetail quote={quote} />
      <QuoteActions
        quoteId={quote.id}
        status={quote.status}
        tier={quote.requestedTier}
        clientName={quote.clientName}
        canWithdraw={quote.submittedById === user.id || user.role === "ADMIN"}
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
