"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { UploadError, uploadTenantLogo } from "@/lib/storage";

export interface BrandingState {
  error?: string;
  ok?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

const schema = z.object({
  advantageLabel: z.string().trim().min(1, "Name the base tier.").max(40),
  pinnacleLabel: z.string().trim().min(1, "Name the upper tier.").max(40),
  accentColor: z
    .string()
    .trim()
    .refine((value) => value === "" || HEX.test(value), "Use a hex colour such as #F26B21"),
  pdfFooter: z.string().trim().max(240, "Keep the PDF footer under 240 characters.").optional(),
  logoUrl: z
    .string()
    .trim()
    .refine((value) => value === "" || /^https:\/\/\S+$/.test(value), "A logo URL must be https."),
});

export async function saveBranding(_prev: BrandingState, formData: FormData): Promise<BrandingState> {
  const { user, tenant, db } = await requireRole("ADMIN");

  const parsed = schema.safeParse({
    advantageLabel: formData.get("advantageLabel"),
    pinnacleLabel: formData.get("pinnacleLabel"),
    accentColor: formData.get("accentColor") ?? "",
    pdfFooter: formData.get("pdfFooter") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the branding details." };

  let logoUrl = parsed.data.logoUrl || null;
  const upload = formData.get("logoFile");
  if (upload instanceof File && upload.size > 0) {
    try {
      logoUrl = await uploadTenantLogo(tenant.id, upload);
    } catch (error) {
      return { error: error instanceof UploadError ? error.message : "The logo could not be uploaded." };
    }
  }

  const before = {
    logoUrl: tenant.logoUrl,
    accentColor: tenant.accentColor,
    pdfFooter: tenant.pdfFooter,
    advantageLabel: tenant.advantageLabel,
    pinnacleLabel: tenant.pinnacleLabel,
  };
  const after = {
    logoUrl,
    accentColor: parsed.data.accentColor || null,
    pdfFooter: parsed.data.pdfFooter || null,
    advantageLabel: parsed.data.advantageLabel,
    pinnacleLabel: parsed.data.pinnacleLabel,
  };

  await db.tenant.update({ where: { id: tenant.id }, data: after });

  await audit({
    action: "TENANT_BRANDING_UPDATED",
    entity: "Tenant",
    entityId: tenant.id,
    summary: `Branding updated for ${tenant.name} by ${user.name}`,
    before,
    after,
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath("/admin/branding");
  return { ok: "Branding saved. New exports use it immediately." };
}
