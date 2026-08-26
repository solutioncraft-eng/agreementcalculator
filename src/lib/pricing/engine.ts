/**
 * Agreement pricing engine.
 *
 * Ported from the standalone calculator (v11) and generalised so that every
 * number comes from a published pricing version rather than being hard-coded.
 *
 * The model: tool cost is the only real dollar figure the environment
 * generates. Labor is imputed as a fixed multiple of tool cost, so
 * tool + labor is the hard cost floor. The Service Gross Margin slider is the
 * single pricing lever:
 *
 *   agreementRate = (tool + labor) / (1 - SGM)
 *
 * Pinnacle add-on tools are low-touch, so they do not carry imputed labor;
 * they are priced with a separate, smaller add-on multiplier.
 */

export type Unit = "USER" | "DEVICE" | "LOCATION" | "FLAT";
export type Tier = "ADVANTAGE" | "PINNACLE";

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

export interface PricingConfig {
  versionId: string;
  versionLabel: string;
  costBasis: string;
  laborMultiplier: number;
  defaultSgmPct: number;
  maxSgmPct: number;
  minPerUserFloor: number;
  addonMultiplier: number;
  items: CogsLine[];
  bundles: BundleOption[];
}

export interface CalcInputs {
  users: number;
  devices: number;
  locations: number;
  sgmPct: number;
  perUserFloor: number;
  floorOverride: boolean;
  addonMultiplier: number;
  bundleKey: string;
}

export type TriggerCode =
  | "SGM_NON_DEFAULT"
  | "FLOOR_CHANGED"
  | "ADVANTAGE_BELOW_FLOOR"
  | "PINNACLE_BELOW_FLOOR"
  | "FLOOR_OVERRIDE"
  | "DISCOUNT_CAPPED_AT_COST"
  | "ADDON_MULTIPLIER_NON_DEFAULT";

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
  /// Monthly tool (license) cost — confidential.
  toolCost: number;
  /// tool + imputed labor. The rate can never fall below this.
  costFloor: number;
  /// Rate from the SGM formula, before any bundle discount.
  standardRate: number;
  /// Bundle discount actually applied (capped so the rate never goes below cost).
  discount: number;
  /// Rate after the bundle discount.
  discountedRate: number;
  /// Rate shown to the AM: the per-user floor rate when below floor and not overridden.
  headlineRate: number;
  perUser: number;
  headlinePerUser: number;
  belowFloor: boolean;
  discountCappedAtCost: boolean;
  lines: LineResult[];
}

