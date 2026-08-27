import Link from "next/link";
import { notFound } from "next/navigation";
import { canReview, requireTenant } from "@/lib/auth";
import { forbidden } from "@/lib/http";
import { QuoteDetail } from "@/components/quote-detail";
import { DecisionForm } from "./decision-form";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, db } = await requireTenant();
  if (!canReview(role)) forbidden();

  const quote = await db.quoteRequest.findUnique({
    where: { id },
    include: {
      submittedBy: { select: { name: true, email: true } },
      pricingVersion: { select: { label: true, costBasis: true } },
      reviews: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
    },
  });
  if (!quote) notFound();

  return (
    <div className="space-y-6">
      <Link href="/reviews" className="text-[13px] font-medium text-slate hover:text-orange">
        ← Review queue
      </Link>
      <QuoteDetail quote={quote} db={db} />
      <DecisionForm quoteId={quote.id} status={quote.status} />
    </div>
  );
}
