import type { Tenant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { SessionAccount } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { stripeClient, stripePriceId } from "@/lib/stripe";

/**
 * The Stripe customer for a workspace, created on first use.
 *
 * One customer per workspace, not per person: the subscription is what the
 * company buys, so an admin leaving must not take the billing relationship with
 * them. The workspace id is written into `metadata` because the webhook has
 * nothing else to go on when Stripe tells us about a subscription.
 */
async function customerIdFor(tenant: Tenant, actor: SessionAccount): Promise<string> {
  if (tenant.stripeCustomerId) return tenant.stripeCustomerId;

  const stripe = stripeClient();
  const customer = await stripe.customers.create({
    name: tenant.name,
    email: actor.email,
    metadata: { tenantId: tenant.id, tenantSlug: tenant.slug },
  });

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Starts Stripe Checkout for a workspace and returns the URL to send the
 * browser to. Stripe hosts the card form, so no card data ever reaches this
 * application; the subscription itself is only recorded once the webhook
 * confirms it.
 */
export async function checkoutUrl(tenant: Tenant, actor: SessionAccount): Promise<string> {
  const stripe = stripeClient();
  const customer = await customerIdFor(tenant, actor);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: stripePriceId(), quantity: 1 }],
    client_reference_id: tenant.id,
    subscription_data: { metadata: { tenantId: tenant.id } },
    allow_promotion_codes: true,
    billing_address_collection: "required",
    success_url: appUrl("/admin/billing?subscribed=1"),
    cancel_url: appUrl("/admin/billing?cancelled=1"),
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");

  await audit({
    action: "CHECKOUT_STARTED",
    summary: `${actor.name} started Stripe checkout for ${tenant.name}`,
    tenantId: tenant.id,
    entity: "Tenant",
    entityId: tenant.id,
    actor,
  });

  return session.url;
}

/**
 * Stripe's hosted billing portal, where an admin can change the card, read
 * invoices or cancel. Cancelling there is reported back through the webhook, so
 * the app never has to guess at the outcome.
 */
export async function billingPortalUrl(tenant: Tenant, actor: SessionAccount): Promise<string> {
  if (!tenant.stripeCustomerId) throw new Error("This workspace has no Stripe customer yet");

  const stripe = stripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: appUrl("/admin/billing"),
  });

  await audit({
    action: "BILLING_PORTAL_OPENED",
    summary: `${actor.name} opened the Stripe billing portal for ${tenant.name}`,
    tenantId: tenant.id,
    entity: "Tenant",
    entityId: tenant.id,
    actor,
  });

  return session.url;
}
