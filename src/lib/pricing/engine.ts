/**
 * Agreement pricing engine.
 *
 * A tenant chooses a pricing *model* when its workspace is created, and every
 * pricing version records which model produced it. The models share
 * everything around the calculation — the COGS item list, the offering ladder,
 * the bundle discounts, the approval thresholds concept, the audit trail and
 * the stamped PDFs — and differ only in how cost becomes a sell rate:
 *
 *   COST_PLUS        rate = (tool + imputed labor) / (1 - service gross margin)
 *   MARKUP_MULTIPLE  rate = tool × markup multiple
 *
 * Each model lives in ./models/<model>.ts behind {@link PricingModelAdapter},
 * so adding one is additive: a settings type, a calculate function and a set
 * of approval triggers. Nothing outside this directory branches on the model.
 *
 * A version defines its own ordered offerings (service tiers). They are
 * cumulative: the lowest is the base everything is built from, and each one
 * above it adds its own COGS items on top of every tier below, priced with the
 * add-on multiplier rather than the base one. {@link priceTiers} owns that
 * arithmetic for every model, so a model only decides three multipliers.
 */

export type Unit = "USER" | "DEVICE" | "LOCATION" | "FLAT";
export type PricingModelKey = "COST_PLUS" | "MARKUP_MULTIPLE";

/** One offering a workspace sells, as frozen into a pricing version. */
export interface ServiceTierDef {
  key: string;
  label: string;
  description?: string | null;
  sortOrder?: number;
}

export interface CogsLine {
  key: string;
  label: string;
  vendor?: string | null;
  unit: Unit;
  tierKey: string;
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
  /** The version's offerings, cheapest first. Always at least one. */
  tiers: ServiceTierDef[];
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
  | "TIER_BELOW_FLOOR"
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
  key: string;
  label: string;
  description?: string | null;
  /** Position in the ladder; 0 is the base offering. */
  index: number;
  /** Monthly tool cost — confidential, cumulative with the tiers below. */
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
  /** This tier's own COGS lines. The tiers below it carry the rest. */
  lines: LineResult[];
}

/** A step up from one offering to the next in the ladder. */
export interface TierDelta {
  fromKey: string;
  toKey: string;
  toolCost: number;
  standardRate: number;
  discountedRate: number;
  perUser: number;
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
  /** Every offering priced, cheapest first. Never empty. */
  tiers: TierResult[];
  /** One entry per step up the ladder, so one fewer than `tiers`. */
  deltas: TierDelta[];
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

export function linesFor(config: PricingConfig, tierKey: string, inputs: CalcInputs): LineResult[] {
  return config.items
    .filter((it) => it.tierKey === tierKey)
    .map((it) => {
      const quantity = quantityFor(it.unit, inputs);
      return { ...it, quantity, monthlyCost: it.unitCost * quantity };
    })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** The version's offerings in ladder order, cheapest first. */
export function orderedTiers(config: PricingConfig): ServiceTierDef[] {
  return [...config.tiers].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** The offering a key names, or the base offering when it names none. */
export function tierResultFor(result: CalcResult, key: string): TierResult {
  return result.tiers.find((t) => t.key === key) ?? result.tiers[0];
}

/** Every line included in an offering: its own, plus every tier below it. */
export function includedLines(result: CalcResult, key: string): LineResult[] {
  const index = tierResultFor(result, key).index;
  return result.tiers.filter((t) => t.index <= index).flatMap((t) => t.lines);
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

/** How a model turns tool cost into a rate, for one set of quote inputs. */
export interface TierPricing {
  /** Cost floor multiplier on the base tier's tools, e.g. 1 + labor multiple. */
  costMultiplier: number;
  /** Sell multiplier on the base tier's tools. */
  baseMultiplier: number;
  /** Sell multiplier on the tools each tier above the base adds. */
  addonMultiplier: number;
  /** Bundle discount as a fraction, e.g. 0.15. */
  bundlePct: number;
}

/**
 * Prices the whole offering ladder. Every tier is cumulative: its cost floor
 * and rate include everything the tiers below it contain, so a tier can never
 * come out cheaper than the one under it, and the two-tier case reduces to the
 * original base + add-ons arithmetic exactly.
 */
export function priceTiers(
  config: PricingConfig,
  inputs: CalcInputs,
  pricing: TierPricing,
): { tiers: TierResult[]; deltas: TierDelta[]; floorRate: number; users: number } {
  const defs = orderedTiers(config);
  const users = Math.max(inputs.users, 1);
  const floorRate = inputs.perUserFloor * users;

  let baseTool = 0;
  let addonTool = 0;
  const tiers = defs.map((def, index) => {
    const lines = linesFor(config, def.key, inputs);
    const ownTool = lines.reduce((sum, line) => sum + line.monthlyCost, 0);
    if (index === 0) baseTool = ownTool;
    else addonTool += ownTool;

    const costFloor = baseTool * pricing.costMultiplier + addonTool;
    const standardRate = baseTool * pricing.baseMultiplier + addonTool * pricing.addonMultiplier;
    const bundle = applyBundle(standardRate, costFloor, pricing.bundlePct);
    const floor = applyFloor(bundle.final, inputs);

    return {
      key: def.key,
      label: def.label,
      description: def.description,
      index,
      toolCost: baseTool + addonTool,
      costFloor,
      standardRate,
      discount: bundle.discount,
      discountedRate: bundle.final,
      headlineRate: floor.headlineRate,
      perUser: bundle.final / users,
      headlinePerUser: floor.headlineRate / users,
      belowFloor: floor.belowFloor,
      discountCappedAtCost: bundle.capped,
      lines,
    };
  });

  const deltas = tiers.slice(1).map((tier, i) => {
    const previous = tiers[i];
    return {
      fromKey: previous.key,
      toKey: tier.key,
      toolCost: tier.toolCost - previous.toolCost,
      standardRate: tier.standardRate - previous.standardRate,
      discountedRate: tier.discountedRate - previous.discountedRate,
      perUser: (tier.discountedRate - previous.discountedRate) / users,
    };
  });

  return { tiers, deltas, floorRate, users };
}

/** One trigger per offering whose rate landed under the per-user floor. */
export function belowFloorTriggers(tiers: TierResult[], inputs: CalcInputs): Trigger[] {
  return tiers
    .filter((tier) => tier.belowFloor)
    .map((tier) => ({
      code: "TIER_BELOW_FLOOR" as const,
      message: `${tier.label} rate ${money(tier.perUser)}/user is below the ${money(inputs.perUserFloor)}/user floor — floor rate applied`,
    }));
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
