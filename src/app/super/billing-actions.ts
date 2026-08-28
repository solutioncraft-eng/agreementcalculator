"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Tenant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireSuperAdmin, type SessionAccount } from "@/lib/auth";
import { stripeClient, stripeConfigured } from "@/lib/stripe";
import { trialEndFrom } from "@/lib/trial";
import type { SuperState } from "./actions";

async function tenantOr(tenantId: unknown): Promise<Tenant | null> {
  const id = String(tenantId ?? "");
  if (!id) return null;
  return prisma.tenant.findUnique({ where: { id } });
}

/** Records what an operator did to a workspace's billing, with them as actor. */
async function record(
  operator: SessionAccount,
  tenant: Tenant,
  action:
    | "TENANT_COMPED"
    | "TENANT_COMP_ENDED"
    | "TENANT_TRIAL_RESET"
    | "SUBSCRIPTION_UPDATED"
    | "SUBSCRIPTION_CANCELLED",
  summary: string,
  before: Record<string, string | null>,
  after: Record<string, string | null>,
): Promise<void> {
  await audit({
    action,
    entity: "Tenant",
    entityId: tenant.id,
    summary,
    before,
    after,
    tenantId: tenant.id,
    actor: operator,
  });
  revalidatePath("/super");
}

const compSchema = z.object({
  tenantId: z.string().min(1),
  reason: z.string().trim().min(3, "Say why this workspace is complimentary.").max(200),
  /** Blank means open-ended. */
  expiresOn: z.string().trim(),
});

/**
 * Marks a workspace complimentary: it keeps working without paying, and is
 * reported as comped rather than subscribed so it is never mistaken for
 * revenue. Any Stripe subscription is deliberately left alone — cancel it
 * separately if the customer is not meant to keep being charged, which the
 * caller is warned about.
 */
export async function grantComplimentary(_prev: SuperState, formData: FormData): Promise<SuperState> {
  const operator = await requireSuperAdmin();
  const parsed = compSchema.safeParse({
    tenantId: formData.get("tenantId"),
    reason: formData.get("reason"),
    expiresOn: formData.get("expiresOn") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the comp details." };

  const tenant = await tenantOr(parsed.data.tenantId);
  if (!tenant) return { error: "That workspace no longer exists." };

  let expiresAt: Date | null = null;
  if (parsed.data.expiresOn) {
    // A date input gives a plain day; the comp lasts to the end of it.
    expiresAt = new Date(`${parsed.data.expiresOn}T23:59:59Z`);
    if (Number.isNaN(expiresAt.getTime())) return { error: "That expiry date is not a date." };
    if (expiresAt.getTime() <= Date.now()) return { error: "That expiry date has already passed." };
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      status: "COMPLIMENTARY",
      compReason: parsed.data.reason,
      compExpiresAt: expiresAt,
    },
  });

  await record(
    operator,
    tenant,
    "TENANT_COMPED",
    `${tenant.name} made complimentary by ${operator.email}${expiresAt ? ` until ${expiresAt.toISOString()}` : " (open-ended)"}: ${parsed.data.reason}`,
    { status: tenant.status },
    { status: "COMPLIMENTARY", compReason: parsed.data.reason, compExpiresAt: expiresAt?.toISOString() ?? null },
  );

  const warning =
    tenant.subscriptionStatus === "active" || tenant.subscriptionStatus === "trialing"
      ? " Its Stripe subscription is still live and will keep charging — cancel it if that is not intended."
      : "";
  return { ok: `${tenant.name} is complimentary${expiresAt ? ` until ${parsed.data.expiresOn}` : ""}.${warning}` };
}

/**
 * Ends a comp. The workspace drops back to whatever it can stand on by itself —
 * a live subscription, a trial that has not run out, or the paywall.
 */
export async function endComplimentary(_prev: SuperState, formData: FormData): Promise<SuperState> {
  const operator = await requireSuperAdmin();
  const tenant = await tenantOr(formData.get("tenantId"));
  if (!tenant) return { error: "That workspace no longer exists." };
  if (tenant.status !== "COMPLIMENTARY") return { error: `${tenant.name} is not complimentary.` };

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { status: "TRIAL", compReason: null, compExpiresAt: null },
  });

  await record(
    operator,
    tenant,
    "TENANT_COMP_ENDED",
    `${tenant.name} is no longer complimentary (ended by ${operator.email})`,
    { status: tenant.status, compReason: tenant.compReason ?? null },
    { status: "TRIAL" },
  );

  return { ok: `${tenant.name} is no longer complimentary — it now needs a subscription or a trial.` };
}

/**
 * Gives a workspace a fresh trial from today.
 *
 * A lapsed subscription is cleared at the same time, because otherwise the
 * cancelled state would keep the paywall up and the new trial would be a lie.
 * Any comp rationale goes with it, so it cannot outlive the arrangement it
 * described.
 * The Stripe customer is kept, so subscribing later reuses the same billing
 * relationship and invoice history.
 */
