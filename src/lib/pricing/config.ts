import type {
  BundleDiscount,
  CogsItem,
  CogsItemTier,
  PricingVersion,
  ServiceTier,
} from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { NO_BUNDLE, type PricingConfig } from "@/lib/pricing/engine";
import { costPlusSettingsSchema, markupSettingsSchema } from "@/lib/pricing/models";

export type VersionWithChildren = PricingVersion & {
  serviceTiers: ServiceTier[];
  cogsItems: (CogsItem & { tiers: CogsItemTier[] })[];
  bundles: BundleDiscount[];
};

/**
 * Turns a stored version into the shape the engine takes. The model and its
 * settings come from the version itself, never from the tenant's current
 * choice, so a quote calculated under an older version keeps reproducing the
 * same numbers after the tenant tunes its pricing.
 */
export function toConfig(version: VersionWithChildren): PricingConfig {
  const items = version.cogsItems
    .filter((item) => item.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({
      key: item.key,
      label: item.label,
      vendor: item.vendor,
      unit: item.unit,
      tierKeys: item.tiers.map((tier) => tier.tierKey),
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

  const tiers = [...version.serviceTiers]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((tier) => ({
      key: tier.key,
      label: tier.label,
      description: tier.description,
      sortOrder: tier.sortOrder,
      parentKey: tier.parentKey,
      coManaged: tier.coManaged,
      rateOverride: {
        perUser: tier.overridePerUser?.toNumber() ?? 0,
        perDevice: tier.overridePerDevice?.toNumber() ?? 0,
        perLocation: tier.overridePerLocation?.toNumber() ?? 0,
        flat: tier.overrideFlat?.toNumber() ?? 0,
      },
      perUserFloor: tier.perUserFloor?.toNumber() ?? null,
    }));

  const base = {
    versionId: version.id,
    versionLabel: version.label,
    costBasis: version.costBasis,
    items,
    bundles,
    tiers,
  };

  return version.model === "COST_PLUS"
    ? { ...base, model: "COST_PLUS", settings: costPlusSettingsSchema.parse(version.settings) }
    : { ...base, model: "MARKUP_MULTIPLE", settings: markupSettingsSchema.parse(version.settings) };
}

const include = {
  serviceTiers: true,
  cogsItems: { include: { tiers: true } },
  bundles: true,
} as const;

/** The pricing version every new quote in this workspace is calculated against. */
export async function getActivePricingVersion(db: TenantDb): Promise<VersionWithChildren | null> {
  return db.pricingVersion.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    include,
  });
}

export async function getActiveConfig(db: TenantDb): Promise<PricingConfig | null> {
  const version = await getActivePricingVersion(db);
  return version ? toConfig(version) : null;
}

export async function getConfigForVersion(
  db: TenantDb,
  versionId: string,
): Promise<PricingConfig | null> {
  const version = await db.pricingVersion.findUnique({ where: { id: versionId }, include });
  return version ? toConfig(version) : null;
}

export async function getVersionWithChildren(
  db: TenantDb,
  versionId: string,
): Promise<VersionWithChildren | null> {
  return db.pricingVersion.findUnique({ where: { id: versionId }, include });
}
