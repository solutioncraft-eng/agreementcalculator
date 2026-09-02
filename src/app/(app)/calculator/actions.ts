"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireTenant } from "@/lib/auth";
import { appUrl, sendMail } from "@/lib/email";
import { getActiveConfig } from "@/lib/pricing/config";
import { forTier } from "@/lib/pricing/engine";
import { calculate } from "@/lib/pricing/models";
import { tierRatesFrom } from "@/lib/quotes";
import { submitQuoteSchema } from "@/lib/schemas";

export interface SubmitState {
  error?: string;
}

function newRef(): string {
  const now = new Date();
  const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `QR-${month}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

function purgeDate(retentionMonths: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + retentionMonths);
  return d;
}

export async function submitForReview(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const { user, tenant, db } = await requireTenant();

  const parsed = submitQuoteSchema.safeParse({
    clientName: formData.get("clientName"),
    notes: formData.get("notes") ?? undefined,
    requestedTierKey: formData.get("requestedTierKey"),
    inputs: {
      users: formData.get("users"),
      devices: formData.get("devices"),
      locations: formData.get("locations"),
      sgmPct: formData.get("sgmPct"),
      perUserFloor: formData.get("perUserFloor"),
      floorOverride: formData.get("floorOverride") === "true",
      addonMultiplier: formData.get("addonMultiplier"),
      markupMultiple: formData.get("markupMultiple"),
      bundleKey: formData.get("bundleKey"),
    },
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the client name and inputs." };
  }

  const config = await getActiveConfig(db);
  if (!config) return { error: "No published pricing version — ask an administrator to publish one." };

  const { clientName, notes, requestedTierKey, inputs } = parsed.data;
  const result = forTier(calculate(config, inputs), requestedTierKey);
  if (!result.needsApproval) {
    return { error: "This configuration is within standard pricing — export it directly, no review needed." };
  }

  const tier = result.tiers.find((t) => t.key === requestedTierKey);
  if (!tier) {
    return { error: "That offering is not part of the published pricing version — reload the calculator." };
  }
  const tierRates = tierRatesFrom(result.tiers);
  const quote = await db.quoteRequest.create({
    data: {
      tenantId: tenant.id,
      ref: newRef(),
      clientName,
      notes: notes || null,
      users: inputs.users,
      devices: inputs.devices,
      locations: inputs.locations,
      sgmPct: inputs.sgmPct,
      perUserFloor: inputs.perUserFloor,
      floorOverride: inputs.floorOverride,
      addonMultiplier: inputs.addonMultiplier,
      markupMultiple: inputs.markupMultiple,
      bundleKey: inputs.bundleKey,
      requestedTierKey,
      tierRates,
      triggers: result.triggers.map((t) => t.code),
      pricingVersionId: config.versionId,
      submittedById: user.id,
      purgeAfter: purgeDate(tenant.retentionMonths),
      reviews: {
        create: {
          tenantId: tenant.id,
          action: "SUBMITTED",
          comment: notes || null,
          actorId: user.id,
        },
      },
    },
  });

  await audit({
    action: "QUOTE_SUBMITTED",
    entity: "QuoteRequest",
    entityId: quote.id,
    summary: `${quote.ref} submitted for review — ${clientName}, ${tier.label} at ${tier.headlineRate.toFixed(0)}/mo`,
    after: {
      ref: quote.ref,
      triggers: result.triggers.map((t) => t.code),
      pricingVersion: config.versionLabel,
    },
    tenantId: tenant.id,
    actor: user,
  });

  // Reviewers are the people with a reviewing role *in this workspace*.
  const reviewers = await db.membership.findMany({
    where: { role: { in: ["LEADER", "ADMIN"] }, user: { active: true } },
    select: { user: { select: { email: true } } },
  });
  if (reviewers.length) {
    await sendMail({
      to: reviewers.map((r) => r.user.email),
      subject: `[${tenant.name}] Approval needed · ${quote.ref} · ${clientName}`,
      heading: "Non-standard pricing needs your review",
      lines: [
        `${user.name} submitted ${clientName} for review.`,
        `Requested offering: ${tier.label}`,
        `Rate: $${tier.headlineRate.toFixed(0)}/month ($${tier.headlinePerUser.toFixed(2)}/user)`,
        `Environment: ${inputs.users} users · ${inputs.devices} devices · ${inputs.locations} locations`,
        ...result.triggers.map((t) => `Flag: ${t.message}`),
      ],
      actionLabel: "Open the review",
      actionUrl: appUrl(`/reviews/${quote.id}`),
    });
  }

  redirect(`/quotes/${quote.id}`);
}
