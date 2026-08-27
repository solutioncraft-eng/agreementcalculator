import { redirect } from "next/navigation";
import { getTenantSession, membershipsFor, requireUser } from "@/lib/auth";
import { workspaceAccess } from "@/lib/billing";
import { startCheckout } from "@/lib/billing-actions";
import { formatUtc } from "@/lib/quotes";
import { stripeConfigured } from "@/lib/stripe";
import { PRICE_PER_MONTH } from "@/lib/trial";
import { logout, switchWorkspace } from "../(app)/actions";

export const dynamic = "force-dynamic";

/**
 * Where a workspace lands once it has nothing left to run on — trial over,
 * subscription cancelled, or a failed payment past its grace window. Read from
 * the ungated session on purpose: `requireTenant` sends people here, so gating
 * this page the same way would loop.
 */
export default async function TrialEndedPage() {
  const user = await requireUser();
  const session = await getTenantSession();
  if (!session) redirect("/workspaces");

  const { tenant, role } = session;
  const access = workspaceAccess(tenant);
  if (access.allowed) redirect("/calculator");

  const isAdmin = role === "ADMIN";
  const canPay = isAdmin && stripeConfigured;
  const others = (await membershipsFor(user.id)).filter((m) => m.tenantId !== tenant.id);

  const heading =
    access.reason === "PAYMENT_FAILED"
      ? `${tenant.name} is paused for non-payment`
      : access.reason === "SUBSCRIPTION_ENDED"
        ? `${tenant.name}'s subscription has ended`
        : `${tenant.name}'s trial has finished`;

  return (
    <main className="mx-auto max-w-[620px] px-6 py-16">
      <p className="eyebrow">
        {access.reason === "PAYMENT_FAILED" ? "Payment failed" : "Subscription needed"}
      </p>
      <h1 className="mt-2 text-[32px] leading-9">{heading}</h1>
      <p className="mt-3 text-slate">
        {access.reason === "PAYMENT_FAILED"
          ? "Stripe could not take payment, and the retry window has run out."
          : `The trial ran until ${access.deadline ? formatUtc(access.deadline) : "—"}.`}{" "}
        Nothing has been deleted: your COGS catalogue, pricing versions, quotes in review and audit log are
        all still here and come back the moment {tenant.name} is paying again.
      </p>

      <div className="card mt-8">
        <p className="stat text-[36px] leading-none">${PRICE_PER_MONTH}</p>
        <p className="mt-1 font-display text-[13px] font-bold uppercase tracking-eyebrow text-slate">
          per month, per company
        </p>

        {canPay ? (
          <form action={startCheckout} className="mt-5">
            <button type="submit" className="btn-primary">
              {access.reason === "PAYMENT_FAILED" ? "Fix payment" : "Subscribe now"}
            </button>
            <p className="mt-2 text-[13px] text-slate">
              Card details are entered on Stripe. {tenant.name} comes back as soon as the payment clears.
            </p>
          </form>
        ) : (
          <p className="mt-4 text-[15px] text-slate">
            {isAdmin ? (
              <>
                Write to{" "}
                <a href="mailto:hello@agreementcalculator.com" className="font-medium text-orange">
                  hello@agreementcalculator.com
                </a>{" "}
                and we will switch {tenant.name} on.
              </>
            ) : (
              <>An administrator of {tenant.name} can subscribe from their billing page.</>
            )}
          </p>
        )}
      </div>

      {others.length > 0 ? (
        <div className="mt-8">
          <p className="label">Your other workspaces</p>
          <ul className="mt-2 space-y-2">
            {others.map((membership) => (
              <li key={membership.tenantId}>
                <form action={switchWorkspace}>
                  <input type="hidden" name="tenantId" value={membership.tenantId} />
                  <button type="submit" className="btn-ghost btn-sm">
                    Open {membership.name}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form action={logout} className="mt-8">
        <button type="submit" className="text-[13px] font-medium text-slate hover:text-orange">
          Sign out
        </button>
      </form>
    </main>
  );
}