export async function resetTrial(_prev: SuperState, formData: FormData): Promise<SuperState> {
  const operator = await requireSuperAdmin();
  const tenant = await tenantOr(formData.get("tenantId"));
  if (!tenant) return { error: "That workspace no longer exists." };

  const healthy = tenant.subscriptionStatus === "active" || tenant.subscriptionStatus === "trialing";
  if (healthy) {
    return {
      error: `${tenant.name} has a live Stripe subscription — cancel it first if you mean to put them back on a trial.`,
    };
  }

  const trialEndsAt = trialEndFrom(new Date());
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      status: "TRIAL",
      trialEndsAt,
      graceEndsAt: null,
      subscriptionStatus: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      compReason: null,
      compExpiresAt: null,
    },
  });

  await record(
    operator,
    tenant,
    "TENANT_TRIAL_RESET",
    `${tenant.name} given a fresh trial until ${trialEndsAt.toISOString()} by ${operator.email}`,
    { status: tenant.status, trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null },
    { status: "TRIAL", trialEndsAt: trialEndsAt.toISOString() },
  );

  return { ok: `${tenant.name} is on a fresh 14-day trial.` };
}

const graceSchema = z.object({
  tenantId: z.string().min(1),
  days: z.coerce.number().int().min(1, "Give it at least a day.").max(60, "60 days is the most."),
});

/** Buys a workspace more time while a payment is being sorted out. */
export async function extendGrace(_prev: SuperState, formData: FormData): Promise<SuperState> {
  const operator = await requireSuperAdmin();
  const parsed = graceSchema.safeParse({
    tenantId: formData.get("tenantId"),
    days: formData.get("days"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the number of days." };

  const tenant = await tenantOr(parsed.data.tenantId);
  if (!tenant) return { error: "That workspace no longer exists." };

  // Measured from now rather than from the existing deadline, so extending a
  // window that already closed gives the promised number of days.
  const from = new Date();
  const graceEndsAt = new Date(from.getTime() + parsed.data.days * 24 * 60 * 60 * 1000);
  await prisma.tenant.update({ where: { id: tenant.id }, data: { graceEndsAt } });

  await record(
    operator,
    tenant,
    "SUBSCRIPTION_UPDATED",
    `${tenant.name} given ${parsed.data.days} more days to pay (until ${graceEndsAt.toISOString()}) by ${operator.email}`,
    { graceEndsAt: tenant.graceEndsAt?.toISOString() ?? null },
    { graceEndsAt: graceEndsAt.toISOString() },
  );

  return {
    ok: `${tenant.name} keeps working for ${parsed.data.days} more days${
      tenant.subscriptionStatus && ["past_due", "unpaid"].includes(tenant.subscriptionStatus)
        ? ""
        : " — note its subscription is not currently in dunning, so this only matters if a payment fails"
    }.`,
  };
}

const cancelSchema = z.object({
  tenantId: z.string().min(1),
  when: z.enum(["now", "period_end"]),
});

/**
 * Cancels a workspace's subscription in Stripe. Nothing about the workspace's
 * own state is written here: the resulting webhook is what records it, which
 * keeps Stripe the single authority even when the cancellation started with us.
 */
export async function cancelSubscription(_prev: SuperState, formData: FormData): Promise<SuperState> {
  const operator = await requireSuperAdmin();
  const parsed = cancelSchema.safeParse({
    tenantId: formData.get("tenantId"),
    when: formData.get("when"),
  });
  if (!parsed.success) return { error: "That cancellation option is not valid." };

  const tenant = await tenantOr(parsed.data.tenantId);
  if (!tenant) return { error: "That workspace no longer exists." };
  if (!stripeConfigured) return { error: "Stripe is not configured on this deployment." };
  if (!tenant.stripeSubscriptionId) return { error: `${tenant.name} has no Stripe subscription.` };

  const stripe = stripeClient();
  try {
    if (parsed.data.when === "now") {
      await stripe.subscriptions.cancel(tenant.stripeSubscriptionId);
    } else {
      await stripe.subscriptions.update(tenant.stripeSubscriptionId, { cancel_at_period_end: true });
    }
  } catch (error) {
    console.error("stripe cancellation failed", tenant.id, error);
    return { error: "Stripe refused the cancellation — check the subscription in the Stripe dashboard." };
  }

  await record(
    operator,
    tenant,
    parsed.data.when === "now" ? "SUBSCRIPTION_CANCELLED" : "SUBSCRIPTION_UPDATED",
    `${tenant.name}'s subscription cancelled ${parsed.data.when === "now" ? "immediately" : "at the end of the period"} by ${operator.email}`,
    { subscriptionStatus: tenant.subscriptionStatus },
    { cancelledBy: operator.email, when: parsed.data.when },
  );

  return {
    ok:
      parsed.data.when === "now"
        ? `${tenant.name}'s subscription is cancelled. Stripe's webhook will confirm it in a moment.`
        : `${tenant.name} will not renew at the end of the current period.`,
  };
}
