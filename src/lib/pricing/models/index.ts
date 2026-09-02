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
    /** Field label and step for the admin form, in display order. */
    fields: [
      { name: "laborMultiplier", label: "Labor multiplier", suffix: "×", step: "0.01" },
      { name: "defaultSgmPct", label: "Default service gross margin", suffix: "%", step: "0.5" },
      { name: "maxSgmPct", label: "Maximum service gross margin", suffix: "%", step: "0.5" },
      { name: "minPerUserFloor", label: "Minimum per-user floor", suffix: "$", step: "1" },
      { name: "addonMultiplier", label: "Add-on multiplier", suffix: "×", step: "0.01" },
      { name: "coManagedLaborMultiplier", label: "Co-managed labor multiplier", suffix: "×", step: "0.01" },
    ],
  },
  MARKUP_MULTIPLE: {
    ...markupModel,
    settingsSchema: markupSettingsSchema,
    fields: [
      { name: "defaultMarkup", label: "Default markup", suffix: "×", step: "0.01" },
      { name: "minMarkup", label: "Minimum markup before review", suffix: "×", step: "0.01" },
      { name: "minPerUserFloor", label: "Minimum per-user floor", suffix: "$", step: "1" },
      { name: "maxDiscountPct", label: "Maximum discount", suffix: "%", step: "0.5" },
      { name: "addonMarkup", label: "Add-on markup", suffix: "×", step: "0.01" },
      { name: "coManagedMarkup", label: "Co-managed markup", suffix: "×", step: "0.01" },
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
