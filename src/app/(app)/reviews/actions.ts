"use server";

import { revalidatePath } from "next/cache";
import { audit, type AuditAction } from "@/lib/audit";
import { canReview, requireTenant } from "@/lib/auth";
import { appUrl, sendMail } from "@/lib/email";
import { reviewDecisionSchema } from "@/lib/schemas";
import { STATUS_LABEL } from "@/lib/quotes";
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
  if (quote.status === "APPROVED") return { error: "Approved quotes cannot be withdrawn." };

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