export interface CalcResult {
  inputs: CalcInputs;
  bundle: BundleOption;
  /// Derived agreement multiplier (a result of SGM, never an input).
  multiplier: number;
  split: { toolPct: number; laborPct: number; sgmPct: number };
  advantage: TierResult;
  pinnacle: TierResult;
  /// Upgrade delta, Advantage → Pinnacle.
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

const round2 = (n: number) => Math.round(n * 100) / 100;

function quantityFor(unit: Unit, i: CalcInputs): number {
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

export function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

export function moneyRounded(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function calculate(config: PricingConfig, inputs: CalcInputs): CalcResult {
  const sgm = Math.min(Math.max(inputs.sgmPct, 0), config.maxSgmPct) / 100;
  const costMult = 1 + config.laborMultiplier;
  const multiplier = costMult / (1 - sgm);

  const bundle = config.bundles.find((b) => b.key === inputs.bundleKey) ?? NO_BUNDLE;
  const bundlePct = bundle.discountPct / 100;

  const buildLines = (tier: Tier): LineResult[] =>
    config.items
      .filter((it) => it.tier === tier)
      .map((it) => {
        const quantity = quantityFor(it.unit, inputs);
        return { ...it, quantity, monthlyCost: it.unitCost * quantity };
      })
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const advLines = buildLines("ADVANTAGE");
  const addonLines = buildLines("PINNACLE");

  const advTool = advLines.reduce((s, l) => s + l.monthlyCost, 0);
  const addonTool = addonLines.reduce((s, l) => s + l.monthlyCost, 0);

  // Advantage: base service tools carry imputed labor and flex with SGM.
  const advCostFloor = advTool * costMult;
  const advStandard = advTool * multiplier;

  // Pinnacle: Advantage base at the SGM multiplier, plus low-touch add-ons at
  // the reduced add-on multiplier. Add-ons do not carry service labor, so the
  // Pinnacle cost floor is the Advantage floor plus raw add-on license cost.
  const pinnCostFloor = advCostFloor + addonTool;
  const pinnStandard = advStandard + addonTool * inputs.addonMultiplier;

  const applyBundle = (standard: number, costFloor: number) => {
    const raw = standard * (1 - bundlePct);
    const capped = bundlePct > 0 && raw < costFloor;
    const final = Math.max(raw, costFloor);
    return { final, capped, discount: standard - final };
  };

  const advBundle = applyBundle(advStandard, advCostFloor);
  const pinnBundle = applyBundle(pinnStandard, pinnCostFloor);

  const users = Math.max(inputs.users, 1);
  const floorRate = inputs.perUserFloor * users;
  const advBelowFloor = !inputs.floorOverride && advBundle.final / users < inputs.perUserFloor;
  const pinnBelowFloor = !inputs.floorOverride && pinnBundle.final / users < inputs.perUserFloor;

  const advHeadline = advBelowFloor ? floorRate : advBundle.final;
  const pinnHeadline = pinnBelowFloor ? floorRate : pinnBundle.final;

  const toolPct = Math.round(((1 - sgm) / costMult) * 100);
  const laborPct = Math.round((config.laborMultiplier * (1 - sgm)) / costMult * 100);

  const triggers: Trigger[] = [];
  if (round2(inputs.sgmPct) !== round2(config.defaultSgmPct)) {
    triggers.push({
      code: "SGM_NON_DEFAULT",
      message: `Service gross margin set to ${inputs.sgmPct}% (default ${config.defaultSgmPct}%)`,
    });
  }
  if (round2(inputs.perUserFloor) !== round2(config.minPerUserFloor)) {
    triggers.push({
      code: "FLOOR_CHANGED",
      message: `Minimum per-user floor changed from ${money(config.minPerUserFloor)} to ${money(inputs.perUserFloor)}`,
    });
  }
  if (advBelowFloor) {
    triggers.push({
      code: "ADVANTAGE_BELOW_FLOOR",
      message: `Advantage rate ${money(advBundle.final / users)}/user is below the ${money(inputs.perUserFloor)}/user floor — floor rate applied`,
    });
  }
  if (pinnBelowFloor) {
    triggers.push({
      code: "PINNACLE_BELOW_FLOOR",
      message: `Pinnacle rate ${money(pinnBundle.final / users)}/user is below the ${money(inputs.perUserFloor)}/user floor — floor rate applied`,
    });
  }
  if (inputs.floorOverride) {
    triggers.push({
      code: "FLOOR_OVERRIDE",
      message: "Floor overridden — actual below-floor rate in use",
    });
  }
  if (advBundle.capped || pinnBundle.capped) {
    triggers.push({
      code: "DISCOUNT_CAPPED_AT_COST",
      message: "Bundle discount capped at the cost floor (tool + labor)",
    });
  }
  if (round2(inputs.addonMultiplier) !== round2(config.addonMultiplier)) {
    triggers.push({
      code: "ADDON_MULTIPLIER_NON_DEFAULT",
      message: `Pinnacle add-on multiplier set to ${inputs.addonMultiplier}× (default ${config.addonMultiplier}×)`,
    });
  }

  const advantage: TierResult = {
    tier: "ADVANTAGE",
    toolCost: advTool,
    costFloor: advCostFloor,
    standardRate: advStandard,
    discount: advBundle.discount,
    discountedRate: advBundle.final,
    headlineRate: advHeadline,
    perUser: advBundle.final / users,
    headlinePerUser: advHeadline / users,
    belowFloor: advBelowFloor,
    discountCappedAtCost: advBundle.capped,
    lines: advLines,
  };

  const pinnacle: TierResult = {
    tier: "PINNACLE",
    toolCost: advTool + addonTool,
    costFloor: pinnCostFloor,
    standardRate: pinnStandard,
    discount: pinnBundle.discount,
    discountedRate: pinnBundle.final,
    headlineRate: pinnHeadline,
    perUser: pinnBundle.final / users,
    headlinePerUser: pinnHeadline / users,
    belowFloor: pinnBelowFloor,
    discountCappedAtCost: pinnBundle.capped,
    lines: addonLines,
  };

  return {
    inputs,
    bundle,
    multiplier,
    split: { toolPct, laborPct, sgmPct: Math.round(sgm * 100) },
    advantage,
    pinnacle,
    delta: {
      toolCost: pinnacle.toolCost - advantage.toolCost,
      standardRate: pinnStandard - advStandard,
      discountedRate: pinnBundle.final - advBundle.final,
      perUser: (pinnBundle.final - advBundle.final) / users,
    },
    floorRate,
    triggers,
    needsApproval: triggers.length > 0,
  };
}
