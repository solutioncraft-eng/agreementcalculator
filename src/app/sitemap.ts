import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { slugFromHost } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * The public marketing pages, and only on the product's own hostname: a
 * workspace subdomain has nothing a crawler may see, so it advertises nothing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (await slugFromHost()) return [];

  const lastModified = new Date();

  return [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/signup"), lastModified, changeFrequency: "monthly", priority: 0.8 },
  ];
}
