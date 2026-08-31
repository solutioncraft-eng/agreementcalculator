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
 * A version defines its own offerings (service tiers). An offering either
 * stands alone — priced from the COGS items assigned to it — or builds on a
 * parent, in which case it includes its whole parent chain's items and the
 * items it adds are priced with the add-on multiplier rather than the base one.
 * {@link priceTiers} owns that arithmetic for every model, so a model only
 * decides three multipliers.
 */

export type Unit = "USER" | "DEVICE" | "LOCATION" | "FLAT";
export type PricingModelKey = "COST_PLUS" | "MARKUP_MULTIPLE";

/** One offering a workspace sells, as frozen into a pricing version. */
export interface ServiceTierDef {
  key: string;
  label: string;
  description?: string | null;
  sortOrder?: number;
  /** Key of the offering this one builds on. Null/undefined when standalone. */
  parentKey?: string | null;
}

export interface CogsLine {
  key: string;
  label: string;
  vendor?: string | null;
  unit: Unit;
  /** Every offering this item is assigned to, by ServiceTier.key. */
  tierKeys: string[];
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
  /** The version's offerings, in display order. Always at least one. */
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
  /** The offering this line was priced under: its own, not an inherited one. */
  tierKey: string;
  quantity: number;
  monthlyCost: number;
}

export interface TierResult {
  key: string;
  label: string;
  description?: string | null;
  /** Position in display order. */
  index: number;
  /** The offering this one builds on, or null when it stands alone. */
  parentKey: string | null;
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
  /** This tier's own COGS lines. Its parent chain carries the rest. */
  lines: LineResult[];
}

/** A step up from a parent offering to the one built on it. */
export interface TierDelta {
  fromKey: string;
  toKey: string;
  toolCost: number;
  standardRate: number;
  discountedRate: number;
  perUser: number;
  /**
   * The step between the two headline rates — what the client actually pays to
   * move up. Zero when both offerings sit on the per-user floor, so anything
   * quoting an upgrade price must use this rather than `discountedRate`.
   */
  headlineRate: number;
  headlinePerUser: number;
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
  /** Every offering priced, in display order. Never empty. */
  tiers: TierResult[];
  /** One entry per offering that builds on a parent. */
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
    .filter((it) => it.tierKeys.includes(tierKey))
    .map((it) => {
      const quantity = quantityFor(it.unit, inputs);
      return { ...it, tierKey, quantity, monthlyCost: it.unitCost * quantity };
    })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** The version's offerings in display order. */
export function orderedTiers(config: PricingConfig): ServiceTierDef[] {
  return [...config.tiers].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/**
 * An offering's parent chain, root first and the offering itself last. A cycle
 * or a parent that names an offering the version does not define is treated as
 * the chain ending there, so a broken draft still prices rather than hanging.
 */
export function tierChain(tiers: ServiceTierDef[], key: string): ServiceTierDef[] {
  const chain: ServiceTierDef[] = [];
  const seen = new Set<string>();
  let current = tiers.find((tier) => tier.key === key);

  while (current && !seen.has(current.key)) {
    seen.add(current.key);
    chain.unshift(current);
    const parentKey = current.parentKey;
    current = parentKey ? tiers.find((tier) => tier.key === parentKey) : undefined;
  }

  return chain;
}

/** The offering a key names, or the base offering when it names none. */
export function tierResultFor(result: CalcResult, key: string): TierResult {
  return result.tiers.find((t) => t.key === key) ?? result.tiers[0];
}

/**
 * Gross margin actually achieved at the rate being quoted, i.e. after the
 * bundle discount, the discount cap and the per-user floor have moved the rate
 * away from what the model's lever asked for. Measured against the tier's cost
 * floor, so cost-plus reads as margin over tool plus imputed labor and markup
 * as margin over tool cost.
 */
export function achievedSgmPct(tier: TierResult): number {
  if (tier.headlineRate <= 0) return 0;
  return round2((1 - tier.costFloor / tier.headlineRate) * 100);
}

/**
 * Every line included in an offering: its own, plus its parent chain's. An item
 * assigned to more than one offering in the chain is counted once, at the
 * offering closest to the root, which is where it is priced.
 */
export function includedLines(result: CalcResult, key: string): LineResult[] {
  const chain = tierChain(result.tiers, tierResultFor(result, key).key);
  const seen = new Set<string>();

  return chain
    .flatMap((tier) => result.tiers.find((t) => t.key === tier.key)?.lines ?? [])
    .filter((line) => {
      if (seen.has(line.key)) return false;
      seen.add(line.key);
      return true;
    });
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
 * Prices every offering the version defines. An offering carries the COGS items
 * of its parent chain on top of its own: the chain's root is priced with the
 * base multiplier (cost-plus imputes labor on it), everything the chain adds
 * above the root with the add-on multiplier. A standalone offering is its own
 * root, and a strict ladder — every offering parented to the one below it —
 * reduces to the original cumulative arithmetic exactly.
 */
export function priceTiers(
  config: PricingConfig,
  inputs: CalcInputs,
  pricing: TierPricing,
): { tiers: TierResult[]; deltas: TierDelta[]; floorRate: number; users: number } {
  const defs = orderedTiers(config);
  const users = Math.max(inputs.users, 1);
  const floorRate = inputs.perUserFloor * users;

  const tiers = defs.map((def, index) => {
    const chain = tierChain(defs, def.key);
    const lines = linesFor(config, def.key, inputs);

    // An item assigned to several offerings in the chain is priced once, at the
    // offering nearest the root, so sharing a tool never charges for it twice.
    const counted = new Set<string>();
    let baseTool = 0;
    let addonTool = 0;
    chain.forEach((member, depth) => {
      for (const line of linesFor(config, member.key, inputs)) {
        if (counted.has(line.key)) continue;
        counted.add(line.key);
        if (depth === 0) baseTool += line.monthlyCost;
        else addonTool += line.monthlyCost;
      }
    });

    const costFloor = baseTool * pricing.costMultiplier + addonTool;
    const standardRate = baseTool * pricing.baseMultiplier + addonTool * pricing.addonMultiplier;
    const bundle = applyBundle(standardRate, costFloor, pricing.bundlePct);
    const floor = applyFloor(bundle.final, inputs);

    return {
      key: def.key,
      label: def.label,
      description: def.description,
      index,
      parentKey: chain.length > 1 ? chain[chain.length - 2].key : null,
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

  const deltas = tiers.flatMap((tier) => {
    const parent = tier.parentKey ? tiers.find((t) => t.key === tier.parentKey) : undefined;
    if (!parent) return [];
    return [
      {
        fromKey: parent.key,
        toKey: tier.key,
        toolCost: tier.toolCost - parent.toolCost,
        standardRate: tier.standardRate - parent.standardRate,
        discountedRate: tier.discountedRate - parent.discountedRate,
        perUser: (tier.discountedRate - parent.discountedRate) / users,
        headlineRate: tier.headlineRate - parent.headlineRate,
        headlinePerUser: (tier.headlineRate - parent.headlineRate) / users,
      },
    ];
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
