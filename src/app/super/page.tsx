import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { PRICING_MODELS } from "@/lib/pricing/models";
import { formatUtc } from "@/lib/quotes";
import { CreateTenantForm } from "./create-tenant-form";
import { TenantRow } from "./tenant-row";

export const dynamic = "force-dynamic";

/**
 * Operator dashboard: which workspaces exist, how much they are used and
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

  const models = Object.entries(PRICING_MODELS).map(([key, model]) => ({
    key,
    label: model.label,
    summary: model.summary,
  }));

  const totals = {
    workspaces: tenants.length,
    people: tenants.reduce((sum, t) => sum + t._count.memberships, 0),
    quotes: tenants.reduce((sum, t) => sum + t._count.quoteRequests, 0),
    exports: tenants.reduce((sum, t) => sum + t._count.exports, 0),
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Operator</p>
        <h1 className="mt-2 text-[32px] leading-9">Workspaces</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Every workspace on the product, with the pricing model it adopted and how much it is being used.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Workspaces", totals.workspaces],
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

      <section className="space-y-3">
        {tenants.map((tenant) => {
          const published = tenant.pricingVersions[0];
          return (
            <TenantRow
              key={tenant.id}
              models={models}
              tenant={{
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                status: tenant.status,
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
              }}
            />
          );
        })}
        {tenants.length === 0 ? (
          <p className="card text-slate">No workspaces yet — create the first one below.</p>
        ) : null}
      </section>

      <CreateTenantForm models={models} />
    </div>
  );
}
