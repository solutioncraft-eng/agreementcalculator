import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { canAdminister, canReview, membershipsFor, requireTenant } from "@/lib/auth";
import { accentStyle } from "@/lib/branding";
import { APP_VERSION } from "@/lib/version";
import { describeDaysLeft, trialInfo } from "@/lib/trial";
import { NavLink } from "@/components/nav-link";
import { TenantLogo } from "@/components/tenant-logo";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { logout } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, tenant, role, db } = await requireTenant();
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mustReset: true },
  });
  if (account?.mustReset) redirect("/account/password");

  const memberships = await membershipsFor(user.id);
  const pendingReviews = canReview(role) ? await db.quoteRequest.count({ where: { status: "PENDING" } }) : 0;
  const myOpen = await db.quoteRequest.count({
    where: { submittedById: user.id, status: { in: ["PENDING", "CHANGES_REQUESTED"] } },
  });
  const trial = trialInfo(tenant);

  return (
    <div className="min-h-screen" style={accentStyle(tenant.accentColor)}>
      <header className="border-b border-mist bg-white">
        {/* Below lg the nav wraps onto its own full-width row and scrolls
            sideways, so the header never widens the document on a phone. */}
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 md:px-10 lg:flex-nowrap lg:px-16">
          <Link href="/calculator" className="shrink-0">
            <TenantLogo logoUrl={tenant.logoUrl} name={tenant.name} />
          </Link>
          <nav className="nav-row order-last flex w-full items-center gap-1 lg:order-none lg:w-auto lg:flex-1 lg:overflow-visible">
            <NavLink href="/calculator">Calculator</NavLink>
            <NavLink href="/quotes" badge={myOpen || undefined}>
              My quotes
            </NavLink>
            {canReview(role) ? (
              <NavLink href="/reviews" badge={pendingReviews || undefined}>
                Reviews
              </NavLink>
            ) : null}
            {canAdminister(role) ? (
              <>
                <NavLink href="/admin/pricing">Pricing</NavLink>
                <NavLink href="/admin/users">People</NavLink>
                <NavLink href="/admin/branding">Branding</NavLink>
                <NavLink href="/admin/audit">Audit log</NavLink>
              </>
            ) : null}
            {user.isSuperAdmin ? <NavLink href="/super">Super-admin</NavLink> : null}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-4 text-right lg:ml-0">
            {memberships.length > 1 ? (
              <WorkspaceSwitcher memberships={memberships} activeTenantId={tenant.id} />
            ) : null}
            <div className="hidden sm:block">
              <p className="text-[13px] font-semibold leading-tight text-navy">{user.name}</p>
              <p className="font-mono text-[11px] uppercase tracking-eyebrow text-slate">{role}</p>
            </div>
            <Link
              href="/account/password"
              className="whitespace-nowrap py-2 text-[13px] font-medium text-slate hover:text-orange"
            >
              Password
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="whitespace-nowrap py-2 text-[13px] font-medium text-slate hover:text-orange"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {trial.onTrial ? (
        <div className="border-b border-mist bg-orange-tint/20 px-6 py-2 text-center text-[13px] text-navy">
          <span className="font-display text-[11px] font-bold uppercase tracking-eyebrow">Trial</span>{" "}
          {describeDaysLeft(trial.daysLeft)} · everything you set up here is kept when {tenant.name} is
          activated
        </div>
      ) : null}

      <div className="bg-navy px-6 py-2 text-center font-display text-[11px] font-bold uppercase tracking-eyebrow text-mist">
        Internal use only · tool costs and margins are confidential
      </div>

      <main className="mx-auto max-w-content px-6 py-8 md:px-10 lg:px-16">{children}</main>

      <footer className="mx-auto max-w-content px-6 pb-10 text-[12px] text-slate md:px-10 lg:px-16">
        {tenant.name} · Agreement Calculator {APP_VERSION} · Quarterly true-up recommended · Mailbox count
        assumed equal to user count
      </footer>
    </div>
  );
}
