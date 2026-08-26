/**
 * Agreement pricing engine.
 *
 * A tenant chooses a pricing *model* when its workspace is created, and every
 * pricing version records which model produced it. The models share
 * everything around the calculation — the COGS item list, the two tiers, the
 * bundle discounts, the approval thresholds concept, the audit trail and the
 * stamped PDFs — and differ only in how cost becomes a sell rate:
 *
 *   COST_PLUS        rate = (tool + imputed labor) / (1 - service gross margin)
 *   MARKUP_MULTIPLE  rate = tool × markup multiple
 *
 * Each model lives in ./models/<model>.ts behind {@link PricingModelAdapter},
 * so adding one is additive: a settings type, a calculate function and a set
 * of approval triggers. Nothing outside this directory branches on the model.
 */

export type Unit = "USER" | "DEVICE" | "LOCATION" | "FLAT";
export type Tier = "ADVANTAGE" | "PINNACLE";
export type PricingModelKey = "COST_PLUS" | "MARKUP_MULTIPLE";

export interface CogsLine {
  key: string;
  label: string;
  vendor?: string | null;
  unit: Unit;
  tier: Tier;
  unitCost: number;
  sortOrder?: number;
}

export interface BundleOption {
  key: string;
  label: string;
  description?: string | null;
  discountPct: number;
  highlight?: boolean;
  sortOrder?: number;
}

export interface CostPlusSettings {
  /** Labor is imputed as a multiple of tool cost (InfinIT's v11 default 3.10). */
  laborMultiplier: number;
  /** Default Service Gross Margin, percent. */
  defaultSgmPct: number;
  /** Maximum Service Gross Margin the slider allows, percent. */
  maxSgmPct: number;
  minPerUserFloor: number;
  /** Reduced multiplier applied to low-touch add-on tools. */
  addonMultiplier: number;
}

export interface MarkupSettings {
  /** Sell rate is tool cost times this multiple. */
  defaultMarkup: number;
  /** Lowest markup an AM can dial in without leadership review. */
  minMarkup: number;
  minPerUserFloor: number;
  /** Discount beyond this needs leadership review. */
  maxDiscountPct: number;
  /** Multiple applied to low-touch add-on tools. */
  addonMarkup: number;
}

export type ModelSettings = CostPlusSettings | MarkupSettings;

interface ConfigBase {
  versionId: string;
  versionLabel: string;
  costBasis: string;
  items: CogsLine[];
  bundles: BundleOption[];
  /** Tenant's names for the two tiers, e.g. "Advantage" / "Pinnacle". */
  tierLabels: Record<Tier, string>;
}

export type CostPlusConfig = ConfigBase & { model: "COST_PLUS"; settings: CostPlusSettings };
export type MarkupConfig = ConfigBase & { model: "MARKUP_MULTIPLE"; settings: MarkupSettings };

export type PricingConfig = CostPlusConfig | MarkupConfig;

/**
 * Levers an account manager can move on a single quote. Every model reads the
 * subset it cares about, so the calculator form, the QuoteRequest columns and
 * the PDF stamp stay one shape regardless of model.
 */
export interface CalcInputs {
  users: number;
  devices: number;
  locations: number;
  floorOverride: boolean;
  bundleKey: string;
  perUserFloor: number;
  /** COST_PLUS: service gross margin, percent. */
  sgmPct: number;
  /** COST_PLUS: multiplier on low-touch add-on tools. */
  addonMultiplier: number;
  /** MARKUP_MULTIPLE: markup applied to tool cost. */
  markupMultiple: number;
}

export type TriggerCode =
  | "SGM_NON_DEFAULT"
  | "FLOOR_CHANGED"
  | "ADVANTAGE_BELOW_FLOOR"
  | "PINNACLE_BELOW_FLOOR"
  | "FLOOR_OVERRIDE"
  | "DISCOUNT_CAPPED_AT_COST"
  | "ADDON_MULTIPLIER_NON_DEFAULT"
  | "MARKUP_BELOW_DEFAULT"
  | "MARKUP_BELOW_MINIMUM"
  | "DISCOUNT_OVER_MAX";

