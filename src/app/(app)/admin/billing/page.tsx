import { requireRole } from "@/lib/auth";
import { describeAccess, GRACE_DAYS, workspaceAccess } from "@/lib/billing";
import { startCheckout, openBillingPortal } from "@/lib/billing-actions";
import { formatUtc } from "@/lib/quotes";
import { stripeConfigured, stripeTestMode } from "@/lib/stripe";
import { describeDaysLeft, PRICE_PER_MONTH } from "@/lib/trial";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ subscribed?: string; cancelled?: string; unavailable?: string }>;
}

export default async function BillingPage({ searchParams }: Props) {
  const { tenant } = await requireRole("ADMIN");
  const params = await searchParams;
  const access = workspaceAccess(tenant);
  const subscribed = access.reason === "SUBSCRIBED" || access.reason === "IN_GRACE";
  const comped = access.reason === "COMPLIMENTARY";

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 text-[32px] leading-9">Billing</h1>
        <p className="mt-2 max-w-2xl text-slate">
          {tenant.name} is billed as one company: ${PRICE_PER_MONTH} per month, unlimited people, every
          workspace feature included. Cards are handled by Stripe — this application never sees them.
        </p>
      </header>

      {params.subscribed ? (
        <p className="rounded-brand bg-orange-tint/20 px-3 py-2 text-[13px] text-orange-dark">
          Thank you — Stripe has taken the payment. If the status below still says trial, it is waiting on
          Stripe&apos;s confirmation; reload in a moment.
        </p>
      ) : null}
      {params.cancelled ? (
        <p className="rounded-brand bg-mist px-3 py-2 text-[13px] text-slate">
          Checkout was cancelled — nothing has been charged.
        </p>
      ) : null}
      {params.unavailable ? (
        <p className="rounded-brand bg-mist px-3 py-2 text-[13px] text-slate">
          Card payment is not switched on for this deployment yet. Write to{" "}
          <a href="mailto:hello@agreementcalculator.com" className="font-medium text-orange">
            hello@agreementcalculator.com
          </a>{" "}
          and we will set {tenant.name} up.
        </p>
      ) : null}

      <div className="card">
        <p className="label">Status</p>
        <p className="mt-1 text-[20px] font-semibold text-navy">{describeAccess(access)}</p>

        <dl className="mt-4 space-y-2 text-[15px]">
          {access.reason === "TRIAL" && access.trial.onTrial ? (
            <div className="flex justify-between gap-4">
              <dt className="text-slate">Trial</dt>
              <dd>
                {describeDaysLeft(access.trial.daysLeft)}
                {access.trial.endsAt ? ` — until ${formatUtc(access.trial.endsAt)}` : ""}
              </dd>
            </div>
          ) : null}
          {access.reason === "SUBSCRIBED" && tenant.currentPeriodEnd ? (
            <div className="flex justify-between gap-4">
              <dt className="text-slate">Renews</dt>
              <dd>{formatUtc(tenant.currentPeriodEnd)}</dd>
            </div>
          ) : null}
          {comped && access.deadline ? (
            <div className="flex justify-between gap-4">
              <dt className="text-slate">Complimentary until</dt>
              <dd>{formatUtc(access.deadline)}</dd>
            </div>
          ) : null}
          {access.reason === "IN_GRACE" && access.deadline ? (
            <div className="flex justify-between gap-4">
              <dt className="text-slate">Access until</dt>
              <dd>{formatUtc(access.deadline)}</dd>
            </div>
          ) : null}
        </dl>

        {access.reason === "IN_GRACE" ? (
          <p className="mt-4 rounded-brand bg-orange-tint/20 px-3 py-2 text-[13px] text-orange-dark">
            Stripe could not take the last payment. {tenant.name} keeps working for {GRACE_DAYS} days from the
            first failure while Stripe retries — update the card to clear it.
          </p>
        ) : null}

        {comped ? (
          <p className="mt-4 rounded-brand bg-mist px-3 py-2 text-[13px] text-slate">
            {tenant.name} is complimentary — nothing is charged for it.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {comped ? null : subscribed ? (
            <form action={openBillingPortal}>
              <button type="submit" className="btn-primary">
                Manage billing
              </button>
            </form>
          ) : (
            <form action={startCheckout}>
              <button type="submit" className="btn-primary" disabled={!stripeConfigured}>
                Subscribe — ${PRICE_PER_MONTH}/month
              </button>
            </form>
          )}
        </div>

        {stripeConfigured && stripeTestMode() ? (
          <p className="mt-4 font-mono text-[11px] uppercase tracking-eyebrow text-slate">
            Stripe test mode — no real charge is made
          </p>
        ) : null}
      </div>

      <p className="text-[13px] text-slate">
        Invoices, receipts, card changes and cancellation all live in Stripe&apos;s billing portal. Cancelling
        keeps {tenant.name} readable until the end of the period you have paid for.
      </p>
    </div>
  );
}
