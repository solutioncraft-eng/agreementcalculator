import { z } from "zod";

/** A ServiceTier.key, unique within the pricing version that defines it. */
export const tierKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Use letters, numbers, dashes or underscores");
export const unitSchema = z.enum(["USER", "DEVICE", "LOCATION", "FLAT"]);

export const calcInputsSchema = z.object({
  users: z.coerce.number().int().min(1).max(100_000),
  devices: z.coerce.number().int().min(0).max(200_000),
  locations: z.coerce.number().int().min(0).max(5_000),
  sgmPct: z.coerce.number().min(0).max(95),
  perUserFloor: z.coerce.number().min(0).max(10_000),
  floorOverride: z.coerce.boolean(),
  addonMultiplier: z.coerce.number().min(1).max(20),
  markupMultiple: z.coerce.number().min(1).max(50),
  bundleKey: z.string().min(1).max(64),
});

export const exportPayloadSchema = z.object({
  docType: z.enum(["QUOTE", "COGS"]),
  tierKey: tierKeySchema,
  clientName: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  quoteId: z.string().trim().min(1).max(64).optional().or(z.literal("")),
  inputs: calcInputsSchema.optional(),
});

export const submitQuoteSchema = z.object({
  clientName: z.string().trim().min(2, "Client name is required").max(120),
  notes: z.string().trim().max(2000).optional(),
  requestedTierKey: tierKeySchema,
  inputs: calcInputsSchema,
});

export const reviewDecisionSchema = z.object({
  quoteId: z.string().min(1),
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "DENIED", "COMMENTED"]),
  comment: z.string().trim().max(2000).optional(),
});

export const cogsItemSchema = z.object({
  label: z.string().trim().min(2).max(80),
  vendor: z.string().trim().max(80).optional().or(z.literal("")),
  unit: unitSchema,
  tierKey: tierKeySchema,
  unitCost: z.coerce.number().min(0).max(100_000),
  active: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

/**
 * A version's own metadata. The pricing numbers are model-specific and live
 * behind the model's settings schema in `@/lib/pricing/models`.
 */
export const versionMetaSchema = z.object({
  label: z.string().trim().min(1).max(40),
  costBasis: z.string().trim().min(1).max(60),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const tenantBrandingSchema = z.object({
  name: z.string().trim().min(2).max(80),
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour such as #F26B21")
    .optional()
    .or(z.literal("")),
  pdfFooter: z.string().trim().max(200).optional().or(z.literal("")),
});

/** One offering on a draft pricing version. */
export const serviceTierSchema = z.object({
  label: z.string().trim().min(2, "Name the offering.").max(40),
  description: z.string().trim().max(120).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

/**
 * Every offering's rate as stored on a submitted quote. Read back through this
 * schema so the review screen never has to trust the JSON column's shape.
 */
export const quoteTierRatesSchema = z
  .array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      rate: z.coerce.number(),
      perUser: z.coerce.number(),
    }),
  )
  .min(1);

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/, "Use 3-32 lowercase letters, numbers or dashes"),
  pricingModel: z.enum(["COST_PLUS", "MARKUP_MULTIPLE"]),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminName: z.string().trim().min(2).max(80),
  seedPricing: z.coerce.boolean().optional(),
});

export const bundleSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, "Use lowercase letters, numbers, dashes or underscores"),
  label: z.string().trim().min(2).max(60),
  description: z.string().trim().max(160).optional().or(z.literal("")),
  discountPct: z.coerce.number().min(0).max(90),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

/// Slug used as the stable COGS item key inside a pricing version.
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
