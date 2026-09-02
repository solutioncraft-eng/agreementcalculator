/**
 * Pricing model registry. Everything outside this directory calls
 * {@link calculate} or reads {@link PRICING_MODELS}; nothing branches on the
 * model key, so a new model is one file plus one entry here.
 */
import { z } from "zod";
import type {
  CalcInputs,
  CalcResult,
  CostPlusSettings,
  MarkupSettings,
  ModelSettings,
  PricingConfig,
  PricingModelKey,
} from "@/lib/pricing/engine";
import { costPlusModel } from "@/lib/pricing/models/cost-plus";
import { markupModel } from "@/lib/pricing/models/markup";

export const costPlusSettingsSchema = z.object({
  laborMultiplier: z.coerce.number().min(0).max(20),
  defaultSgmPct: z.coerce.number().min(0).max(95),
  maxSgmPct: z.coerce.number().min(1).max(95),
  minPerUserFloor: z.coerce.number().min(0).max(10_000),
  addonMultiplier: z.coerce.number().min(1).max(20),
  // Defaulted so versions stored before the lever existed still parse.
  coManagedLaborMultiplier: z.coerce.number().min(0).max(20).default(1),
});

export const markupSettingsSchema = z.object({
  defaultMarkup: z.coerce.number().min(1).max(50),
  minMarkup: z.coerce.number().min(1).max(50),
  minPerUserFloor: z.coerce.number().min(0).max(10_000),
  maxDiscountPct: z.coerce.number().min(0).max(90),
  addonMarkup: z.coerce.number().min(1).max(50),
  coManagedMarkup: z.coerce.number().min(1).max(50).default(2.5),
});

export const pricingModelKeySchema = z.enum(["COST_PLUS", "MARKUP_MULTIPLE"]);

/** Admin-facing metadata and settings validation, keyed by model. */
export const PRICING_MODELS = {
  COST_PLUS: {
    ...costPlusModel,
    settingsSchema: costPlusSettingsSchema,
    /** Field label, step and hover hint for the admin form, in display order. */
    fields: [
      {
        name: "laborMultiplier",
        label: "Labor multiplier",
        suffix: "×",
        step: "0.01",
        hint: "Imputed labor on a fully managed offering, as a multiple of its tool cost. Tool + labor is the cost floor no quote can go under. 1.0 means labor equals tool cost; 3.1 means it is a little over three times tool cost. Set it from what your team's time actually costs per dollar of tooling.",
      },
      {
        name: "defaultSgmPct",
        label: "Default service gross margin",
        suffix: "%",
        step: "0.5",
        hint: "Where the SGM slider starts in the Calculator. The rate is (tool + labor) ÷ (1 − SGM), so 50% doubles the cost floor. Any quote priced at a different margin is flagged for review.",
      },
      {
        name: "maxSgmPct",
        label: "Maximum service gross margin",
        suffix: "%",
        step: "0.5",
        hint: "The highest margin an account manager can dial to. The Calculator slider stops here. Keep it above the default and below anything the market would reject.",
      },
      {
        name: "minPerUserFloor",
        label: "Minimum per-user floor",
        suffix: "$",
        step: "1",
        hint: "The lowest monthly rate per user the workspace will sell, and where the Calculator's floor field starts. Small environments whose calculated rate lands under it are charged the floor and flagged. Set it to the minimum a seat is worth supporting for.",
      },
      {
        name: "addonMultiplier",
        label: "Add-on multiplier",
        suffix: "×",
        step: "0.01",
        hint: "Applied to the tool cost of the items an offering adds on top of the offering it builds on. Add-on tools carry no imputed labor, so this is usually lower than the main lever produces. 4.83 turns a $10 add-on tool into $48.30. Changing it in a quote triggers review.",
      },
      {
        name: "coManagedLaborMultiplier",
        label: "Co-managed labor multiplier",
        suffix: "×",
        step: "0.01",
        hint: "Replaces the labor multiplier on the base tools of an offering marked co-managed (and the offerings built on it). The client's own IT staff carry part of the work, so set it lower — for example 1.0 when your team does roughly a third of what a fully managed client needs at 3.1.",
      },
    ],
  },
  MARKUP_MULTIPLE: {
    ...markupModel,
    settingsSchema: markupSettingsSchema,
    fields: [
      {
        name: "defaultMarkup",
        label: "Default markup",
        suffix: "×",
        step: "0.01",
        hint: "Where the markup field starts in the Calculator. The rate is tool cost × markup, so 2.5 sells a $40 tool stack for $100. Quotes below the default are flagged for review; higher is not.",
      },
      {
        name: "minMarkup",
        label: "Minimum markup before review",
        suffix: "×",
        step: "0.01",
        hint: "Below this multiple a quote is flagged as under the minimum, on top of the below-default flag. Set it at the lowest multiple that still covers your labor.",
      },
      {
        name: "minPerUserFloor",
        label: "Minimum per-user floor",
        suffix: "$",
        step: "1",
        hint: "The lowest monthly rate per user the workspace will sell, and where the Calculator's floor field starts. Small environments whose calculated rate lands under it are charged the floor and flagged. Set it to the minimum a seat is worth supporting for.",
      },
      {
        name: "maxDiscountPct",
        label: "Maximum discount",
        suffix: "%",
        step: "0.5",
        hint: "A bundle discount larger than this percentage flags the quote for review. Discounts can never take a rate below tool cost regardless.",
      },
      {
        name: "addonMarkup",
        label: "Add-on markup",
        suffix: "×",
        step: "0.01",
        hint: "Applied to the tool cost of the items an offering adds on top of the offering it builds on. Add-on tools are low-touch, so this is usually lower than the default markup. Fixed per version; the Calculator cannot change it.",
      },
      {
        name: "coManagedMarkup",
        label: "Co-managed markup",
        suffix: "×",
        step: "0.01",
        hint: "Replaces the Calculator's markup on the base tools of an offering marked co-managed (and the offerings built on it). The client's own IT staff carry part of the work, so set it lower than the default markup. Fixed per version.",
      },
    ],
  },
} as const;

export const PRICING_MODEL_KEYS = Object.keys(PRICING_MODELS) as PricingModelKey[];

/** Validates and normalises a settings blob read from the database or a form. */
export function parseSettings(model: PricingModelKey, value: unknown): ModelSettings {
  return model === "COST_PLUS"
    ? costPlusSettingsSchema.parse(value)
    : markupSettingsSchema.parse(value);
}

/** Settings keyed by field name, for the model-agnostic admin form. */
export function settingsRecord(model: PricingModelKey, value: unknown): Record<string, number> {
  const settings = parseSettings(model, value);
  return Object.fromEntries(Object.entries(settings));
}

export function defaultSettings(model: PricingModelKey): ModelSettings {
  return PRICING_MODELS[model].defaults;
}

/** Inputs a fresh quote starts from under the config's model. */
export function startingInputs(config: PricingConfig): Omit<CalcInputs, "users" | "devices" | "locations"> {
  return config.model === "COST_PLUS"
    ? costPlusModel.startingInputs(config.settings)
    : markupModel.startingInputs(config.settings);
}

/** Runs the config's model. The only dispatch point in the codebase. */
export function calculate(config: PricingConfig, inputs: CalcInputs): CalcResult {
  return config.model === "COST_PLUS"
    ? costPlusModel.calculate(config, inputs)
    : markupModel.calculate(config, inputs);
}

export function isCostPlus(settings: ModelSettings): settings is CostPlusSettings {
  return "laborMultiplier" in settings;
}

export function isMarkup(settings: ModelSettings): settings is MarkupSettings {
  return "defaultMarkup" in settings;
}
