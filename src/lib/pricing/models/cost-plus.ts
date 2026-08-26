/**
 * Cost-plus model.
 *
 * Tool cost is the only real dollar figure the environment generates. Labor is
 * imputed as a fixed multiple of tool cost, so tool + labor is the hard cost
 * floor. The Service Gross Margin slider is the single pricing lever:
 *
 *   agreementRate = (tool + labor) / (1 - SGM)
 *
 * Add-on tools in the upper tier are low-touch, so they carry no imputed
 * labor; they are priced with a separate, smaller add-on multiplier.
 */
import {
  applyBundle,
  applyFloor,
  bundleFor,
  linesFor,
  money,
  round2,
  type CalcInputs,
  type CalcResult,
  type CostPlusSettings,
  type PricingConfig,
  type PricingModelAdapter,
  type TierResult,
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

  const bundle = bundleFor(config, inputs.bundleKey);
  const bundlePct = bundle.discountPct / 100;

  const advLines = linesFor(config, "ADVANTAGE", inputs);
  const addonLines = linesFor(config, "PINNACLE", inputs);
  const advTool = advLines.reduce((sum, l) => sum + l.monthlyCost, 0);
  const addonTool = addonLines.reduce((sum, l) => sum + l.monthlyCost, 0);

  const advCostFloor = advTool * costMult;
  const advStandard = advTool * multiplier;
  // The upper tier is the base tier at the SGM multiplier plus low-touch
  // add-ons at the reduced multiplier, so its cost floor is the base floor
  // plus raw add-on license cost.
  const pinnCostFloor = advCostFloor + addonTool;
  const pinnStandard = advStandard + addonTool * inputs.addonMultiplier;

  const advBundle = applyBundle(advStandard, advCostFloor, bundlePct);
  const pinnBundle = applyBundle(pinnStandard, pinnCostFloor, bundlePct);

  const advFloor = applyFloor(advBundle.final, inputs);
  const pinnFloor = applyFloor(pinnBundle.final, inputs);
  const users = advFloor.users;

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
  if (advFloor.belowFloor) {
    triggers.push({
      code: "ADVANTAGE_BELOW_FLOOR",
      message: `${config.tierLabels.ADVANTAGE} rate ${money(advBundle.final / users)}/user is below the ${money(inputs.perUserFloor)}/user floor — floor rate applied`,
    });
  }
  if (pinnFloor.belowFloor) {
    triggers.push({
      code: "PINNACLE_BELOW_FLOOR",
      message: `${config.tierLabels.PINNACLE} rate ${money(pinnBundle.final / users)}/user is below the ${money(inputs.perUserFloor)}/user floor — floor rate applied`,
    });
  }
  if (inputs.floorOverride) {
    triggers.push({ code: "FLOOR_OVERRIDE", message: "Floor overridden — actual below-floor rate in use" });
  }
  if (advBundle.capped || pinnBundle.capped) {
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

  const advantage: TierResult = {
    tier: "ADVANTAGE",
    toolCost: advTool,
    costFloor: advCostFloor,
    standardRate: advStandard,
    discount: advBundle.discount,
    discountedRate: advBundle.final,
    headlineRate: advFloor.headlineRate,
    perUser: advBundle.final / users,
    headlinePerUser: advFloor.headlineRate / users,
    belowFloor: advFloor.belowFloor,
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
    headlineRate: pinnFloor.headlineRate,
    perUser: pinnBundle.final / users,
    headlinePerUser: pinnFloor.headlineRate / users,
    belowFloor: pinnFloor.belowFloor,
    discountCappedAtCost: pinnBundle.capped,
    lines: addonLines,
  };

  return {
    model: "COST_PLUS",
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
    floorRate: advFloor.floorRate,
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
