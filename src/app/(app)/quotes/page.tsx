import Link from "next/link";
import { prisma } from "@/lib/db";
import { canReview, requireUser } from "@/lib/auth";
import { QuoteTable } from "@/components/quote-table";

export const dynamic = "force-dynamic";

export default async function MyQuotesPage() {
  const user = await requireUser();
  const quotes = await prisma.quoteRequest.findMany({
    where: canReview(user.role) ? {} : { submittedById: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { submittedBy: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Review requests</p>
        <h1 className="mt-2 text-[32px] leading-9">
          {canReview(user.role) ? "All submitted quotes" : "My submitted quotes"}
        </h1>
        <p className="mt-2 max-w-2xl text-slate">
          Only quotes submitted for leadership review are stored. Standard quotes are calculated and
          exported without being saved.
        </p>
      </header>

      {quotes.length ? (
        <QuoteTable quotes={quotes} hrefBase="/quotes" showSubmitter={canReview(user.role)} />
      ) : (
        <div className="card">
          <p className="text-slate">
            Nothing submitted yet.{" "}
            <Link href="/calculator" className="font-semibold text-orange">
              Build an agreement
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
