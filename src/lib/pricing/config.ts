import type { BundleDiscount, CogsItem, PricingVersion } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NO_BUNDLE, type PricingConfig } from "@/lib/pricing/engine";

type VersionWithChildren = PricingVersion & { cogsItems: CogsItem[]; bundles: BundleDiscount[] };

export function toConfig(version: VersionWithChildren): PricingConfig {
  return {
    versionId: version.id,
    versionLabel: version.label,
    costBasis: version.costBasis,
    laborMultiplier: version.laborMultiplier.toNumber(),
    defaultSgmPct: version.defaultSgmPct.toNumber(),
    maxSgmPct: version.maxSgmPct.toNumber(),
    minPerUserFloor: version.minPerUserFloor.toNumber(),
    addonMultiplier: version.addonMultiplier.toNumber(),
    items: version.cogsItems
      .filter((item) => item.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        key: item.key,
        label: item.label,
        vendor: item.vendor,
        unit: item.unit,
        tier: item.tier,
        unitCost: item.unitCost.toNumber(),
        sortOrder: item.sortOrder,
      })),
    bundles: [
      NO_BUNDLE,
      ...version.bundles
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((bundle) => ({
          key: bundle.key,
          label: bundle.label,
          description: bundle.description,
          discountPct: bundle.discountPct.toNumber(),
          highlight: bundle.highlight,
          sortOrder: bundle.sortOrder,
        })),
    ],
  };
}

const include = { cogsItems: true, bundles: true } as const;

/** The pricing version every new quote is calculated against. */
export async function getActivePricingVersion(): Promise<VersionWithChildren | null> {
  return prisma.pricingVersion.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    include,
  });
}

export async function getActiveConfig(): Promise<PricingConfig | null> {
  const version = await getActivePricingVersion();
  return version ? toConfig(version) : null;
}

export async function getConfigForVersion(versionId: string): Promise<PricingConfig | null> {
  const version = await prisma.pricingVersion.findUnique({ where: { id: versionId }, include });
  return version ? toConfig(version) : null;
}

export async function getVersionWithChildren(versionId: string): Promise<VersionWithChildren | null> {
  return prisma.pricingVersion.findUnique({ where: { id: versionId }, include });
}
