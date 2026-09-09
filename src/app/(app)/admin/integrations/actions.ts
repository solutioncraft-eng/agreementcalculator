"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { encryptSecret, encryptionConfigured } from "@/lib/crypto";

export interface IntegrationsState {
  error?: string;
  ok?: string;
}

const schema = z.object({
  url: z
    .string()
    .trim()
    .refine((value) => value === "" || /^https:\/\/\S+$/.test(value), "The function URL must be https."),
  tenantId: z
    .string()
    .trim()
    .refine((value) => value === "" || z.string().uuid().safeParse(value).success, "The tenant id must be a UUID."),
  // Optional so an administrator can correct the URL or tenant id without
  // re-typing a secret they cannot read back.
  key: z.string().trim().max(400).optional(),
});

export async function saveIntegration(
  _prev: IntegrationsState,
  formData: FormData,
): Promise<IntegrationsState> {
  const { user, tenant, db } = await requireRole("ADMIN");

  const parsed = schema.safeParse({
    url: formData.get("mspCadenceUrl") ?? "",
    tenantId: formData.get("mspCadenceTenantId") ?? "",
    key: formData.get("mspCadenceKey") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the connection details." };
  }

  const url = parsed.data.url || null;
  const tenantId = parsed.data.tenantId || null;
  const key = parsed.data.key || "";
  const hadKey = Boolean(tenant.mspCadenceKeyEnc);

  // Clearing the URL and tenant id disconnects the workspace; the stored key
  // goes with them rather than lingering encrypted for nothing.
  const disconnecting = !url && !tenantId && !key;
  if (!disconnecting) {
    if (!url) return { error: "Enter the MSP Cadence directory function URL." };
    if (!tenantId) return { error: "Enter the MSP Cadence tenant id." };
    if (!key && !hadKey) return { error: "Enter the MSP Cadence key." };
    if (key && !encryptionConfigured()) {
      return {
        error:
          "INTEGRATION_ENCRYPTION_KEY is not set on the server, so the key cannot be stored encrypted. Set it and try again.",
      };
    }
  }

  const keyEnc = disconnecting ? null : key ? encryptSecret(key) : tenant.mspCadenceKeyEnc;

  await db.tenant.update({
    where: { id: tenant.id },
    data: { mspCadenceUrl: url, mspCadenceTenantId: tenantId, mspCadenceKeyEnc: keyEnc },
  });

  // The audit log records that a secret changed, never the secret itself.
  await audit({
    action: "TENANT_INTEGRATION_UPDATED",
    entity: "Tenant",
    entityId: tenant.id,
    summary: `MSP Cadence integration ${disconnecting ? "disconnected" : "updated"} for ${tenant.name} by ${user.name}`,
    before: {
      mspCadenceUrl: tenant.mspCadenceUrl,
      mspCadenceTenantId: tenant.mspCadenceTenantId,
      keySet: hadKey,
    },
    after: {
      mspCadenceUrl: url,
      mspCadenceTenantId: tenantId,
      keySet: Boolean(keyEnc),
      keyChanged: Boolean(key) || (hadKey && !keyEnc),
    },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath("/admin/integrations");
  return {
    ok: disconnecting
      ? "MSP Cadence disconnected. Customer-facing quotes are switched off."
      : "MSP Cadence connection saved.",
  };
}
