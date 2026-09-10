import Link from "next/link";
import clsx from "clsx";
import type { QuoteStatus } from "@prisma/client";
import { requireTenant } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/quotes";
import { QuoteTable } from "@/components/quote-table";

export const dynamic = "force-dynamic";

const STATUSES = Object.keys(STATUS_LABEL) as QuoteStatus[];

function isStatus(value: string | undefined): value is QuoteStatus {
  return value !== undefined && STATUSES.includes(value as QuoteStatus);
}

function href(scope: "mine" | "all", status?: QuoteStatus): string {
  const params = new URLSearchParams();
  if (scope === "all") params.set("scope", "all");
  if (status) params.set("status", status);
  const query = params.toString();
  return query ? `/quotes?${query}` : "/quotes";
}

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; status?: string }>;
}) {
  const { scope: rawScope, status: rawStatus } = await searchParams;
  const scope = rawScope === "all" ? "all" : "mine";
  const status = isStatus(rawStatus) ? rawStatus : undefined;
  const { user, db } = await requireTenant();

  const quotes = await db.quoteRequest.findMany({
    where: {
      ...(scope === "mine" ? { submittedById: user.id } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { submittedBy: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Quotes</p>
        <h1 className="mt-2 text-[32px] leading-9">{scope === "mine" ? "My quotes" : "All quotes"}</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Every exported agreement is saved here as a completed quote, alongside quotes submitted for
          leadership review.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <div className="inline-flex rounded-brand border border-mist p-[2px]" role="group" aria-label="Scope">
          {(["mine", "all"] as const).map((option) => (
            <Link
              key={option}
              href={href(option, status)}
              aria-current={scope === option ? "page" : undefined}
              className={clsx(
                "rounded-brand px-3 py-1.5 text-[13px] font-medium transition",
                scope === option ? "bg-navy text-white" : "text-slate hover:bg-mist hover:text-navy",
              )}
            >
              {option === "mine" ? "My quotes" : "All quotes"}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Status">
          <Link
            href={href(scope)}
            className={clsx(
              "rounded-brand px-2.5 py-1 text-[12px] font-medium",
              status ? "text-slate hover:bg-mist hover:text-navy" : "bg-mist text-navy",
            )}
          >
            Any status
          </Link>
          {STATUSES.map((option) => (
            <Link
              key={option}
              href={href(scope, option)}
              className={clsx(
                "rounded-brand px-2.5 py-1 text-[12px] font-medium",
                status === option ? "bg-mist text-navy" : "text-slate hover:bg-mist hover:text-navy",
              )}
            >
              {STATUS_LABEL[option]}
            </Link>
          ))}
        </div>
      </div>

      {quotes.length ? (
        <QuoteTable quotes={quotes} hrefBase="/quotes" showSubmitter={scope === "all"} />
      ) : (
        <div className="card">
          <p className="text-slate">
            {status || scope === "all" ? "No quotes match this filter." : "No quotes yet."}{" "}
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
