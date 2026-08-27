import type { QuoteRequest, QuoteStatus } from "@prisma/client";
import type { CalcInputs, TierResult } from "@/lib/pricing/engine";
import { quoteTierRatesSchema } from "@/lib/schemas";

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  DENIED: "Denied",
  WITHDRAWN: "Withdrawn",
};

/**
 * Review-queue badge colours from the style guide. They are fixed rather than
 * accent-derived: a workspace may repaint the accent, but "needs approval" has
 * to look like a flag everywhere.
 */
export const STATUS_CLASS: Record<QuoteStatus, string> = {
  PENDING: "bg-status-alert text-status-alert-fg",
  APPROVED: "bg-status-approved text-status-approved-fg",
  CHANGES_REQUESTED: "bg-status-changes text-status-changes-fg",
  DENIED: "bg-ink text-white",
  WITHDRAWN: "bg-status-draft text-status-draft-fg",
};

export const TRIGGER_LABEL: Record<string, string> = {
  SGM_NON_DEFAULT: "Service gross margin off default",
  FLOOR_CHANGED: "Per-user floor changed",
  TIER_BELOW_FLOOR: "Offering below floor",
  // Codes the two hardcoded tiers raised, kept so old quotes still read.
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

/** An offering's rate as it stood when the quote was submitted. */
export interface StoredTierRate {
  key: string;
  label: string;
  rate: number;
  perUser: number;
}

/**
 * The offering rates frozen onto a quote at submission. Read from the stored
 * snapshot rather than recomputed, so a review shows the numbers the account
 * manager actually submitted even after the version is archived.
 */
export function storedTiers(quote: { tierRates: unknown }): StoredTierRate[] {
  const parsed = quoteTierRatesSchema.safeParse(quote.tierRates);
  return parsed.success ? parsed.data : [];
}

export function storedTier(
  quote: { tierRates: unknown; requestedTierKey: string },
): StoredTierRate | null {
  return storedTiers(quote).find((tier) => tier.key === quote.requestedTierKey) ?? null;
}

/** The offering name to show for a quote, falling back to the stored key. */
export function quoteTierName(
  quote: { tierRates: unknown; requestedTierKey: string },
): string {
  return storedTier(quote)?.label ?? quote.requestedTierKey;
}

/** Snapshot written to a quote when it is submitted for review. */
export function tierRatesFrom(tiers: TierResult[]): StoredTierRate[] {
  return tiers.map((tier) => ({
    key: tier.key,
    label: tier.label,
    rate: Number(tier.headlineRate.toFixed(2)),
    perUser: Number(tier.headlinePerUser.toFixed(2)),
  }));
}

export function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
