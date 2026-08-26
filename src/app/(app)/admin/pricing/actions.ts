"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { bundleSchema, cogsItemSchema, slugify, versionMetaSchema } from "@/lib/schemas";
import {
  PRICING_MODELS,
  costPlusSettingsSchema,
  markupSettingsSchema,
  parseSettings,
} from "@/lib/pricing/models";
import { SEED_COST_BASIS, SEED_VERSION_LABEL } from "@/lib/pricing/defaults";

export interface AdminState {
  error?: string;
  ok?: string;
}

/// Next label: bumps the trailing number of the newest label, e.g. 2026.3 → 2026.4.
function nextLabel(previous?: string): string {
  if (!previous) return SEED_VERSION_LABEL;
  const match = /^(.*?)(\d+)$/.exec(previous);
  if (!match) return `${previous}.1`;
  return `${match[1]}${Number(match[2]) + 1}`;
}

/** Creates a draft, cloning the newest version's items so admins edit deltas. */
export async function createDraft(): Promise<void> {
  const { user, tenant, db } = await requireRole("ADMIN");

  const existingDraft = await db.pricingVersion.findFirst({ where: { status: "DRAFT" } });
  if (existingDraft) redirect(`/admin/pricing/${existingDraft.id}`);

  const source = await db.pricingVersion.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    include: { cogsItems: true, bundles: true },
  });

  const draft = await db.pricingVersion.create({
    data: {
      tenantId: tenant.id,
      label: nextLabel(source?.label),
      costBasis: source?.costBasis ?? SEED_COST_BASIS,
      // A draft inherits the workspace's model, and its settings from the
      // version it clones, so tuning a number never changes the model.
      model: tenant.pricingModel,
      settings:
        source && source.model === tenant.pricingModel
          ? parseSettings(source.model, source.settings)
          : PRICING_MODELS[tenant.pricingModel].defaults,
      createdById: user.id,
      cogsItems: source
        ? {
            create: source.cogsItems.map((item) => ({
              tenantId: tenant.id,
              key: item.key,
              label: item.label,
              vendor: item.vendor,
              unit: item.unit,
              tier: item.tier,
              unitCost: item.unitCost,
              active: item.active,
              sortOrder: item.sortOrder,
            })),
          }
        : undefined,
      bundles: source
        ? {
            create: source.bundles.map((bundle) => ({
              tenantId: tenant.id,
              key: bundle.key,
              label: bundle.label,
              description: bundle.description,
              discountPct: bundle.discountPct,
              highlight: bundle.highlight,
              sortOrder: bundle.sortOrder,
            })),
          }
        : undefined,
    },
  });

  await audit({
    action: "VERSION_DRAFT_CREATED",
    entity: "PricingVersion",
    entityId: draft.id,
    summary: `Pricing draft ${draft.label} created${source ? ` from ${source.label}` : ""}`,
    tenantId: tenant.id,
    actor: user,
  });

  redirect(`/admin/pricing/${draft.id}`);
}

