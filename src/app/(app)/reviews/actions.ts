"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, type AuditAction } from "@/lib/audit";
import { canAdminister, canReview, requireTenant } from "@/lib/auth";
import { appUrl, sendMail } from "@/lib/email";
import { reviewDecisionSchema } from "@/lib/schemas";
import { STATUS_LABEL, formatUtc, storedTiers } from "@/lib/quotes";
import type { QuoteStatus, ReviewAction } from "@prisma/client";

export interface DecisionState {
  error?: string;
  ok?: string;
}

const AUDIT_ACTION: Record<string, AuditAction> = {
  APPROVED: "QUOTE_APPROVED",
  CHANGES_REQUESTED: "QUOTE_CHANGES_REQUESTED",
  DENIED: "QUOTE_DENIED",
  COMMENTED: "QUOTE_COMMENTED",
};

export async function decide(_prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const { user, role, tenant, db } = await requireTenant();
  if (!canReview(role)) return { error: "Only leadership can review quotes." };

  const parsed = reviewDecisionSchema.safeParse({
    quoteId: formData.get("quoteId"),
    decision: formData.get("decision"),
    comment: formData.get("comment") ?? undefined,
  });
  if (!parsed.success) return { error: "Choose a decision." };

  const { quoteId, decision, comment } = parsed.data;
  if ((decision === "CHANGES_REQUESTED" || decision === "DENIED") && !comment) {
    return { error: "Add a note so the account manager knows what to change." };
  }

  const quote = await db.quoteRequest.findUnique({
    where: { id: quoteId },
    include: { submittedBy: { select: { email: true, name: true } } },
  });
  if (!quote) return { error: "That quote no longer exists." };
  if (decision !== "COMMENTED" && quote.status !== "PENDING") {
    return { error: `This quote is already ${STATUS_LABEL[quote.status].toLowerCase()}.` };
  }

  const previous = quote.status;
  const status: QuoteStatus = decision === "COMMENTED" ? quote.status : (decision as QuoteStatus);

  await db.quoteRequest.update({
    where: { id: quote.id },
    data: {
      status,
      decidedAt: decision === "COMMENTED" ? quote.decidedAt : new Date(),
      reviews: {
        create: {
          tenantId: tenant.id,
          action: decision as ReviewAction,
          comment: comment || null,
          actorId: user.id,
        },
      },
    },
  });

  await audit({
    action: AUDIT_ACTION[decision],
    entity: "QuoteRequest",
    entityId: quote.id,
    summary: `${quote.ref} (${quote.clientName}) — ${STATUS_LABEL[status].toLowerCase()} by ${user.name}`,
    before: { status: previous },
    after: { status, comment: comment || null },
    tenantId: tenant.id,
    actor: user,
  });

  await sendMail({
    to: [quote.submittedBy.email],
    subject: `[${tenant.name}] ${STATUS_LABEL[status]} · ${quote.ref} · ${quote.clientName}`,
    heading:
      decision === "APPROVED"
        ? "Your quote was approved"
        : decision === "DENIED"
          ? "Your quote was denied"
          : decision === "CHANGES_REQUESTED"
            ? "Changes were requested on your quote"
            : "New comment on your quote",
    lines: [
      `${user.name} reviewed ${quote.clientName} (${quote.ref}).`,
      comment ? `Note: ${comment}` : "No additional notes were left.",
      decision === "APPROVED"
        ? "You can now export the agreement PDF from the quote page."
        : "Open the quote to see the details.",
    ],
    actionLabel: "Open the quote",
    actionUrl: appUrl(`/quotes/${quote.id}`),
  });

  revalidatePath("/reviews");
  revalidatePath(`/reviews/${quote.id}`);
  revalidatePath(`/quotes/${quote.id}`);
  return { ok: `Recorded — ${STATUS_LABEL[status].toLowerCase()}.` };
}

