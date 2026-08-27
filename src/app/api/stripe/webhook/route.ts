import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { graceEndFrom, subscriptionUpdate } from "@/lib/billing";
import { stripeClient, stripeConfigured, stripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe's account of what a workspace has paid for.
 *
 * Unauthenticated by design — the signature over the raw body is the
 * authentication, which is why the body is read as text and never parsed before
 * it is verified. This route is the only writer of subscription state: the
 * checkout redirect deliberately records nothing, so a customer who abandons
 * the Stripe page, or a card that fails after the redirect, cannot leave the
 * workspace looking paid.
 */
export async function POST(request: Request) {
  if (!stripeConfigured) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(body, signature, stripeWebhookSecret());
  } catch (error) {
    console.error("stripe webhook signature rejected", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handle(event);
  } catch (error) {
    // A 500 makes Stripe retry, which is what we want for a transient database
    // failure; the handlers are written so a replay is harmless.
    console.error("stripe webhook handling failed", event.type, error);
    return NextResponse.json({ error: "Handling failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handle(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription") return;
      const tenantId = session.client_reference_id;
      const subscriptionId = idOf(session.subscription);
      if (!tenantId || !subscriptionId) return;

      const subscription = await stripeClient().subscriptions.retrieve(subscriptionId);
      await applySubscription(tenantId, subscription);
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const tenantId = await tenantIdForSubscription(subscription);
      if (tenantId) await applySubscription(tenantId, subscription);
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const tenantId = await tenantIdForSubscription(subscription);
      if (!tenantId) return;

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          subscriptionStatus: subscription.status,
          currentPeriodEnd: periodEnd(subscription),
          graceEndsAt: null,
        },
      });
      await audit({
        action: "SUBSCRIPTION_CANCELLED",
        summary: `Stripe subscription ended (${subscription.status})`,
        tenantId,
        entity: "Tenant",
        entityId: tenantId,
        actorEmail: "stripe@webhook",
      });
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = idOf(invoice.customer);
      if (!customerId) return;
      const tenant = await prisma.tenant.findUnique({
        where: { stripeCustomerId: customerId },
        select: { id: true, graceEndsAt: true },
      });
      if (!tenant) return;

      // Keep the deadline from the *first* failure: Stripe retries a failing
      // invoice several times, and restarting the clock on each attempt would
      // stretch the grace window indefinitely.
      const graceEndsAt = tenant.graceEndsAt ?? graceEndFrom(new Date());
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { graceEndsAt },
      });
      await audit({
        action: "SUBSCRIPTION_PAYMENT_FAILED",
        summary: `Stripe payment failed; access continues until ${graceEndsAt.toISOString()}`,
        tenantId: tenant.id,
        entity: "Tenant",
        entityId: tenant.id,
        actorEmail: "stripe@webhook",
      });
      return;
    }

    default:
      return;
  }
}

async function applySubscription(
  tenantId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const data = subscriptionUpdate({
    id: subscription.id,
    status: subscription.status,
    currentPeriodEnd: periodEnd(subscription),
  });

  const customerId = idOf(subscription.customer);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { ...data, ...(customerId ? { stripeCustomerId: customerId } : {}) },
  });

  await audit({
    action: "SUBSCRIPTION_UPDATED",
    summary: `Stripe subscription is ${subscription.status}`,
    tenantId,
    entity: "Tenant",
    entityId: tenantId,
    actorEmail: "stripe@webhook",
  });
}

/**
 * Which workspace a subscription belongs to. The metadata written at checkout
 * is preferred; the customer id is the fallback for a subscription created by
 * hand in the Stripe dashboard.
 */
async function tenantIdForSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscription.metadata?.tenantId;
  if (fromMetadata) return fromMetadata;

  const customerId = idOf(subscription.customer);
  if (!customerId) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return tenant?.id ?? null;
}

/**
 * When the paid-for period runs out. Since Stripe's 2025 billing API the period
 * lives on the subscription items rather than the subscription, and a
 * single-price subscription has exactly one; the latest is used so a future
 * multi-item plan still reports the entitlement correctly.
 */
function periodEnd(subscription: Stripe.Subscription): Date | null {
  const seconds = subscription.items?.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");
  if (!seconds || seconds.length === 0) return null;
  return new Date(Math.max(...seconds) * 1000);
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
