"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import type { TenantDb } from "@/lib/db";
import {
  bundleSchema,
  cogsItemSchema,
  serviceTierSchema,
  slugify,
  versionMetaSchema,
} from "@/lib/schemas";
import {
  PRICING_MODELS,
  costPlusSettingsSchema,
  markupSettingsSchema,
  parseSettings,
} from "@/lib/pricing/models";
import { SEED_COST_BASIS, SEED_SERVICE_TIERS, SEED_VERSION_LABEL } from "@/lib/pricing/defaults";

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
    include: { serviceTiers: true, cogsItems: { include: { tiers: true } }, bundles: true },
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
      // The offerings are cloned with the items, so a draft opens with the
      // ladder the published version sells and the admin edits from there.
      serviceTiers: {
        create: (source?.serviceTiers.length
          ? source.serviceTiers.map((tier) => ({
              key: tier.key,
              label: tier.label,
              description: tier.description,
              parentKey: tier.parentKey,
              sortOrder: tier.sortOrder,
              coManaged: tier.coManaged,
              overridePerUser: tier.overridePerUser,
              overridePerDevice: tier.overridePerDevice,
              overridePerLocation: tier.overridePerLocation,
              overrideFlat: tier.overrideFlat,
            }))
          : SEED_SERVICE_TIERS.map((tier, index) => ({ ...tier, sortOrder: index }))
        ).map((tier) => ({ ...tier, tenantId: tenant.id })),
      },
      cogsItems: source
        ? {
            create: source.cogsItems.map((item) => ({
              tenantId: tenant.id,
              key: item.key,
              label: item.label,
              vendor: item.vendor,
              unit: item.unit,
              unitCost: item.unitCost,
              active: item.active,
              sortOrder: item.sortOrder,
              // Which offerings use the item is part of the pricing, so it is
              // cloned with it rather than re-derived.
              tiers: {
                create: item.tiers.map((membership) => ({
                  tenantId: tenant.id,
                  tierKey: membership.tierKey,
                })),
              },
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
    tierKeys: formData.getAll("tierKeys").map(String).filter(Boolean),
    unitCost: formData.get("unitCost"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the COGS item values." };
  const data = parsed.data;
  const tierKeys = [...new Set(data.tierKeys)];

  // An item may only be allocated to offerings this same draft defines.
  const tiers = await db.serviceTier.findMany({ where: { versionId, key: { in: tierKeys } } });
  if (tiers.length !== tierKeys.length) {
    return { error: "Choose offerings that are part of this draft." };
  }

  if (itemId) {
    const before = await db.cogsItem.findUnique({
      where: { id: itemId },
      include: { tiers: true },
    });
    if (!before || before.versionId !== versionId) return { error: "That item is not part of this draft." };
    const beforeKeys = before.tiers.map((membership) => membership.tierKey);
    await db.$transaction([
      db.cogsItem.update({
        where: { id: itemId },
        data: {
          label: data.label,
          vendor: data.vendor || null,
          unit: data.unit,
          unitCost: data.unitCost,
          active: data.active ?? true,
          sortOrder: data.sortOrder ?? before.sortOrder,
        },
      }),
      db.cogsItemTier.deleteMany({
        where: { itemId, tierKey: { notIn: tierKeys } },
      }),
      ...tierKeys
        .filter((tierKey) => !beforeKeys.includes(tierKey))
        .map((tierKey) =>
          db.cogsItemTier.create({ data: { tenantId: tenant.id, itemId, tierKey } }),
        ),
    ]);
    await audit({
      action: "COGS_ITEM_UPDATED",
      entity: "CogsItem",
      entityId: itemId,
      summary: `COGS item "${data.label}" updated on draft ${version.label}`,
      before: {
        label: before.label,
        unit: before.unit,
        tierKeys: beforeKeys,
        unitCost: before.unitCost.toString(),
        active: before.active,
      },
      after: { ...data, tierKeys },
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
        unitCost: data.unitCost,
        active: data.active ?? true,
        sortOrder: data.sortOrder ?? 100,
        tiers: {
          create: tierKeys.map((tierKey) => ({ tenantId: tenant.id, tierKey })),
        },
      },
    });
    await audit({
      action: "COGS_ITEM_CREATED",
      entity: "CogsItem",
      entityId: key,
      summary: `COGS item "${data.label}" added to draft ${version.label} (${data.unit.toLowerCase()} basis)`,
      after: { ...data, key, tierKeys },
      tenantId: tenant.id,
      actor: user,
    });
  }

  revalidatePath(`/admin/pricing/${versionId}`);
  const uncarried =
    tierKeys.length === 0 && data.active !== false
      ? ` No offering carries ${data.label} — assign or deactivate it before publishing.`
      : "";
  return { ok: (itemId ? "Item updated." : `Added ${data.label}.`) + uncarried };
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

  const item = await db.cogsItem.findUnique({ where: { id: itemId }, include: { tiers: true } });
  if (!item || item.versionId !== versionId) return { error: "That item is not part of this draft." };

  await db.cogsItem.delete({ where: { id: itemId } });
  await audit({
    action: "COGS_ITEM_DELETED",
    entity: "CogsItem",
    entityId: item.key,
    summary: `COGS item "${item.label}" removed from draft ${version.label}`,
    before: {
      label: item.label,
      unit: item.unit,
      tierKeys: item.tiers.map((membership) => membership.tierKey),
      unitCost: item.unitCost.toString(),
    },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  return { ok: `Removed ${item.label}.` };
}

/**
 * Sets the COGS items an offering carries itself, without touching the items'
 * other offerings. This is how an offering with an empty stack — newly added,
 * or just decoupled from the offering it used to build on — gets its costing.
 */
export async function setTierItems(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { user, tenant, db } = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const tierKey = String(formData.get("tierKey") ?? "");
  const chosen = new Set(formData.getAll("itemIds").map(String).filter(Boolean));

  const version = await db.pricingVersion.findUnique({ where: { id: versionId } });
  if (!version) return { error: "That pricing version no longer exists." };
  if (version.status !== "DRAFT") {
    return { error: "Published versions are immutable — create a new draft to change pricing." };
  }

  const tier = await db.serviceTier.findFirst({ where: { versionId, key: tierKey } });
  if (!tier) return { error: "That offering is not part of this draft." };

  const change = await setOwnItems(db, tenant.id, versionId, tierKey, chosen);
  if ("error" in change) return change;
  if (!change.changed) return { ok: `${tier.label} already carries exactly those items.` };

  await audit({
    action: "SERVICE_TIER_UPDATED",
    entity: "ServiceTier",
    entityId: tier.key,
    summary: `Offering "${tier.label}" now carries ${chosen.size} COGS item${
      chosen.size === 1 ? "" : "s"
    } of its own on draft ${version.label}`,
    before: { ownItems: change.before },
    after: { ownItems: change.after },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  return {
    ok: `${tier.label} carries ${chosen.size} item${chosen.size === 1 ? "" : "s"} of its own.`,
  };
}

interface OwnItemsChange {
  before: string[];
  after: string[];
  changed: boolean;
}

/**
 * Makes `tierKey` carry exactly `chosen` and nothing else, leaving every other
 * offering's memberships untouched. Reports the item keys either side of the
 * change so callers can audit it.
 */
async function setOwnItems(
  db: TenantDb,
  tenantId: string,
  versionId: string,
  tierKey: string,
  chosen: Set<string>,
): Promise<OwnItemsChange | { error: string }> {
  const items = await db.cogsItem.findMany({ where: { versionId }, include: { tiers: true } });
  if ([...chosen].some((id) => !items.some((item) => item.id === id))) {
    return { error: "Choose COGS items that are part of this draft." };
  }

  const carries = (item: (typeof items)[number]) =>
    item.tiers.some((membership) => membership.tierKey === tierKey);
  const added = items.filter((item) => chosen.has(item.id) && !carries(item));
  const removed = items.filter((item) => !chosen.has(item.id) && carries(item));
  const change: OwnItemsChange = {
    before: items.filter(carries).map((item) => item.key),
    after: items.filter((item) => chosen.has(item.id)).map((item) => item.key),
    changed: added.length > 0 || removed.length > 0,
  };
  if (!change.changed) return change;

  await db.$transaction([
    ...(removed.length > 0
      ? [db.cogsItemTier.deleteMany({ where: { tierKey, itemId: { in: removed.map((item) => item.id) } } })]
      : []),
    ...added.map((item) => db.cogsItemTier.create({ data: { tenantId, itemId: item.id, tierKey } })),
  ]);
  return change;
}

/**
 * True when following `parentKey` from `key` ever comes back to where it
 * started — the one arrangement of parents the engine cannot price.
 */
function hasParentCycle(links: Map<string, string | null>, key: string): boolean {
  const seen = new Set<string>();
  let current: string | null | undefined = key;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = links.get(current) ?? null;
  }
  return false;
}

/**
 * Adds or renames one of the draft's offerings, and sets the offering it builds
 * on. Keys are generated once and never rewritten, because COGS items and
 * submitted quotes point at them.
 */
export async function saveServiceTier(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { user, tenant, db } = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const tierId = String(formData.get("tierId") ?? "");

  const version = await db.pricingVersion.findUnique({ where: { id: versionId } });
  if (!version) return { error: "That pricing version no longer exists." };
  if (version.status !== "DRAFT") {
    return { error: "Published versions are immutable — create a new draft to change offerings." };
  }

  const parsed = serviceTierSchema.safeParse({
    label: formData.get("label"),
    description: formData.get("description") ?? undefined,
    parentKey: formData.get("parentKey") ?? undefined,
    coManaged: formData.get("coManaged") === "on",
    overridePerUser: formData.get("overridePerUser") ?? undefined,
    overridePerDevice: formData.get("overridePerDevice") ?? undefined,
    overridePerLocation: formData.get("overridePerLocation") ?? undefined,
    overrideFlat: formData.get("overrideFlat") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the offering." };
  const data = parsed.data;
  const parentKey = data.parentKey || null;
  // A zero component is the same as none, so the stored row reads cleanly.
  const pricing = {
    coManaged: data.coManaged,
    overridePerUser: data.overridePerUser || null,
    overridePerDevice: data.overridePerDevice || null,
    overridePerLocation: data.overridePerLocation || null,
    overrideFlat: data.overrideFlat || null,
  };
  // The form only submits memberships when it showed the item checklist, so an
  // ordinary rename never clears the offering's stack.
  const chosenItems = formData.has("chooseItems")
    ? new Set(formData.getAll("itemIds").map(String).filter(Boolean))
    : null;

  const tiers = await db.serviceTier.findMany({ where: { versionId }, orderBy: { sortOrder: "asc" } });

  if (parentKey && !tiers.some((tier) => tier.key === parentKey)) {
    return { error: "Build the offering on one this draft defines, or leave it standalone." };
  }

  if (tierId) {
    const before = tiers.find((tier) => tier.id === tierId);
    if (!before) return { error: "That offering is not part of this draft." };
    if (parentKey === before.key) return { error: "An offering cannot build on itself." };

    const links = new Map(tiers.map((tier) => [tier.key, tier.parentKey]));
    links.set(before.key, parentKey);
    if (hasParentCycle(links, before.key)) {
      return { error: `${data.label} would end up building on itself through its parents.` };
    }

    await db.serviceTier.update({
      where: { id: tierId },
      data: { label: data.label, description: data.description || null, parentKey, ...pricing },
    });
    const change = chosenItems
      ? await setOwnItems(db, tenant.id, versionId, before.key, chosenItems)
      : null;
    if (change && "error" in change) return change;
    await audit({
      action: "SERVICE_TIER_UPDATED",
      entity: "ServiceTier",
      entityId: before.key,
      summary: `Offering "${before.label}" updated to "${data.label}" on draft ${version.label}`,
      before: {
        label: before.label,
        description: before.description,
        parentKey: before.parentKey,
        coManaged: before.coManaged,
        overridePerUser: before.overridePerUser,
        overridePerDevice: before.overridePerDevice,
        overridePerLocation: before.overridePerLocation,
        overrideFlat: before.overrideFlat,
        ...(change ? { ownItems: change.before } : {}),
      },
      after: { ...data, parentKey, ...pricing, ...(change ? { ownItems: change.after } : {}) },
      tenantId: tenant.id,
      actor: user,
    });
    revalidatePath(`/admin/pricing/${versionId}`);
    return {
      ok: change
        ? `Offering updated — ${data.label} carries ${change.after.length} item${
            change.after.length === 1 ? "" : "s"
          } of its own.`
        : "Offering updated.",
    };
  }

  if (tiers.length >= 8) return { error: "Eight offerings is the most a version can hold." };

  const base = slugify(data.label) || "offering";
  const key = tiers.some((tier) => tier.key === base) ? `${base}-${tiers.length + 1}` : base;

  await db.serviceTier.create({
    data: {
      tenantId: tenant.id,
      versionId,
      key,
      label: data.label,
      description: data.description || null,
      parentKey,
      sortOrder: (tiers.at(-1)?.sortOrder ?? -1) + 1,
      ...pricing,
    },
  });
  const change = chosenItems ? await setOwnItems(db, tenant.id, versionId, key, chosenItems) : null;
  if (change && "error" in change) return change;
  await audit({
    action: "SERVICE_TIER_CREATED",
    entity: "ServiceTier",
    entityId: key,
    summary: `Offering "${data.label}" added to draft ${version.label}${
      parentKey ? `, building on ${tiers.find((tier) => tier.key === parentKey)?.label}` : " as a standalone offering"
    }`,
    after: { ...data, key, parentKey, ...pricing, ...(change ? { ownItems: change.after } : {}) },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  return {
    ok: change
      ? `Added ${data.label} carrying ${change.after.length} item${
          change.after.length === 1 ? "" : "s"
        } of its own.`
      : `Added ${data.label}.`,
  };
}

/** Moves an offering one step up or down the display order. */
export async function moveServiceTier(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { user, tenant, db } = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const tierId = String(formData.get("tierId") ?? "");
  const direction = formData.get("direction") === "up" ? -1 : 1;

  const version = await db.pricingVersion.findUnique({ where: { id: versionId } });
  if (!version) return { error: "That pricing version no longer exists." };
  if (version.status !== "DRAFT") {
    return { error: "Published versions are immutable — create a new draft to change offerings." };
  }

  const tiers = await db.serviceTier.findMany({ where: { versionId }, orderBy: { sortOrder: "asc" } });
  const index = tiers.findIndex((tier) => tier.id === tierId);
  const target = index + direction;
  if (index < 0) return { error: "That offering is not part of this draft." };
  if (target < 0 || target >= tiers.length) return { ok: "Already at the end of the list." };

  const reordered = [...tiers];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  await db.$transaction(
    reordered.map((tier, position) =>
      db.serviceTier.update({ where: { id: tier.id }, data: { sortOrder: position } }),
    ),
  );

  await audit({
    action: "SERVICE_TIER_UPDATED",
    entity: "ServiceTier",
    entityId: tiers[index].key,
    summary: `Offering "${tiers[index].label}" moved ${direction < 0 ? "up" : "down"} on draft ${version.label}`,
    after: { order: reordered.map((tier) => tier.key) },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  return { ok: "Order updated." };
}

export async function deleteServiceTier(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const { user, tenant, db } = await requireRole("ADMIN");
  const versionId = String(formData.get("versionId") ?? "");
  const tierId = String(formData.get("tierId") ?? "");

  const version = await db.pricingVersion.findUnique({ where: { id: versionId } });
  if (!version) return { error: "That pricing version no longer exists." };
  if (version.status !== "DRAFT") {
    return { error: "Published versions are immutable — create a new draft to change offerings." };
  }

  const tiers = await db.serviceTier.findMany({ where: { versionId }, orderBy: { sortOrder: "asc" } });
  const tier = tiers.find((row) => row.id === tierId);
  if (!tier) return { error: "That offering is not part of this draft." };
  if (tiers.length === 1) return { error: "A version needs at least one offering." };

  const children = tiers.filter((row) => row.parentKey === tier.key);
  if (children.length > 0) {
    return {
      error: `${children.map((row) => row.label).join(", ")} build${
        children.length === 1 ? "s" : ""
      } on ${tier.label} — point ${children.length === 1 ? "it" : "them"} elsewhere first.`,
    };
  }

  // Memberships point at the tier by key, so they are dropped here; an item
  // left with no offering is reported and publish refuses it until it has one.
  const memberships = await db.cogsItemTier.findMany({
    where: { tierKey: tier.key, item: { versionId } },
    include: { item: { include: { tiers: true } } },
  });
  const orphaned = memberships
    .filter((membership) => membership.item.active && membership.item.tiers.length === 1)
    .map((membership) => membership.item.label);

  await db.$transaction([
    db.cogsItemTier.deleteMany({ where: { tierKey: tier.key, item: { versionId } } }),
    db.serviceTier.delete({ where: { id: tierId } }),
    ...tiers
      .filter((row) => row.id !== tierId)
      .map((row, position) => db.serviceTier.update({ where: { id: row.id }, data: { sortOrder: position } })),
  ]);

  await audit({
    action: "SERVICE_TIER_DELETED",
    entity: "ServiceTier",
    entityId: tier.key,
    summary: `Offering "${tier.label}" removed from draft ${version.label}`,
    before: {
      label: tier.label,
      description: tier.description,
      parentKey: tier.parentKey,
      ownItems: memberships.map((membership) => membership.item.key),
    },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath(`/admin/pricing/${versionId}`);
  if (orphaned.length > 0) {
    return {
      ok: `Removed ${tier.label}. ${orphaned.join(", ")} ${
        orphaned.length === 1 ? "is" : "are"
      } now carried by no offering — assign or deactivate ${
        orphaned.length === 1 ? "it" : "them"
      } before publishing.`,
    };
  }
  return { ok: `Removed ${tier.label}.` };
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

  const tiers = await db.serviceTier.findMany({ where: { versionId } });
  if (tiers.length === 0) return { error: "Add at least one offering before publishing." };

  const activeItems = await db.cogsItem.findMany({
    where: { versionId, active: true },
    include: { tiers: true },
  });
  if (activeItems.length === 0) return { error: "Add at least one active COGS item before publishing." };

  const keys = new Set(tiers.map((tier) => tier.key));
  const orphan = activeItems.find(
    (item) =>
      item.tiers.length === 0 || !item.tiers.some((membership) => keys.has(membership.tierKey)),
  );
  if (orphan) {
    return { error: `"${orphan.label}" is not allocated to one of this version's offerings.` };
  }

  // An offering with no items of its own is allowed — it sells its parent's
  // stack under another name — but a parent the version does not define, or a
  // parent loop, has no price at all.
  const links = new Map(tiers.map((tier) => [tier.key, tier.parentKey]));
  const danglingParent = tiers.find((tier) => tier.parentKey && !keys.has(tier.parentKey));
  if (danglingParent) {
    return { error: `"${danglingParent.label}" builds on an offering this version does not define.` };
  }
  const looped = tiers.find((tier) => hasParentCycle(links, tier.key));
  if (looped) {
    return { error: `"${looped.label}" ends up building on itself through its parents.` };
  }

  const items = activeItems.length;

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
