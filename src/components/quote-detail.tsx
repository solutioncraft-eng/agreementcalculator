import clsx from "clsx";
import type { PricingVersion, QuoteRequest, QuoteReview, User } from "@prisma/client";
import { money, moneyRounded } from "@/lib/pricing/engine";
import { calculate } from "@/lib/pricing/models";
import { getConfigForVersion } from "@/lib/pricing/config";
import type { TenantDb } from "@/lib/db";
import {
  STATUS_CLASS,
  STATUS_LABEL,
  TRIGGER_LABEL,
  formatUtc,
  quoteInputs,
  quoteTierName,
  storedTier,
  storedTiers,
} from "@/lib/quotes";

const ACTION_LABEL: Record<string, string> = {
  SUBMITTED: "submitted for review",
  RESUBMITTED: "resubmitted",
  APPROVED: "approved",
  CHANGES_REQUESTED: "requested changes",
  DENIED: "denied",
  WITHDRAWN: "withdrew",
  COMMENTED: "commented",
};

export type QuoteWithRelations = QuoteRequest & {
  submittedBy: Pick<User, "name" | "email">;
  pricingVersion: Pick<PricingVersion, "label" | "costBasis">;
  reviews: (QuoteReview & { actor: Pick<User, "name"> })[];
};

export async function QuoteDetail({ quote, db }: { quote: QuoteWithRelations; db: TenantDb }) {
  const config = await getConfigForVersion(db, quote.pricingVersionId);
  const inputs = quoteInputs(quote);
  const result = config ? calculate(config, inputs) : null;
  const tier = result?.tiers.find((t) => t.key === quote.requestedTierKey);
  const requested = storedTier(quote);
  const tierLabel = quoteTierName(quote);
  const alternatives = storedTiers(quote).filter((t) => t.key !== quote.requestedTierKey);
  const storedRate = requested?.rate ?? 0;
  const storedPerUser = requested?.perUser ?? 0;

  return (
    <div className="space-y-6">
      <header className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{quote.ref}</p>
            <h1 className="mt-2 text-[30px] leading-9">{quote.clientName}</h1>
            <p className="mt-1 text-[14px] text-slate">
              {tierLabel} · submitted by {quote.submittedBy.name} ·{" "}
              {formatUtc(quote.createdAt)}
            </p>
          </div>
          <div className="text-right">
            <span
              className={clsx(
                "inline-block rounded-brand px-3 py-1 font-display text-[12px] font-bold uppercase tracking-eyebrow",
                STATUS_CLASS[quote.status],
              )}
            >
              {STATUS_LABEL[quote.status]}
            </span>
            <p className="mt-3 font-display text-[30px] font-bold leading-none text-navy">
              {moneyRounded(storedRate)}
            </p>
            <p className="text-[13px] text-slate">{money(storedPerUser)} per user / month</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-mist pt-5 text-[14px] sm:grid-cols-4">
          <Stat label="Users" value={String(quote.users)} />
          <Stat label="Devices" value={String(quote.devices)} />
          <Stat label="Locations" value={String(quote.locations)} />
          <Stat label="Bundle" value={result?.bundle.label ?? quote.bundleKey} />
          {config?.model === "MARKUP_MULTIPLE" ? (
            <Stat label="Markup multiple" value={`${quote.markupMultiple.toNumber()}×`} />
          ) : (
            <>
              <Stat label="Service gross margin" value={`${quote.sgmPct.toNumber()}%`} />
              <Stat label="Add-on multiplier" value={`${quote.addonMultiplier.toNumber()}×`} />
            </>
          )}
          <Stat label="Per-user floor" value={money(quote.perUserFloor.toNumber())} />
          <Stat
            label="Pricing version"
            value={`${quote.pricingVersion.label} · ${quote.pricingVersion.costBasis}`}
          />
        </dl>
      </header>

      {quote.triggers.length ? (
        <section className="rounded-brand border border-orange bg-orange/5 p-5">
          <p className="eyebrow">Why this needs approval</p>
          <ul className="mt-3 space-y-1 text-[14px]">
            {(result?.triggers ?? []).length
              ? result!.triggers.map((t) => (
                  <li key={t.code} className="flex gap-2">
                    <span className="text-orange">▸</span>
                    <span>{t.message}</span>
                  </li>
                ))
              : quote.triggers.map((code) => (
                  <li key={code} className="flex gap-2">
                    <span className="text-orange">▸</span>
                    <span>{TRIGGER_LABEL[code] ?? code}</span>
                  </li>
                ))}
          </ul>
        </section>
      ) : null}

      {result && tier ? (
        <section className="card">
          <h2 className="text-[18px]">Cost build — {tierLabel}</h2>
          <dl className="mt-4 space-y-2 text-[14px]">
            <Row label="Monthly tool cost" value={money(tier.toolCost)} />
            {config?.model === "COST_PLUS" ? (
              <Row
                label={`Imputed labor (${config.settings.laborMultiplier}× tool)`}
                value={money(tier.costFloor - tier.toolCost)}
                muted
              />
            ) : null}
            <Row label="Hard cost floor" value={money(tier.costFloor)} strong />
            <Row
              label={
                config?.model === "COST_PLUS"
                  ? `Standard rate at ${result.split.sgmPct}% SGM`
                  : `Standard rate at ${quote.markupMultiple.toNumber()}× markup`
              }
              value={money(tier.standardRate)}
            />
            {tier.discount > 0 ? (
              <Row
                label={`${result.bundle.label} discount${tier.discountCappedAtCost ? " (capped at cost)" : ""}`}
                value={`-${money(tier.discount)}`}
              />
            ) : null}
            <Row label="Agreement rate" value={money(tier.headlineRate)} strong />
            {alternatives.map((alternative) => (
              <Row
                key={alternative.key}
                label={`Alternative offering — ${alternative.label}`}
                value={money(alternative.rate)}
                muted
              />
            ))}
          </dl>
        </section>
      ) : null}

      {quote.notes ? (
        <section className="card">
          <h2 className="text-[18px]">Account manager notes</h2>
          <p className="mt-3 whitespace-pre-wrap text-[14px]">{quote.notes}</p>
        </section>
      ) : null}

      <section className="card">
        <h2 className="text-[18px]">Review history</h2>
        <ol className="mt-4 space-y-4">
          {quote.reviews.map((review) => (
            <li key={review.id} className="border-l-2 border-mist pl-4">
              <p className="text-[14px]">
                <span className="font-semibold text-navy">{review.actor.name}</span>{" "}
                <span className="text-slate">
                  {ACTION_LABEL[review.action] ?? review.action.toLowerCase()}
                </span>
              </p>
              <p className="font-mono text-[11px] text-slate">{formatUtc(review.createdAt)}</p>
              {review.comment ? (
                <p className="mt-2 whitespace-pre-wrap rounded-brand bg-paper px-3 py-2 text-[14px]">
                  {review.comment}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1 font-display text-[17px] font-bold text-navy">{value}</dd>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex justify-between",
        muted && "text-slate",
        strong && "border-t border-mist pt-2 font-display font-bold text-navy",
      )}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
