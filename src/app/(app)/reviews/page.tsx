import { canReview, requireTenant } from "@/lib/auth";
import { forbidden } from "@/lib/http";
import { QuoteTable } from "@/components/quote-table";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const { role, tenant, db } = await requireTenant();
  if (!canReview(role)) forbidden();

  const [pending, decided] = await Promise.all([
    db.quoteRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { submittedBy: { select: { name: true } } },
    }),
    db.quoteRequest.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { submittedBy: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Leadership review</p>
        <h1 className="mt-2 text-[32px] leading-9">
          {pending.length ? `${pending.length} quote${pending.length === 1 ? "" : "s"} awaiting you` : "Nothing awaiting review"}
        </h1>
        <p className="mt-2 max-w-2xl text-slate">
          Quotes appear here when pricing falls outside policy. Approve, recommend changes, or deny — the
          account manager is notified and export stays locked until approval.
        </p>
      </header>

      {pending.length ? <QuoteTable quotes={pending} tenant={tenant} hrefBase="/reviews" showSubmitter /> : null}

      {decided.length ? (
        <section className="space-y-3">
          <h2 className="text-[20px]">Decided</h2>
          <QuoteTable quotes={decided} tenant={tenant} hrefBase="/reviews" showSubmitter />
        </section>
      ) : null}
    </div>
  );
}
