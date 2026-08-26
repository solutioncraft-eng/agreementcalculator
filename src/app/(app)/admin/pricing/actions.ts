"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { bundleSchema, cogsItemSchema, pricingModelSchema, slugify } from "@/lib/schemas";
import {
  SEED_COST_BASIS,
  SEED_PRICING_MODEL,
  SEED_VERSION_LABEL,
} from "@/lib/pricing/defaults";

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

async function editableVersion(versionId: string) {
  const version = await prisma.pricingVersion.findUnique({ where: { id: versionId } });
  if (!version) return { error: "That pricing version no longer exists." } as const;
  if (version.status !== "DRAFT") {
    return { error: "Published versions are immutable — create a new draft to change pricing." } as const;
  }
  return { version } as const;
}

/** Creates a draft, cloning the newest version's items so admins edit deltas. */
export async function createDraft(): Promise<void> {
  const user = await requireRole("ADMIN");

  const existingDraft = await prisma.pricingVersion.findFirst({ where: { status: "DRAFT" } });
  if (existingDraft) redirect(`/admin/pricing/${existingDraft.id}`);

  const source = await prisma.pricingVersion.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    include: { cogsItems: true, bundles: true },
  });

  const draft = await prisma.pricingVersion.create({
    data: {
      label: nextLabel(source?.label),
      costBasis: source?.costBasis ?? SEED_COST_BASIS,
      laborMultiplier: source?.laborMultiplier ?? SEED_PRICING_MODEL.laborMultiplier,
      defaultSgmPct: source?.defaultSgmPct ?? SEED_PRICING_MODEL.defaultSgmPct,
      maxSgmPct: source?.maxSgmPct ?? SEED_PRICING_MODEL.maxSgmPct,
      minPerUserFloor: source?.minPerUserFloor ?? SEED_PRICING_MODEL.minPerUserFloor,
      addonMultiplier: source?.addonMultiplier ?? SEED_PRICING_MODEL.addonMultiplier,
      createdById: user.id,
      cogsItems: source
        ? {
            create: source.cogsItems.map((item) => ({
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
    actor: user,
  });

  redirect(`/admin/pricing/${draft.id}`);
}

export async function updateModel(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const found = await editableVersion(versionId);
  if ("error" in found) return { error: found.error };

  const parsed = pricingModelSchema.safeParse({
    label: formData.get("label"),
    costBasis: formData.get("costBasis"),
    laborMultiplier: formData.get("laborMultiplier"),
    defaultSgmPct: formData.get("defaultSgmPct"),
    maxSgmPct: formData.get("maxSgmPct"),
    minPerUserFloor: formData.get("minPerUserFloor"),
    addonMultiplier: formData.get("addonMultiplier"),
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the pricing model values." };

  const data = parsed.data;
  if (data.defaultSgmPct > data.maxSgmPct) {
    return { error: "Default service gross margin cannot exceed the maximum." };
  }

  const before = found.version;
  const duplicate = await prisma.pricingVersion.findFirst({
    where: { label: data.label, id: { not: versionId } },
  });
  if (duplicate) return { error: `Version label ${data.label} is already in use.` };

  await prisma.pricingVersion.update({
    where: { id: versionId },
    data: {
      label: data.label,
      costBasis: data.costBasis,
      notes: data.notes || null,
      laborMultiplier: data.laborMultiplier,
      defaultSgmPct: data.defaultSgmPct,
      maxSgmPct: data.maxSgmPct,
      minPerUserFloor: data.minPerUserFloor,
      addonMultiplier: data.addonMultiplier,
    },
  });

  await audit({
    action: "VERSION_UPDATED",
    entity: "PricingVersion",
    entityId: versionId,
    summary: `Pricing model updated on draft ${data.label}`,
    before: {
      label: before.label,
      costBasis: before.costBasis,
      laborMultiplier: before.laborMultiplier.toString(),
      defaultSgmPct: before.defaultSgmPct.toString(),
      maxSgmPct: before.maxSgmPct.toString(),
      minPerUserFloor: before.minPerUserFloor.toString(),
      addonMultiplier: before.addonMultiplier.toString(),
    },
    after: { ...data },
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  return { ok: "Pricing model saved." };
}

export async function saveCogsItem(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const found = await editableVersion(versionId);
  if ("error" in found) return { error: found.error };

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
    const before = await prisma.cogsItem.findUnique({ where: { id: itemId } });
    if (!before || before.versionId !== versionId) return { error: "That item is not part of this draft." };
    await prisma.cogsItem.update({
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
      summary: `COGS item "${data.label}" updated on draft ${found.version.label}`,
      before: {
        label: before.label,
        unit: before.unit,
        tier: before.tier,
        unitCost: before.unitCost.toString(),
        active: before.active,
      },
      after: { ...data },
      actor: user,
    });
  } else {
    const base = slugify(data.label);
    const taken = await prisma.cogsItem.findMany({
      where: { versionId, key: { startsWith: base } },
      select: { key: true },
    });
    const key = taken.some((t) => t.key === base) ? `${base}-${taken.length + 1}` : base;

    await prisma.cogsItem.create({
      data: {
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
      summary: `COGS item "${data.label}" added to draft ${found.version.label} (${data.unit.toLowerCase()} basis)`,
      after: { ...data, key },
      actor: user,
    });
  }

  revalidatePath(`/admin/pricing/${versionId}`);
  return { ok: itemId ? "Item updated." : `Added ${data.label}.` };
}

export async function deleteCogsItem(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const found = await editableVersion(versionId);
  if ("error" in found) return { error: found.error };

  const item = await prisma.cogsItem.findUnique({ where: { id: itemId } });
  if (!item || item.versionId !== versionId) return { error: "That item is not part of this draft." };

  await prisma.cogsItem.delete({ where: { id: itemId } });
  await audit({
    action: "COGS_ITEM_DELETED",
    entity: "CogsItem",
    entityId: item.key,
    summary: `COGS item "${item.label}" removed from draft ${found.version.label}`,
    before: { label: item.label, unit: item.unit, tier: item.tier, unitCost: item.unitCost.toString() },
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  return { ok: `Removed ${item.label}.` };
}

export async function saveBundle(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const found = await editableVersion(versionId);
  if ("error" in found) return { error: found.error };

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

  await prisma.bundleDiscount.upsert({
    where: { versionId_key: { versionId, key: data.key } },
    create: {
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
    summary: `Bundle "${data.label}" set to ${data.discountPct}% on draft ${found.version.label}`,
    after: { ...data },
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  return { ok: `Saved ${data.label}.` };
}

export async function deleteBundle(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const key = String(formData.get("key") ?? "");
  const found = await editableVersion(versionId);
  if ("error" in found) return { error: found.error };

  await prisma.bundleDiscount.deleteMany({ where: { versionId, key } });
  await audit({
    action: "BUNDLE_UPDATED",
    entity: "BundleDiscount",
    entityId: key,
    summary: `Bundle "${key}" removed from draft ${found.version.label}`,
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  return { ok: "Bundle removed." };
}

export async function publishVersion(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const found = await editableVersion(versionId);
  if ("error" in found) return { error: found.error };

  const items = await prisma.cogsItem.count({ where: { versionId, active: true } });
  if (items === 0) return { error: "Add at least one active COGS item before publishing." };

  const previous = await prisma.pricingVersion.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
  });

  await prisma.$transaction([
    ...(previous
      ? [prisma.pricingVersion.update({ where: { id: previous.id }, data: { status: "ARCHIVED" } })]
      : []),
    prisma.pricingVersion.update({
      where: { id: versionId },
      data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: user.id },
    }),
  ]);

  await audit({
    action: "VERSION_PUBLISHED",
    entity: "PricingVersion",
    entityId: versionId,
    summary: `Pricing version ${found.version.label} published${previous ? ` (replaces ${previous.label})` : ""}`,
    after: { label: found.version.label, items },
    actor: user,
  });

  revalidatePath("/admin/pricing");
  revalidatePath(`/admin/pricing/${versionId}`);
  revalidatePath("/calculator");
  return { ok: `${found.version.label} is live. It is now immutable.` };
}
