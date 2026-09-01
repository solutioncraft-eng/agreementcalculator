import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { PRICING_MODELS } from "@/lib/pricing/models";
import { formatUtc } from "@/lib/quotes";
import { describeAccess, workspaceAccess } from "@/lib/billing";
import { CreateTenantForm } from "./create-tenant-form";
import { PeopleDirectory } from "./people-directory";
import { TenantList } from "./tenant-list";

export const dynamic = "force-dynamic";

/**
 * Operator dashboard: which tenants exist, how much they are used and
 * whether they are healthy. Deliberately built from counts and timestamps —
 * quote contents and COGS costs are a tenant's confidential pricing and are
 * never read here.
 */
export default async function SuperPage() {
  await requireSuperAdmin();

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { memberships: true, quoteRequests: true, exports: true } },
      pricingVersions: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 1,
        select: { label: true, model: true, publishedAt: true },
      },
    },
  });

  const lastEvents = await prisma.auditEvent.groupBy({
    by: ["tenantId"],
    _max: { createdAt: true },
  });
  const lastActivity = new Map(
    lastEvents.filter((row) => row.tenantId).map((row) => [row.tenantId as string, row._max.createdAt]),
  );

  // Every account on the product, whichever tenants they belong to — an
  // account with no membership is an invitation that was never completed, and is
  // exactly the kind of thing an operator is asked to fix.
  const accounts = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      isSuperAdmin: true,
      active: true,
      mustReset: true,
      lastLoginAt: true,
      createdAt: true,
      _count: {
        select: {
          quoteRequests: true,
          reviews: true,
          exports: true,
          createdVersions: true,
          publishedVersion: true,
        },
      },
      memberships: {
        orderBy: { createdAt: "asc" },
        select: { role: true, tenant: { select: { name: true, slug: true, status: true } } },
      },
    },
  });

  const people = accounts.map((account) => ({
    id: account.id,
    email: account.email,
    name: account.name,
    isSuperAdmin: account.isSuperAdmin,
    active: account.active,
    // Attribution is kept forever, so an account that has produced anything can
    // only be deactivated — the delete action refuses it too.
    hasHistory:
      account._count.quoteRequests +
        account._count.reviews +
        account._count.exports +
        account._count.createdVersions +
        account._count.publishedVersion >
      0,
    mustReset: account.mustReset,
    lastLogin: account.lastLoginAt ? formatUtc(account.lastLoginAt) : null,
    createdAt: formatUtc(account.createdAt),
    tenants: account.memberships.map((membership) => ({
      name: membership.tenant.name,
      slug: membership.tenant.slug,
      role: membership.role,
      suspended: membership.tenant.status === "SUSPENDED",
    })),
  }));

  const rows = tenants.map((tenant) => {
    const published = tenant.pricingVersions[0];
    const access = workspaceAccess(tenant);
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      billing: access.deadline
        ? `${describeAccess(access)} · ${formatUtc(access.deadline)}`
        : describeAccess(access),
      compReason: tenant.compReason,
      hasSubscription: Boolean(tenant.stripeSubscriptionId),
      pricingModel: tenant.pricingModel,
      pricingModelLabel: PRICING_MODELS[tenant.pricingModel].label,
      createdAt: formatUtc(tenant.createdAt),
      people: tenant._count.memberships,
      quotes: tenant._count.quoteRequests,
      exports: tenant._count.exports,
      publishedVersion: published
        ? `${published.label} · published ${published.publishedAt ? formatUtc(published.publishedAt) : "—"}`
        : null,
      lastActivity: lastActivity.get(tenant.id)
        ? formatUtc(lastActivity.get(tenant.id) as Date)
        : null,
    };
  });

  const models = Object.entries(PRICING_MODELS).map(([key, model]) => ({
    key,
    label: model.label,
    summary: model.summary,
  }));

  const totals = {
    tenants: tenants.length,
    people: tenants.reduce((sum, t) => sum + t._count.memberships, 0),
    quotes: tenants.reduce((sum, t) => sum + t._count.quoteRequests, 0),
    exports: tenants.reduce((sum, t) => sum + t._count.exports, 0),
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Operator</p>
        <h1 className="mt-2 text-[32px] leading-9">Tenants</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Every tenant on the product, with the pricing model it adopted and how much it is being used.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Tenants", totals.tenants],
          ["People", totals.people],
          ["Quotes in review", totals.quotes],
          ["PDF exports", totals.exports],
        ].map(([label, value]) => (
          <div key={String(label)} className="card">
            <p className="font-display text-[11px] font-bold uppercase tracking-eyebrow text-slate">
              {label}
            </p>
            <p className="stat mt-1 text-[28px]">{value}</p>
          </div>
        ))}
      </div>

      <TenantList models={models} tenants={rows} />

      <PeopleDirectory people={people} />

      <CreateTenantForm models={models} />
    </div>
  );
}
