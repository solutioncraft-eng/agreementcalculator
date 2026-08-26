"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PricingModel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireSuperAdmin } from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { provisionWorkspace } from "@/lib/provisioning";
import { isValidSlug, slugFromName, tenantUrl } from "@/lib/tenant";
import { PRICING_MODELS } from "@/lib/pricing/models";

export interface SuperState {
  error?: string;
  ok?: string;
  /// Shown once when the first administrator's invitation email could not be sent.
  tempPassword?: string;
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Name the workspace.").max(80),
  slug: z.string().trim().toLowerCase(),
  pricingModel: z.enum(["COST_PLUS", "MARKUP_MULTIPLE"]),
  adminEmail: z.string().trim().toLowerCase().email("Enter the first administrator's email."),
  adminName: z.string().trim().min(2, "Enter the first administrator's name.").max(80),
  seedCatalog: z.boolean(),
});

/**
 * Creates a workspace and invites its first administrator.
 *
 * An operator-created workspace has no trial deadline — it is set up after a
 * conversation, not from a signup form — so it stays open until the operator
 * says otherwise. Seeding the reference catalogue is optional: it is a starting
 * point to edit, not a claim about the workspace's own vendors.
 */
export async function createTenant(_prev: SuperState, formData: FormData): Promise<SuperState> {
  const operator = await requireSuperAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const parsed = createSchema.safeParse({
    name,
    slug: String(formData.get("slug") ?? "").trim() || slugFromName(name),
    pricingModel: formData.get("pricingModel"),
    adminEmail: formData.get("adminEmail"),
    adminName: formData.get("adminName"),
    seedCatalog: formData.get("seedCatalog") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the workspace details." };

  const { slug, pricingModel, adminEmail, adminName, seedCatalog } = parsed.data;
  if (!isValidSlug(slug)) {
    return { error: `"${slug}" cannot be used as a subdomain — try letters, numbers and hyphens.` };
  }
  if (await prisma.tenant.findUnique({ where: { slug } })) {
    return { error: `The subdomain ${slug} is already taken.` };
  }

  const model: PricingModel = pricingModel;
  const { tenant, temporaryPassword } = await provisionWorkspace({
    name: parsed.data.name,
    slug,
    pricingModel: model,
    seedCatalog,
    admin: { email: adminEmail, name: adminName },
    trialEndsAt: null,
    draftCreatedById: operator.id,
  });

  await audit({
    action: "TENANT_CREATED",
    entity: "Tenant",
    entityId: tenant.id,
    summary: `Workspace ${tenant.name} (${slug}) created by ${operator.email}, ${adminEmail} invited as administrator`,
    after: { slug, name: tenant.name, pricingModel: model, seededCatalog: seedCatalog },
    tenantId: tenant.id,
    actor: operator,
  });

  const mailed = await sendMail({
    to: [adminEmail],
    subject: `Your ${tenant.name} workspace is ready`,
    heading: `${tenant.name} is set up on Agreement Calculator`,
    lines: [
      `You are the administrator of ${tenant.name}.`,
      `Pricing model: ${PRICING_MODELS[model].label}.`,
      ...(temporaryPassword
        ? [`Temporary password: ${temporaryPassword}`, "You will be asked to change it when you sign in."]
        : []),
      "Start by reviewing your COGS items and publishing your first pricing version — quotes cannot be produced until one is published.",
    ],
    actionLabel: "Sign in",
    actionUrl: tenantUrl(slug, "/login"),
  });

  revalidatePath("/super");
  if (mailed.sent) return { ok: `${tenant.name} created — ${adminEmail} has been invited.` };
  return {
    ok: `${tenant.name} created, but the invitation email to ${adminEmail} failed${mailed.reason === "unconfigured" ? " (email is not configured)" : ""}.`,
    tempPassword: temporaryPassword ?? undefined,
  };
}

const statusSchema = z.object({
  tenantId: z.string().min(1),
  status: z.enum(["TRIAL", "ACTIVE", "SUSPENDED"]),
});

/** Suspends or reinstates a workspace. Suspension blocks every sign-in into it. */
export async function setTenantStatus(_prev: SuperState, formData: FormData): Promise<SuperState> {
  const operator = await requireSuperAdmin();
  const parsed = statusSchema.safeParse({
    tenantId: formData.get("tenantId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "That status is not valid." };

  const tenant = await prisma.tenant.findUnique({ where: { id: parsed.data.tenantId } });
  if (!tenant) return { error: "That workspace no longer exists." };
  if (tenant.status === parsed.data.status) return { ok: `${tenant.name} is already ${tenant.status}.` };

  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: parsed.data.status } });
  await audit({
    action: parsed.data.status === "SUSPENDED" ? "TENANT_SUSPENDED" : "TENANT_REACTIVATED",
    entity: "Tenant",
    entityId: tenant.id,
    summary: `${tenant.name} set to ${parsed.data.status} by ${operator.email}`,
    before: { status: tenant.status },
    after: { status: parsed.data.status },
    tenantId: tenant.id,
    actor: operator,
  });

  revalidatePath("/super");
  return { ok: `${tenant.name} is now ${parsed.data.status.toLowerCase()}.` };
}

const modelSchema = z.object({
  tenantId: z.string().min(1),
  pricingModel: z.enum(["COST_PLUS", "MARKUP_MULTIPLE"]),
});

/**
 * Changes a workspace's pricing model. Locked to the operator on purpose: the
 * model is chosen at setup, and switching it after a version is published
 * changes what every future quote means, so it needs a conversation first.
 */
export async function setPricingModel(_prev: SuperState, formData: FormData): Promise<SuperState> {
  const operator = await requireSuperAdmin();
  const parsed = modelSchema.safeParse({
    tenantId: formData.get("tenantId"),
    pricingModel: formData.get("pricingModel"),
  });
  if (!parsed.success) return { error: "That pricing model is not valid." };

  const tenant = await prisma.tenant.findUnique({ where: { id: parsed.data.tenantId } });
  if (!tenant) return { error: "That workspace no longer exists." };
  if (tenant.pricingModel === parsed.data.pricingModel) {
    return { ok: `${tenant.name} already uses ${PRICING_MODELS[tenant.pricingModel].label}.` };
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { pricingModel: parsed.data.pricingModel },
  });
  await audit({
    action: "TENANT_UPDATED",
    entity: "Tenant",
    entityId: tenant.id,
    summary: `${tenant.name} pricing model changed to ${PRICING_MODELS[parsed.data.pricingModel].label} by ${operator.email}`,
    before: { pricingModel: tenant.pricingModel },
    after: { pricingModel: parsed.data.pricingModel },
    tenantId: tenant.id,
    actor: operator,
  });

  revalidatePath("/super");
  return {
    ok: `${tenant.name} now uses ${PRICING_MODELS[parsed.data.pricingModel].label}. Their next draft picks it up; published versions keep the model they were published with.`,
  };
}
