/**
 * Cost-plus model.
 *
 * Tool cost is the only real dollar figure the environment generates. Labor is
 * imputed as a fixed multiple of tool cost, so tool + labor is the hard cost
 * floor. The Service Gross Margin slider is the single pricing lever:
 *
 *   agreementRate = (tool + labor) / (1 - SGM)
 *
 * Add-on tools in the offerings above the base tier are low-touch, so they carry
 * no imputed labor; they are priced with a separate, smaller add-on multiplier.
 */
import {
  belowFloorTriggers,
  bundleFor,
  money,
  overrideTriggers,
  priceTiers,
  round2,
  type CalcInputs,
  type CalcResult,
  type CostPlusSettings,
  type PricingConfig,
  type PricingModelAdapter,
  type Trigger,
} from "@/lib/pricing/engine";

function calculate(
  config: PricingConfig & { settings: CostPlusSettings },
  inputs: CalcInputs,
): CalcResult {
  const s = config.settings;
  const sgm = Math.min(Math.max(inputs.sgmPct, 0), s.maxSgmPct) / 100;
  const costMult = 1 + s.laborMultiplier;
  const multiplier = costMult / (1 - sgm);
  // A co-managed offering shares delivery with the client's IT staff, so its
  // base tools carry less imputed labor at the same margin.
  const coManagedCostMult = 1 + s.coManagedLaborMultiplier;

  const bundle = bundleFor(config, inputs.bundleKey);

  // The base offering carries imputed labor at the SGM multiplier; every tier
  // above it adds low-touch tools at the reduced add-on multiplier, so its cost
  // floor is the base floor plus raw add-on license cost.
  const { tiers, deltas, floorRate } = priceTiers(config, inputs, {
    costMultiplier: costMult,
    baseMultiplier: multiplier,
    addonMultiplier: inputs.addonMultiplier,
    coManaged: { costMultiplier: coManagedCostMult, baseMultiplier: coManagedCostMult / (1 - sgm) },
    bundlePct: bundle.discountPct / 100,
  });

  const toolPct = Math.round(((1 - sgm) / costMult) * 100);
  const laborPct = Math.round(((s.laborMultiplier * (1 - sgm)) / costMult) * 100);

  const triggers: Trigger[] = [];
  if (round2(inputs.sgmPct) !== round2(s.defaultSgmPct)) {
    triggers.push({
      code: "SGM_NON_DEFAULT",
      message: `Service gross margin set to ${inputs.sgmPct}% (default ${s.defaultSgmPct}%)`,
    });
  }
  if (round2(inputs.perUserFloor) !== round2(s.minPerUserFloor)) {
    triggers.push({
      code: "FLOOR_CHANGED",
      message: `Minimum per-user floor changed from ${money(s.minPerUserFloor)} to ${money(inputs.perUserFloor)}`,
    });
  }
  triggers.push(...belowFloorTriggers(tiers), ...overrideTriggers(tiers));
  if (inputs.floorOverride) {
    triggers.push({ code: "FLOOR_OVERRIDE", message: "Floor overridden — actual below-floor rate in use" });
  }
  if (tiers.some((tier) => tier.discountCappedAtCost)) {
    triggers.push({
      code: "DISCOUNT_CAPPED_AT_COST",
      message: "Bundle discount capped at the cost floor (tool + labor)",
    });
  }
  if (round2(inputs.addonMultiplier) !== round2(s.addonMultiplier)) {
    triggers.push({
      code: "ADDON_MULTIPLIER_NON_DEFAULT",
      message: `Add-on multiplier set to ${inputs.addonMultiplier}× (default ${s.addonMultiplier}×)`,
    });
  }

  return {
    model: "COST_PLUS",
    inputs,
    bundle,
    multiplier,
    split: { toolPct, laborPct, sgmPct: Math.round(sgm * 100) },
    tiers,
    deltas,
    floorRate,
    triggers,
    needsApproval: triggers.length > 0,
  };
}

export const costPlusModel: PricingModelAdapter<CostPlusSettings> = {
  key: "COST_PLUS",
  label: "Cost-plus (service gross margin)",
  summary:
    "Build the rate up from tool cost plus imputed labor, then solve for a target service gross margin.",
  defaults: {
    laborMultiplier: 3.1,
    defaultSgmPct: 50,
    maxSgmPct: 70,
    minPerUserFloor: 100,
    addonMultiplier: 4.83,
    coManagedLaborMultiplier: 1,
  },
  startingInputs: (s) => ({
    sgmPct: s.defaultSgmPct,
    perUserFloor: s.minPerUserFloor,
    addonMultiplier: s.addonMultiplier,
    markupMultiple: 1,
    floorOverride: false,
    bundleKey: "none",
  }),
  calculate,
};
