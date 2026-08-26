import type { QuoteRequest, QuoteStatus, Tenant } from "@prisma/client";
import type { CalcInputs, Tier } from "@/lib/pricing/engine";

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  DENIED: "Denied",
  WITHDRAWN: "Withdrawn",
};

export const STATUS_CLASS: Record<QuoteStatus, string> = {
  PENDING: "bg-orange-tint/25 text-orange-dark",
  APPROVED: "bg-navy text-white",
  CHANGES_REQUESTED: "bg-orange text-white",
  DENIED: "bg-ink text-white",
  WITHDRAWN: "bg-mist text-slate",
};

export const TRIGGER_LABEL: Record<string, string> = {
  SGM_NON_DEFAULT: "Service gross margin off default",
  FLOOR_CHANGED: "Per-user floor changed",
  ADVANTAGE_BELOW_FLOOR: "Base tier below floor",
  PINNACLE_BELOW_FLOOR: "Upper tier below floor",
  FLOOR_OVERRIDE: "Floor overridden",
  DISCOUNT_CAPPED_AT_COST: "Bundle discount capped at cost",
  ADDON_MULTIPLIER_NON_DEFAULT: "Add-on multiplier off default",
  MARKUP_BELOW_DEFAULT: "Markup off default",
  MARKUP_BELOW_MINIMUM: "Markup below minimum",
  DISCOUNT_OVER_MAX: "Discount over maximum",
};

export function quoteInputs(quote: QuoteRequest): CalcInputs {
  return {
    users: quote.users,
    devices: quote.devices,
    locations: quote.locations,
    sgmPct: quote.sgmPct.toNumber(),
    perUserFloor: quote.perUserFloor.toNumber(),
    floorOverride: quote.floorOverride,
    addonMultiplier: quote.addonMultiplier.toNumber(),
    markupMultiple: quote.markupMultiple.toNumber(),
    bundleKey: quote.bundleKey,
  };
}

/** Tier name as this workspace calls it. */
export function tierName(tenant: Pick<Tenant, "advantageLabel" | "pinnacleLabel">, tier: Tier): string {
  return tier === "PINNACLE" ? tenant.pinnacleLabel : tenant.advantageLabel;
}

export function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
