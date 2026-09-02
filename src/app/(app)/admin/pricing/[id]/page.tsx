import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { PRICING_MODELS, settingsRecord } from "@/lib/pricing/models";
import { VersionEditor } from "./version-editor";

export const dynamic = "force-dynamic";

export default async function PricingVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireRole("ADMIN");

  const version = await db.pricingVersion.findUnique({
    where: { id },
    include: {
      serviceTiers: { orderBy: { sortOrder: "asc" } },
      cogsItems: { orderBy: { sortOrder: "asc" }, include: { tiers: true } },
      bundles: { orderBy: { sortOrder: "asc" } },
      createdBy: { select: { name: true } },
      publishedBy: { select: { name: true } },
    },
  });
  if (!version) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin/pricing" className="text-[13px] font-medium text-slate hover:text-orange">
        ← Pricing versions
      </Link>
      <VersionEditor
        version={{
          id: version.id,
          label: version.label,
          status: version.status,
          costBasis: version.costBasis,
          notes: version.notes,
          model: version.model,
          modelLabel: PRICING_MODELS[version.model].label,
          settings: settingsRecord(version.model, version.settings),
          publishedAt: version.publishedAt?.toISOString() ?? null,
          publishedBy: version.publishedBy?.name ?? null,
        }}
        fields={[...PRICING_MODELS[version.model].fields]}
        tiers={version.serviceTiers.map((tier) => ({
          id: tier.id,
          key: tier.key,
          label: tier.label,
          description: tier.description,
          parentKey: tier.parentKey,
          coManaged: tier.coManaged,
          override: {
            perUser: tier.overridePerUser?.toNumber() ?? null,
            perDevice: tier.overridePerDevice?.toNumber() ?? null,
            perLocation: tier.overridePerLocation?.toNumber() ?? null,
            flat: tier.overrideFlat?.toNumber() ?? null,
          },
        }))}
        items={version.cogsItems.map((item) => ({
          id: item.id,
          label: item.label,
          vendor: item.vendor,
          unit: item.unit,
          tierKeys: item.tiers.map((membership) => membership.tierKey),
          unitCost: item.unitCost.toNumber(),
          active: item.active,
          sortOrder: item.sortOrder,
        }))}
        bundles={version.bundles.map((bundle) => ({
          key: bundle.key,
          label: bundle.label,
          description: bundle.description,
          discountPct: bundle.discountPct.toNumber(),
          sortOrder: bundle.sortOrder,
        }))}
      />
    </div>
  );
}
