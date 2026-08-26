/**
 * Tenant logo storage on Supabase Storage.
 *
 * The app's filesystem is read-only on Vercel, so uploads go straight to a
 * public bucket over the Storage REST API — no SDK, and the service key never
 * leaves the server. With the bucket unconfigured, branding still works: an
 * administrator can point `logoUrl` at an image they host themselves.
 */

const MAX_BYTES = 512 * 1024;
const ALLOWED = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/svg+xml", "svg"],
  ["image/webp", "webp"],
]);

function config(): { url: string; key: string; bucket: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    url: url.replace(/\/$/, ""),
    key,
    bucket: process.env.SUPABASE_LOGO_BUCKET ?? "tenant-logos",
  };
}

export const uploadsConfigured = config() !== null;

export class UploadError extends Error {}

/**
 * Stores a logo for a tenant and returns its public URL. The object path is
 * keyed by tenant and stamped, so a replaced logo cannot be served from a
 * stale CDN cache.
 */
export async function uploadTenantLogo(tenantId: string, file: File): Promise<string> {
  const target = config();
  if (!target) throw new UploadError("Logo uploads are not configured — paste a hosted image URL instead.");

  const extension = ALLOWED.get(file.type);
  if (!extension) throw new UploadError("Use a PNG, JPEG, SVG or WebP image.");
  if (file.size === 0) throw new UploadError("That file is empty.");
  if (file.size > MAX_BYTES) throw new UploadError("Keep the logo under 512 KB.");

  const objectPath = `${tenantId}/logo-${Date.now()}.${extension}`;
  const response = await fetch(
    `${target.url}/storage/v1/object/${target.bucket}/${objectPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.key}`,
        "Content-Type": file.type,
        "cache-control": "public, max-age=31536000, immutable",
      },
      body: Buffer.from(await file.arrayBuffer()),
    },
  );

  if (!response.ok) {
    throw new UploadError(`Storage rejected the upload (${response.status}).`);
  }

  return `${target.url}/storage/v1/object/public/${target.bucket}/${objectPath}`;
}
