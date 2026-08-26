import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { canAdminister, canReview, membershipsFor, requireTenant } from "@/lib/auth";
import { accentStyle } from "@/lib/branding";
import { APP_VERSION } from "@/lib/version";
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

  return (
    <div className="min-h-screen" style={accentStyle(tenant.accentColor)}>
      <header className="border-b border-mist bg-white">
        <div className="mx-auto flex max-w-content items-center gap-6 px-6 py-3 md:px-10 lg:px-16">
          <Link href="/calculator" className="shrink-0">
            <TenantLogo logoUrl={tenant.logoUrl} name={tenant.name} />
          </Link>
          <nav className="flex flex-1 items-center gap-1">
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
          <div className="flex items-center gap-4 text-right">
            {memberships.length > 1 ? (
              <WorkspaceSwitcher memberships={memberships} activeTenantId={tenant.id} />
            ) : null}
            <div className="hidden sm:block">
              <p className="text-[13px] font-semibold leading-tight text-navy">{user.name}</p>
              <p className="font-mono text-[11px] uppercase tracking-eyebrow text-slate">{role}</p>
            </div>
            <Link href="/account/password" className="text-[13px] font-medium text-slate hover:text-orange">
              Password
            </Link>
            <form action={logout}>
              <button type="submit" className="text-[13px] font-medium text-slate hover:text-orange">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

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