export async function updateVersion(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { user, tenant, db } = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");

  const version = await db.pricingVersion.findUnique({ where: { id: versionId } });
  if (!version) return { error: "That pricing version no longer exists." };
  if (version.status !== "DRAFT") {
    return { error: "Published versions are immutable — create a new draft to change pricing." };
  }

  const meta = versionMetaSchema.safeParse({
    label: formData.get("label"),
    costBasis: formData.get("costBasis"),
    notes: formData.get("notes") ?? undefined,
  });
  if (!meta.success) return { error: meta.error.issues[0]?.message ?? "Check the version details." };

  // Only the fields this model actually has are read from the form.
  const raw: Record<string, FormDataEntryValue | null> = {};
  for (const field of PRICING_MODELS[version.model].fields) raw[field.name] = formData.get(field.name);

  const settings =
    version.model === "COST_PLUS"
      ? costPlusSettingsSchema.safeParse(raw)
      : markupSettingsSchema.safeParse(raw);
  if (!settings.success) {
    return { error: settings.error.issues[0]?.message ?? "Check the pricing settings." };
  }

  if ("defaultSgmPct" in settings.data && settings.data.defaultSgmPct > settings.data.maxSgmPct) {
    return { error: "Default service gross margin cannot exceed the maximum." };
  }
  if ("defaultMarkup" in settings.data && settings.data.minMarkup > settings.data.defaultMarkup) {
    return { error: "Minimum markup cannot exceed the default markup." };
  }

  const duplicate = await db.pricingVersion.findFirst({
    where: { label: meta.data.label, id: { not: versionId } },
  });
  if (duplicate) return { error: `Version label ${meta.data.label} is already in use.` };

  await db.pricingVersion.update({
    where: { id: versionId },
    data: {
      label: meta.data.label,
      costBasis: meta.data.costBasis,
      notes: meta.data.notes || null,
      settings: settings.data,
    },
  });

  await audit({
    action: "VERSION_UPDATED",
    entity: "PricingVersion",
    entityId: versionId,
    summary: `Pricing settings updated on draft ${meta.data.label}`,
    before: { label: version.label, costBasis: version.costBasis, settings: version.settings ?? {} },
    after: { ...meta.data, settings: settings.data },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  return { ok: "Pricing settings saved." };
}

export async function saveCogsItem(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { user, tenant, db } = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");

  const version = await db.pricingVersion.findUnique({ where: { id: versionId } });
  if (!version) return { error: "That pricing version no longer exists." };
  if (version.status !== "DRAFT") {
    return { error: "Published versions are immutable — create a new draft to change pricing." };
  }

  const parsed = cogsItemSchema.safeParse({
    label: formData.get("label"),
    vendor: formData.get("vendor") ?? undefined,
    unit: formData.get("unit"),
    tier: formData.get("tier"),
    unitCost: formData.get("unitCost"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the COGS item values." };
  const data = parsed.data;

  if (itemId) {
    const before = await db.cogsItem.findUnique({ where: { id: itemId } });
    if (!before || before.versionId !== versionId) return { error: "That item is not part of this draft." };
    await db.cogsItem.update({
      where: { id: itemId },
      data: {
        label: data.label,
        vendor: data.vendor || null,
        unit: data.unit,
        tier: data.tier,
        unitCost: data.unitCost,
        active: data.active ?? true,
        sortOrder: data.sortOrder ?? before.sortOrder,
      },
    });
    await audit({
      action: "COGS_ITEM_UPDATED",
      entity: "CogsItem",
      entityId: itemId,
      summary: `COGS item "${data.label}" updated on draft ${version.label}`,
      before: {
        label: before.label,
        unit: before.unit,
        tier: before.tier,
        unitCost: before.unitCost.toString(),
        active: before.active,
      },
      after: { ...data },
      tenantId: tenant.id,
      actor: user,
    });
  } else {
    const base = slugify(data.label);
    const taken = await db.cogsItem.findMany({
      where: { versionId, key: { startsWith: base } },
      select: { key: true },
    });
    const key = taken.some((t) => t.key === base) ? `${base}-${taken.length + 1}` : base;

    await db.cogsItem.create({
      data: {
        tenantId: tenant.id,
        versionId,
        key,
        label: data.label,
        vendor: data.vendor || null,
        unit: data.unit,
        tier: data.tier,
        unitCost: data.unitCost,
        active: data.active ?? true,
        sortOrder: data.sortOrder ?? 100,
      },
    });
    await audit({
      action: "COGS_ITEM_CREATED",
      entity: "CogsItem",
      entityId: key,
      summary: `COGS item "${data.label}" added to draft ${version.label} (${data.unit.toLowerCase()} basis)`,
      after: { ...data, key },
      tenantId: tenant.id,
      actor: user,
    });
  }

  revalidatePath(`/admin/pricing/${versionId}`);
  return { ok: itemId ? "Item updated." : `Added ${data.label}.` };
}

export async function deleteCogsItem(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { user, tenant, db } = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");

  const version = await db.pricingVersion.findUnique({ where: { id: versionId } });
  if (!version) return { error: "That pricing version no longer exists." };
  if (version.status !== "DRAFT") {
    return { error: "Published versions are immutable — create a new draft to change pricing." };
  }

  const item = await db.cogsItem.findUnique({ where: { id: itemId } });
  if (!item || item.versionId !== versionId) return { error: "That item is not part of this draft." };

  await db.cogsItem.delete({ where: { id: itemId } });
  await audit({
    action: "COGS_ITEM_DELETED",
    entity: "CogsItem",
    entityId: item.key,
    summary: `COGS item "${item.label}" removed from draft ${version.label}`,
    before: { label: item.label, unit: item.unit, tier: item.tier, unitCost: item.unitCost.toString() },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  return { ok: `Removed ${item.label}.` };
}

export async function saveBundle(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { user, tenant, db } = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");

  const version = await db.pricingVersion.findUnique({ where: { id: versionId } });
  if (!version) return { error: "That pricing version no longer exists." };
  if (version.status !== "DRAFT") {
    return { error: "Published versions are immutable — create a new draft to change pricing." };
  }

  const parsed = bundleSchema.safeParse({
    key: formData.get("key"),
    label: formData.get("label"),
    description: formData.get("description") ?? undefined,
    discountPct: formData.get("discountPct"),
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the bundle values." };
  const data = parsed.data;
  if (data.key === "none") return { error: '"none" is reserved for the no-bundle option.' };

  await db.bundleDiscount.upsert({
    where: { versionId_key: { versionId, key: data.key } },
    create: {
      tenantId: tenant.id,
      versionId,
      key: data.key,
      label: data.label,
      description: data.description || null,
      discountPct: data.discountPct,
      sortOrder: data.sortOrder ?? 0,
    },
    update: {
      label: data.label,
      description: data.description || null,
      discountPct: data.discountPct,
      sortOrder: data.sortOrder ?? 0,
    },
  });

  await audit({
    action: "BUNDLE_UPDATED",
    entity: "BundleDiscount",
    entityId: data.key,
    summary: `Bundle "${data.label}" set to ${data.discountPct}% on draft ${version.label}`,
    after: { ...data },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  return { ok: `Saved ${data.label}.` };
}

export async function deleteBundle(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { user, tenant, db } = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const key = String(formData.get("key") ?? "");

  const version = await db.pricingVersion.findUnique({ where: { id: versionId } });
  if (!version) return { error: "That pricing version no longer exists." };
  if (version.status !== "DRAFT") {
    return { error: "Published versions are immutable — create a new draft to change pricing." };
  }

  await db.bundleDiscount.deleteMany({ where: { versionId, key } });
  await audit({
    action: "BUNDLE_UPDATED",
    entity: "BundleDiscount",
    entityId: key,
    summary: `Bundle "${key}" removed from draft ${version.label}`,
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  return { ok: "Bundle removed." };
}

export async function publishVersion(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { user, tenant, db } = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");

  const version = await db.pricingVersion.findUnique({ where: { id: versionId } });
  if (!version) return { error: "That pricing version no longer exists." };
  if (version.status !== "DRAFT") {
    return { error: "Published versions are immutable — create a new draft to change pricing." };
  }

  const items = await db.cogsItem.count({ where: { versionId, active: true } });
  if (items === 0) return { error: "Add at least one active COGS item before publishing." };

  const previous = await db.pricingVersion.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
  });

  await db.$transaction([
    ...(previous
      ? [db.pricingVersion.update({ where: { id: previous.id }, data: { status: "ARCHIVED" } })]
      : []),
    db.pricingVersion.update({
      where: { id: versionId },
      data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: user.id },
    }),
  ]);

  await audit({
    action: "VERSION_PUBLISHED",
    entity: "PricingVersion",
    entityId: versionId,
    summary: `Pricing version ${version.label} published${previous ? ` (replaces ${previous.label})` : ""}`,
    after: { label: version.label, items },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath("/admin/pricing");
  revalidatePath(`/admin/pricing/${versionId}`);
  revalidatePath("/calculator");
  return { ok: `${version.label} is live. It is now immutable.` };
}
