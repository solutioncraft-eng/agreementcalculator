/**
 * Workspace address rules, kept free of server-only imports so the signup form
 * can derive and preview a slug in the browser exactly as the server validates
 * it.
 */

/** Slugs that can never be a tenant: they are the product's own hostnames. */
export const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "apps",
  "admin",
  "api",
  "super",
  "mail",
  "static",
  "assets",
  "status",
  "docs",
  "support",
  "billing",
  "signup",
  "pricing",
]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}

export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}
