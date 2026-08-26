import { redirect } from "next/navigation";
import { getTenantSession, membershipsFor, requireUser } from "@/lib/auth";
import { formatUtc } from "@/lib/quotes";
import { PRICE_PER_MONTH, trialInfo } from "@/lib/trial";
import { logout, switchWorkspace } from "../(app)/actions";

export const dynamic = "force-dynamic";

/**
 * Where a workspace lands once its trial has run out. Read from the ungated
 * session on purpose: `requireTenant` sends people here, so gating this page
 * the same way would loop.
 */
export default async function TrialEndedPage() {
  const user = await requireUser();
  const session = await getTenantSession();
  if (!session) redirect("/workspaces");

  const { tenant } = session;
  const trial = trialInfo(tenant);
  if (!trial.expired) redirect("/calculator");

  const others = (await membershipsFor(user.id)).filter((m) => m.tenantId !== tenant.id);

  return (
    <main className="mx-auto max-w-[620px] px-6 py-16">
      <p className="eyebrow">Trial ended</p>
      <h1 className="mt-2 text-[32px] leading-9">{tenant.name}&apos;s trial has finished</h1>
      <p className="mt-3 text-slate">
        The trial ran until {trial.endsAt ? formatUtc(trial.endsAt) : "—"}. Nothing has been deleted: your
        COGS catalogue, pricing versions, quotes in review and audit log are all still here and come back the
        moment the workspace is activated.
      </p>

      <div className="card mt-8">
        <p className="stat text-[36px] leading-none">${PRICE_PER_MONTH}</p>
        <p className="mt-1 font-display text-[13px] font-bold uppercase tracking-eyebrow text-slate">
          per month, per company
        </p>
        <p className="mt-4 text-[15px] text-slate">
          Reply to your signup email, or write to{" "}
          <a href="mailto:hello@agreementcalculator.com" className="font-medium text-orange">
            hello@agreementcalculator.com
          </a>
          , and we will switch {tenant.name} on.
        </p>
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
