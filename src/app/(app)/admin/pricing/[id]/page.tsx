import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { VersionEditor } from "./version-editor";

export const dynamic = "force-dynamic";

export default async function PricingVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("ADMIN");

  const version = await prisma.pricingVersion.findUnique({
    where: { id },
    include: {
      cogsItems: { orderBy: [{ tier: "asc" }, { sortOrder: "asc" }] },
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
          laborMultiplier: version.laborMultiplier.toNumber(),
          defaultSgmPct: version.defaultSgmPct.toNumber(),
          maxSgmPct: version.maxSgmPct.toNumber(),
          minPerUserFloor: version.minPerUserFloor.toNumber(),
          addonMultiplier: version.addonMultiplier.toNumber(),
          publishedAt: version.publishedAt?.toISOString() ?? null,
          publishedBy: version.publishedBy?.name ?? null,
        }}
        items={version.cogsItems.map((item) => ({
          id: item.id,
          label: item.label,
          vendor: item.vendor,
          unit: item.unit,
          tier: item.tier,
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
