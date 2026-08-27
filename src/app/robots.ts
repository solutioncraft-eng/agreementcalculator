import type { MetadataRoute } from "next";
import { rootDomain, slugFromHost } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * Only the marketing pages are indexable, and only on the product's own
 * hostname: a workspace subdomain is somebody's private pricing and stays shut
 * to crawlers entirely.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (await slugFromHost()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/signup"],
        disallow: [
          "/login",
          "/forgot-password",
          "/reset-password",
          "/calculator",
          "/quotes",
          "/reviews",
          "/admin",
          "/super",
          "/workspaces",
          "/account",
          "/no-workspace",
          "/trial-ended",
          "/api",
        ],
      },
    ],
    host: process.env.APP_BASE_URL ?? `https://${rootDomain()}`,
  };
}
