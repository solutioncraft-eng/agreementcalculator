import { headers } from "next/headers";
import type { Tenant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { RESERVED_SLUGS } from "@/lib/slug";

export { RESERVED_SLUGS, isValidSlug, slugFromName } from "@/lib/slug";

/** The host the product itself answers on, e.g. `agreementcalculator.com`. */
export function rootDomain(): string {
  const configured = process.env.APP_ROOT_DOMAIN;
  if (configured) return configured.toLowerCase();
  try {
    return new URL(process.env.APP_BASE_URL ?? "http://localhost:3000").hostname.toLowerCase();
  } catch {
    return "localhost";
  }
}

/**
 * Tenant slug taken from the request host: `acme.agreementcalculator.com` →
 * `acme`. Returns null on the product's own hostnames, where the active tenant
 * comes from the session instead.
 *
 * Vercel preview deployments and `localhost` have no room for a subdomain, so
 * there the slug is not in the host and the session decides.
 */
export async function slugFromHost(): Promise<string | null> {
  const host = (await headers()).get("host")?.split(":")[0]?.toLowerCase();
  if (!host) return null;

  const root = rootDomain();
  if (host === root || !host.endsWith(`.${root}`)) return null;

  const label = host.slice(0, -(root.length + 1));
  if (!label || label.includes(".")) return null;
  return RESERVED_SLUGS.has(label) ? null : label;
}

export async function tenantFromHost(): Promise<Tenant | null> {
  const slug = await slugFromHost();
  return slug ? prisma.tenant.findUnique({ where: { slug } }) : null;
}

/** Absolute URL of a path on a tenant's own hostname. */
export function tenantUrl(slug: string, path: string): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const url = new URL(base);
  const root = rootDomain();
  // Without a real domain (localhost, previews) there is nowhere to put the
  // subdomain, so the tenant stays wherever the session says it is.
  if (url.hostname.toLowerCase() === root && root !== "localhost") {
    url.hostname = `${slug}.${root}`;
  }
  url.pathname = path;
  return url.toString();
}
