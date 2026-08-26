"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { appUrl, sendMail } from "@/lib/email";
import { calculate } from "@/lib/pricing/engine";
import { getActiveConfig } from "@/lib/pricing/config";
import { QUOTE_RETENTION_MONTHS } from "@/lib/pricing/defaults";
import { submitQuoteSchema } from "@/lib/schemas";

export interface SubmitState {
  error?: string;
}

function newRef(): string {
  const now = new Date();
  const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `QR-${month}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

function purgeDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + QUOTE_RETENTION_MONTHS);
  return d;
}

export async function submitForReview(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const user = await requireUser();

  const parsed = submitQuoteSchema.safeParse({
    clientName: formData.get("clientName"),
    notes: formData.get("notes") ?? undefined,
    requestedTier: formData.get("requestedTier"),
    inputs: {
      users: formData.get("users"),
      devices: formData.get("devices"),
      locations: formData.get("locations"),
      sgmPct: formData.get("sgmPct"),
      perUserFloor: formData.get("perUserFloor"),
      floorOverride: formData.get("floorOverride") === "true",
      addonMultiplier: formData.get("addonMultiplier"),
      bundleKey: formData.get("bundleKey"),
    },
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the client name and inputs." };
  }

  const config = await getActiveConfig();
  if (!config) return { error: "No published pricing version — ask an administrator to publish one." };

  const { clientName, notes, requestedTier, inputs } = parsed.data;
  const result = calculate(config, inputs);
  if (!result.needsApproval) {
    return { error: "This configuration is within standard pricing — export it directly, no review needed." };
  }

  const tier = requestedTier === "PINNACLE" ? result.pinnacle : result.advantage;
  const quote = await prisma.quoteRequest.create({
    data: {
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
      bundleKey: inputs.bundleKey,
      requestedTier,
      advantageRate: result.advantage.headlineRate.toFixed(2),
      advantagePerUser: result.advantage.headlinePerUser.toFixed(2),
      pinnacleRate: result.pinnacle.headlineRate.toFixed(2),
      pinnaclePerUser: result.pinnacle.headlinePerUser.toFixed(2),
      triggers: result.triggers.map((t) => t.code),
      pricingVersionId: config.versionId,
      submittedById: user.id,
      purgeAfter: purgeDate(),
      reviews: {
        create: {
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
    summary: `${quote.ref} submitted for review — ${clientName}, ${requestedTier} at ${tier.headlineRate.toFixed(0)}/mo`,
    after: {
      ref: quote.ref,
      triggers: result.triggers.map((t) => t.code),
      pricingVersion: config.versionLabel,
    },
    actor: user,
  });

  const reviewers = await prisma.user.findMany({
    where: { active: true, role: { in: ["LEADER", "ADMIN"] } },
    select: { email: true },
  });
  if (reviewers.length) {
    await sendMail({
      to: reviewers.map((r) => r.email),
      subject: `[Approval needed] ${quote.ref} · ${clientName}`,
      heading: "Non-standard pricing needs your review",
      lines: [
        `${user.name} submitted ${clientName} for review.`,
        `Requested tier: ${requestedTier === "PINNACLE" ? "infinIT Pinnacle" : "infinIT Advantage"}`,
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
