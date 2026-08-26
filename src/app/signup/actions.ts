"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSession } from "@/lib/auth";
import { sendMail } from "@/lib/email";
import { provisionWorkspace } from "@/lib/provisioning";
import { isValidSlug, slugFromName, tenantUrl } from "@/lib/tenant";
import { PRICING_MODELS } from "@/lib/pricing/models";
import { TRIAL_DAYS, trialEndFrom } from "@/lib/trial";

export interface SignupState {
  error?: string;
  /** Echoed back so a rejected form does not lose what was typed. */
  values?: { company?: string; slug?: string; name?: string; email?: string };
}

const schema = z.object({
  company: z.string().trim().min(2, "Enter your company name.").max(80),
  slug: z.string().trim().toLowerCase(),
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid work email."),
  password: z.string().min(12, "Use a password of at least 12 characters."),
  pricingModel: z.enum(["COST_PLUS", "MARKUP_MULTIPLE"]),
});

/**
 * Self-serve signup: one form creates the workspace, its first administrator
 * and a {@link TRIAL_DAYS}-day trial, then signs the person straight in.
 *
 * No card is taken, so there is nothing to charge and nothing to refund — the
 * trial simply stops working when it runs out (see `trialInfo`) and an operator
 * converts the workspace to ACTIVE when it starts paying.
 */
export async function signUp(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const company = String(formData.get("company") ?? "").trim();
  const values = {
    company,
    slug: String(formData.get("slug") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
  };

  const parsed = schema.safeParse({
    company,
    slug: values.slug || slugFromName(company),
    name: values.name,
    email: values.email,
    password: formData.get("password"),
    pricingModel: formData.get("pricingModel") ?? "COST_PLUS",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again.", values };
  }

  const { slug, email, name, password, pricingModel } = parsed.data;
  if (!isValidSlug(slug)) {
    return {
      error: `"${slug}" cannot be used as a workspace address — letters, numbers and hyphens only.`,
      values,
    };
  }
  if (await prisma.tenant.findUnique({ where: { slug } })) {
    return { error: `The address ${slug} is taken — try another.`, values };
  }
  // An account already exists for this person, and self-serve signup is not
  // the place to grant a second workspace: that changes who can see what, so
  // it stays an invitation from inside a workspace.
  if (await prisma.user.findUnique({ where: { email } })) {
    return { error: "That email already has an account — sign in instead.", values };
  }

  const trialEndsAt = trialEndFrom(new Date());
  const { tenant, admin } = await provisionWorkspace({
    name: parsed.data.company,
    slug,
    pricingModel,
    seedCatalog: true,
    admin: { email, name, password },
    trialEndsAt,
  });

  await audit({
    action: "TENANT_CREATED",
    entity: "Tenant",
    entityId: tenant.id,
    summary: `Workspace ${tenant.name} (${slug}) signed up by ${email}, trial ends ${trialEndsAt.toISOString()}`,
    after: { slug, name: tenant.name, pricingModel, trialEndsAt: trialEndsAt.toISOString() },
    tenantId: tenant.id,
    actorEmail: email,
  });

  const account = { id: admin.id, email: admin.email, name: admin.name, isSuperAdmin: false };
  await createSession(admin.id, tenant.id);
  await audit({
    action: "LOGIN",
    summary: `${email} signed in to ${tenant.name} at signup`,
    tenantId: tenant.id,
    actor: account,
  });

  await sendMail({
    to: [email],
    subject: `Your ${tenant.name} workspace is ready`,
    heading: `${tenant.name} is set up on Agreement Calculator`,
    lines: [
      `You are the administrator of ${tenant.name}, and your ${TRIAL_DAYS}-day trial runs until ${trialEndsAt.toISOString().slice(0, 10)}.`,
      `Pricing model: ${PRICING_MODELS[pricingModel].label}.`,
      "Start by reviewing your COGS items and publishing your first pricing version — quotes cannot be produced until one is published.",
    ],
    actionLabel: "Open your workspace",
    actionUrl: tenantUrl(slug, "/admin/pricing"),
  });

  redirect("/admin/pricing");
}
