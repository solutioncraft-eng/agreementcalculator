/**
 * Markup-multiple model.
 *
 * The simplest thing an MSP can price on: sell at a multiple of tool cost.
 *
 *   agreementRate = tool × markup
 *
 * There is no imputed labor and no margin to solve for, so the cost floor is
 * raw tool cost. Leadership review is driven by how far the AM dials the
 * multiple below the tenant's default, and by discounting past the tenant's
 * maximum.
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
  type MarkupSettings,
  type PricingConfig,
  type PricingModelAdapter,
  type TierResult,
  type Trigger,
} from "@/lib/pricing/engine";

function calculate(
  config: PricingConfig & { settings: MarkupSettings },
  inputs: CalcInputs,
): CalcResult {
  const s = config.settings;
  const markup = Math.max(inputs.markupMultiple, 1);

  const bundle = bundleFor(config, inputs.bundleKey);
  const bundlePct = bundle.discountPct / 100;

  const advLines = linesFor(config, "ADVANTAGE", inputs);
  const addonLines = linesFor(config, "PINNACLE", inputs);
  const advTool = advLines.reduce((sum, l) => sum + l.monthlyCost, 0);
  const addonTool = addonLines.reduce((sum, l) => sum + l.monthlyCost, 0);

  // Nothing is sold below license cost, so raw tool spend is the floor.
  const advCostFloor = advTool;
  const pinnCostFloor = advTool + addonTool;
  const advStandard = advTool * markup;
  const pinnStandard = advStandard + addonTool * s.addonMarkup;

  const advBundle = applyBundle(advStandard, advCostFloor, bundlePct);
  const pinnBundle = applyBundle(pinnStandard, pinnCostFloor, bundlePct);

  const advFloor = applyFloor(advBundle.final, inputs);
  const pinnFloor = applyFloor(pinnBundle.final, inputs);
  const users = advFloor.users;

  // Cost share of the sell rate; a markup agreement carries no imputed labor,
  // so the remainder is all margin.
  const toolPct = Math.round((1 / markup) * 100);

  const triggers: Trigger[] = [];
  if (round2(markup) < round2(s.minMarkup)) {
    triggers.push({
      code: "MARKUP_BELOW_MINIMUM",
      message: `Markup ${markup}× is below the ${s.minMarkup}× minimum`,
    });
  } else if (round2(markup) !== round2(s.defaultMarkup)) {
    triggers.push({
      code: "MARKUP_BELOW_DEFAULT",
      message: `Markup set to ${markup}× (default ${s.defaultMarkup}×)`,
    });
  }
  if (round2(bundle.discountPct) > round2(s.maxDiscountPct)) {
    triggers.push({
      code: "DISCOUNT_OVER_MAX",
      message: `${bundle.label} discounts ${bundle.discountPct}%, over the ${s.maxDiscountPct}% maximum`,
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
      message: "Bundle discount capped at tool cost",
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
    model: "MARKUP_MULTIPLE",
    inputs,
    bundle,
    multiplier: markup,
    split: { toolPct, laborPct: 0, sgmPct: Math.max(100 - toolPct, 0) },
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

export const markupModel: PricingModelAdapter<MarkupSettings> = {
  key: "MARKUP_MULTIPLE",
  label: "Markup multiple",
  summary: "Sell at a fixed multiple of tool cost — no imputed labor, no margin solve.",
  defaults: {
    defaultMarkup: 4,
    minMarkup: 3,
    minPerUserFloor: 100,
    maxDiscountPct: 15,
    addonMarkup: 2.5,
  },
  startingInputs: (s) => ({
    sgmPct: 0,
    perUserFloor: s.minPerUserFloor,
    addonMultiplier: s.addonMarkup,
    markupMultiple: s.defaultMarkup,
    floorOverride: false,
    bundleKey: "none",
  }),
  calculate,
};