export interface Trigger {
  code: TriggerCode;
  message: string;
}

export interface LineResult extends CogsLine {
  quantity: number;
  monthlyCost: number;
}

export interface TierResult {
  tier: Tier;
  /** Monthly tool (license) cost — confidential. */
  toolCost: number;
  /** The rate can never fall below this. Cost-plus adds imputed labor. */
  costFloor: number;
  /** Rate from the model's formula, before any bundle discount. */
  standardRate: number;
  /** Bundle discount actually applied (capped so the rate never goes below cost). */
  discount: number;
  discountedRate: number;
  /** Rate shown to the AM: the per-user floor rate when below floor and not overridden. */
  headlineRate: number;
  perUser: number;
  headlinePerUser: number;
  belowFloor: boolean;
  discountCappedAtCost: boolean;
  lines: LineResult[];
}

export interface CalcResult {
  model: PricingModelKey;
  inputs: CalcInputs;
  bundle: BundleOption;
  /** The model's headline multiplier, for display: derived, never an input. */
  multiplier: number;
  /**
   * Where a dollar of the agreement rate goes. Cost-plus splits tool / labor /
   * margin; markup has no imputed labor, so labor is zero.
   */
  split: { toolPct: number; laborPct: number; sgmPct: number };
  advantage: TierResult;
  pinnacle: TierResult;
  /** Upgrade delta, Advantage → Pinnacle. */
  delta: { toolCost: number; standardRate: number; discountedRate: number; perUser: number };
  floorRate: number;
  triggers: Trigger[];
  needsApproval: boolean;
}

export const NO_BUNDLE: BundleOption = {
  key: "none",
  label: "No bundle",
  description: "Standard rate",
  discountPct: 0,
  sortOrder: 0,
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

export function moneyRounded(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function quantityFor(unit: Unit, i: CalcInputs): number {
  switch (unit) {
    case "USER":
      return i.users;
    case "DEVICE":
      return i.devices;
    case "LOCATION":
      return i.locations;
    case "FLAT":
      return 1;
  }
}

export function bundleFor(config: PricingConfig, key: string): BundleOption {
  return config.bundles.find((b) => b.key === key) ?? NO_BUNDLE;
}

export function linesFor(config: PricingConfig, tier: Tier, inputs: CalcInputs): LineResult[] {
  return config.items
    .filter((it) => it.tier === tier)
    .map((it) => {
      const quantity = quantityFor(it.unit, inputs);
      return { ...it, quantity, monthlyCost: it.unitCost * quantity };
    })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/**
 * Applies the bundle discount, capped so a discount can never sell below the
 * cost floor. Shared by every model — the cap is a business rule, not a
 * property of a particular formula.
 */
export function applyBundle(standard: number, costFloor: number, bundlePct: number) {
  const raw = standard * (1 - bundlePct);
  const capped = bundlePct > 0 && raw < costFloor;
  const final = Math.max(raw, costFloor);
  return { final, capped, discount: standard - final };
}

/** Per-user floor handling, shared by every model. */
export function applyFloor(rate: number, inputs: CalcInputs) {
  const users = Math.max(inputs.users, 1);
  const floorRate = inputs.perUserFloor * users;
  const belowFloor = !inputs.floorOverride && rate / users < inputs.perUserFloor;
  return { users, floorRate, belowFloor, headlineRate: belowFloor ? floorRate : rate };
}

export interface PricingModelAdapter<S extends ModelSettings> {
  key: PricingModelKey;
  label: string;
  /** One line an admin sees when choosing the model. */
  summary: string;
  defaults: S;
  /** Inputs a fresh quote starts from under this model. */
  startingInputs(settings: S): Omit<CalcInputs, "users" | "devices" | "locations">;
  calculate(config: PricingConfig & { settings: S }, inputs: CalcInputs): CalcResult;
}
