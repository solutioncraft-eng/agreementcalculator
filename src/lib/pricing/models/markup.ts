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
  belowFloorTriggers,
  bundleFor,
  money,
  overrideTriggers,
  priceTiers,
  round2,
  type CalcInputs,
  type CalcResult,
  type MarkupSettings,
  type PricingConfig,
  type PricingModelAdapter,
  type Trigger,
} from "@/lib/pricing/engine";

function calculate(
  config: PricingConfig & { settings: MarkupSettings },
  inputs: CalcInputs,
): CalcResult {
  const s = config.settings;
  const markup = Math.max(inputs.markupMultiple, 1);

  const bundle = bundleFor(config, inputs.bundleKey);

  // Nothing is sold below license cost, so raw tool spend is the floor.
  const { tiers, deltas, floorRate } = priceTiers(config, inputs, {
    costMultiplier: 1,
    baseMultiplier: markup,
    addonMultiplier: s.addonMarkup,
    coManaged: { costMultiplier: 1, baseMultiplier: s.coManagedMarkup },
    bundlePct: bundle.discountPct / 100,
  });

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
  triggers.push(...belowFloorTriggers(tiers), ...overrideTriggers(tiers));
  if (inputs.floorOverride) {
    triggers.push({ code: "FLOOR_OVERRIDE", message: "Floor overridden — actual below-floor rate in use" });
  }
  if (tiers.some((tier) => tier.discountCappedAtCost)) {
    triggers.push({
      code: "DISCOUNT_CAPPED_AT_COST",
      message: "Bundle discount capped at tool cost",
    });
  }

  return {
    model: "MARKUP_MULTIPLE",
    inputs,
    bundle,
    multiplier: markup,
    split: { toolPct, laborPct: 0, sgmPct: Math.max(100 - toolPct, 0) },
    tiers,
    deltas,
    floorRate,
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
    coManagedMarkup: 2.5,
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
