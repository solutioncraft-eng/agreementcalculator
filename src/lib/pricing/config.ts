import type { BundleDiscount, CogsItem, PricingVersion, Tenant } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { NO_BUNDLE, type PricingConfig, type Tier } from "@/lib/pricing/engine";
import { costPlusSettingsSchema, markupSettingsSchema } from "@/lib/pricing/models";

export type VersionWithChildren = PricingVersion & {
  cogsItems: CogsItem[];
  bundles: BundleDiscount[];
};

/** Tenant-facing names for the two service tiers. */
export function tierLabels(tenant: Tenant): Record<Tier, string> {
  return { ADVANTAGE: tenant.advantageLabel, PINNACLE: tenant.pinnacleLabel };
}

/**
 * Turns a stored version into the shape the engine takes. The model and its
 * settings come from the version itself, never from the tenant's current
 * choice, so a quote calculated under an older version keeps reproducing the
 * same numbers after the tenant tunes its pricing.
 */
export function toConfig(version: VersionWithChildren, tenant: Tenant): PricingConfig {
  const items = version.cogsItems
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
    }));

  const bundles = [
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
  ];

  const base = {
    versionId: version.id,
    versionLabel: version.label,
    costBasis: version.costBasis,
    items,
    bundles,
    tierLabels: tierLabels(tenant),
  };

  return version.model === "COST_PLUS"
    ? { ...base, model: "COST_PLUS", settings: costPlusSettingsSchema.parse(version.settings) }
    : { ...base, model: "MARKUP_MULTIPLE", settings: markupSettingsSchema.parse(version.settings) };
}

const include = { cogsItems: true, bundles: true } as const;

/** The pricing version every new quote in this workspace is calculated against. */
export async function getActivePricingVersion(db: TenantDb): Promise<VersionWithChildren | null> {
  return db.pricingVersion.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    include,
  });
}

export async function getActiveConfig(db: TenantDb, tenant: Tenant): Promise<PricingConfig | null> {
  const version = await getActivePricingVersion(db);
  return version ? toConfig(version, tenant) : null;
}

export async function getConfigForVersion(
  db: TenantDb,
  tenant: Tenant,
  versionId: string,
): Promise<PricingConfig | null> {
  const version = await db.pricingVersion.findUnique({ where: { id: versionId }, include });
  return version ? toConfig(version, tenant) : null;
}

export async function getVersionWithChildren(
  db: TenantDb,
  versionId: string,
): Promise<VersionWithChildren | null> {
  return db.pricingVersion.findUnique({ where: { id: versionId }, include });
}
