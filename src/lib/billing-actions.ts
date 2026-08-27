"use server";

import { redirect } from "next/navigation";
import { getTenantSession } from "@/lib/auth";
import { billingPortalUrl, checkoutUrl } from "@/lib/checkout";
import { stripeConfigured } from "@/lib/stripe";

/**
 * Checkout and the billing portal read the session directly instead of going
 * through `requireTenant`: a workspace whose trial has run out is exactly the
 * one that needs to pay, and the gate would bounce it back to the wall it is
 * trying to leave. The ADMIN check is therefore done here by hand.
 */
async function requireBillingAdmin() {
  const session = await getTenantSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/calculator?denied=1");
  if (!stripeConfigured) redirect("/admin/billing?unavailable=1");
  return session;
}

export async function startCheckout(): Promise<void> {
  const { tenant, user } = await requireBillingAdmin();
  redirect(await checkoutUrl(tenant, user));
}

export async function openBillingPortal(): Promise<void> {
  const { tenant, user } = await requireBillingAdmin();
  redirect(await billingPortalUrl(tenant, user));
}