export async function withdraw(_prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const { user, role, tenant, db } = await requireTenant();
  const quoteId = String(formData.get("quoteId") ?? "");
  const quote = await db.quoteRequest.findUnique({ where: { id: quoteId } });
  if (!quote) return { error: "That quote no longer exists." };
  if (quote.submittedById !== user.id && role !== "ADMIN") {
    return { error: "Only the account manager who submitted it can withdraw it." };
  }
  if (quote.status === "APPROVED" || quote.status === "COMPLETED") {
    return { error: "Approved quotes cannot be withdrawn." };
  }

  await db.quoteRequest.update({
    where: { id: quote.id },
    data: {
      status: "WITHDRAWN",
      decidedAt: new Date(),
      reviews: { create: { tenantId: tenant.id, action: "WITHDRAWN", actorId: user.id } },
    },
  });

  await audit({
    action: "QUOTE_WITHDRAWN",
    entity: "QuoteRequest",
    entityId: quote.id,
    summary: `${quote.ref} withdrawn by ${user.name}`,
    before: { status: quote.status },
    after: { status: "WITHDRAWN" },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);
  revalidatePath("/reviews");
  return { ok: "Withdrawn." };
}

/**
 * Admin-only hard delete. The quote's full commercial detail is written to the
 * audit log first so the record of what was quoted survives; export records
 * are kept (their quoteId is nulled by the relation) because the PDFs they
 * describe may already be with the customer.
 */
export async function deleteQuote(_prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const { user, role, tenant, db } = await requireTenant();
  if (!canAdminister(role)) return { error: "Only an administrator can delete a quote." };
  const quoteId = String(formData.get("quoteId") ?? "");
  const quote = await db.quoteRequest.findUnique({
    where: { id: quoteId },
    include: {
      submittedBy: { select: { name: true, email: true } },
      pricingVersion: { select: { label: true, costBasis: true } },
      reviews: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
      exports: { select: { exportId: true, docType: true, createdAt: true } },
    },
  });
  if (!quote) return { error: "That quote no longer exists." };

  const tiers = storedTiers(quote);
  const requested = tiers.find((tier) => tier.key === quote.requestedTierKey);
  const detail = {
    ref: quote.ref,
    status: quote.status,
    clientName: quote.clientName,
    notes: quote.notes,
    submittedBy: `${quote.submittedBy.name} <${quote.submittedBy.email}>`,
    createdAt: quote.createdAt.toISOString(),
    pricingVersion: `${quote.pricingVersion.label} (${quote.pricingVersion.costBasis})`,
    inputs: {
      users: quote.users,
      devices: quote.devices,
      locations: quote.locations,
      sgmPct: quote.sgmPct.toNumber(),
      perUserFloor: quote.perUserFloor.toNumber(),
      floorOverride: quote.floorOverride,
      addonMultiplier: quote.addonMultiplier.toNumber(),
      markupMultiple: quote.markupMultiple.toNumber(),
      bundleKey: quote.bundleKey,
    },
    requestedTier: requested ? { ...requested } : { key: quote.requestedTierKey },
    tierRates: tiers.map((tier) => ({ ...tier })),
    triggers: quote.triggers,
    reviews: quote.reviews.map((review) => ({
      action: review.action,
      by: review.actor.name,
      at: review.createdAt.toISOString(),
      comment: review.comment,
    })),
    exports: quote.exports.map((record) => ({
      exportId: record.exportId,
      docType: record.docType,
      at: record.createdAt.toISOString(),
    })),
  };
  const amount = requested
    ? `${requested.label} at $${requested.rate.toFixed(2)}/mo ($${requested.perUser.toFixed(2)}/user)`
    : quote.requestedTierKey;

  await db.quoteRequest.delete({ where: { id: quote.id } });

  await audit({
    action: "QUOTE_DELETED",
    entity: "QuoteRequest",
    entityId: quote.id,
    summary:
      `${quote.ref} (${quote.clientName}, ${STATUS_LABEL[quote.status].toLowerCase()}) deleted by ${user.name} — ` +
      `${quote.users} users, ${quote.devices} devices, ${quote.locations} locations; ${amount}; ` +
      `submitted ${formatUtc(quote.createdAt)} by ${quote.submittedBy.name}; ${quote.exports.length} export(s)`,
    before: detail,
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath("/quotes");
  revalidatePath("/reviews");
  redirect("/quotes");
}
