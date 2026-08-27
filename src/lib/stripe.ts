import Stripe from "stripe";

/**
 * Stripe is optional: a self-hosted or pre-billing deployment runs without a
 * key and keeps the operator's manual Activate button as the only way to turn a
 * trial into a paying workspace. Everything billing-related therefore has to
 * cope with `stripeConfigured === false`.
 */
export const stripeConfigured = Boolean(
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID,
);

let client: Stripe | null = null;

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key, { typescript: true });
  return client;
}

export function stripePriceId(): string {
  const price = process.env.STRIPE_PRICE_ID;
  if (!price) throw new Error("STRIPE_PRICE_ID is not set");
  return price;
}

export function stripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return secret;
}

/** True while the account is still on test keys. Shown on the billing page. */
export function stripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}
