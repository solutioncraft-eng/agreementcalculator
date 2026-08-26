import type { QuoteRequest, QuoteStatus } from "@prisma/client";
import type { CalcInputs } from "@/lib/pricing/engine";

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
  ADVANTAGE_BELOW_FLOOR: "Advantage below floor",
  PINNACLE_BELOW_FLOOR: "Pinnacle below floor",
  FLOOR_OVERRIDE: "Floor overridden",
  DISCOUNT_CAPPED_AT_COST: "Bundle discount capped at cost",
  ADDON_MULTIPLIER_NON_DEFAULT: "Add-on multiplier off default",
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
    bundleKey: quote.bundleKey,
  };
}

export function tierName(tier: "ADVANTAGE" | "PINNACLE"): string {
  return tier === "PINNACLE" ? "infinIT Pinnacle" : "infinIT Advantage";
}

export function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
