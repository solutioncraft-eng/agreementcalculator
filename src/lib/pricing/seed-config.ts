import { NO_BUNDLE, type PricingConfig } from "@/lib/pricing/engine";
import {
  SEED_BUNDLES,
  SEED_COGS_ITEMS,
  SEED_COST_BASIS,
  SEED_COST_PLUS_SETTINGS,
  SEED_SERVICE_TIERS,
  SEED_VERSION_LABEL,
} from "@/lib/pricing/defaults";

/**
 * The seed pricing version as a config object, without a database. Used by
 * offline tooling (simulations, sanity checks) so the engine can be exercised
 * with the shipped numbers wherever it runs.
 */
export function seedConfig(): PricingConfig {
  return {
    versionId: "seed",
    versionLabel: SEED_VERSION_LABEL,
    costBasis: SEED_COST_BASIS,
    model: "COST_PLUS",
    settings: SEED_COST_PLUS_SETTINGS,
    tiers: SEED_SERVICE_TIERS.map((tier, index) => ({ ...tier, sortOrder: index })),
    items: SEED_COGS_ITEMS.map((item, index) => ({ ...item, sortOrder: index })),
    bundles: [NO_BUNDLE, ...SEED_BUNDLES.map((bundle, index) => ({ ...bundle, sortOrder: index + 1 }))],
  };
}
