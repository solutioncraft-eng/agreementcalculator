"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { encryptSecret, encryptionConfigured } from "@/lib/crypto";
import { MspCadenceError, parseApiKey, verifyApiKey } from "@/lib/mspcadence";

export interface IntegrationsState {
  error?: string;
  ok?: string;
}

/**
 * Connect the workspace with one pasted MSP Cadence API key. The key names its
 * deployment (project ref) and MSP Cadence tells us which tenant it belongs to,
 * so the URL and tenant id are derived rather than typed.
 */
export async function saveIntegration(
  _prev: IntegrationsState,
  formData: FormData,
): Promise<IntegrationsState> {
  const { user, tenant, db } = await requireRole("ADMIN");

  const raw = String(formData.get("mspCadenceKey") ?? "").trim();
  if (!raw) return { error: "Paste the API key generated in MSP Cadence." };
  if (raw.length > 400 || !parseApiKey(raw)) {
    return { error: "That does not look like an MSP Cadence API key. It starts with mspc_ and is copied from MSP Cadence → Settings → Integrations → Agreement Calculator." };
  }
  if (!encryptionConfigured()) {
    return {
      error:
        "INTEGRATION_ENCRYPTION_KEY is not set on the server, so the key cannot be stored encrypted. Set it and try again.",
    };
  }

  let verified: { url: string; tenantId: string };
  try {
    verified = await verifyApiKey(raw);
  } catch (err) {
    return { error: err instanceof MspCadenceError ? err.message : "MSP Cadence could not verify the key." };
  }

  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      mspCadenceUrl: verified.url,
      mspCadenceTenantId: verified.tenantId,
      mspCadenceKeyEnc: encryptSecret(raw),
    },
  });

  // The audit log records that a secret changed, never the secret itself.
  await audit({
    action: "TENANT_INTEGRATION_UPDATED",
    entity: "Tenant",
    entityId: tenant.id,
    summary: `MSP Cadence connected for ${tenant.name} by ${user.name}`,
    before: {
      mspCadenceUrl: tenant.mspCadenceUrl,
      mspCadenceTenantId: tenant.mspCadenceTenantId,
      keySet: Boolean(tenant.mspCadenceKeyEnc),
    },
    after: { mspCadenceUrl: verified.url, mspCadenceTenantId: verified.tenantId, keySet: true, keyChanged: true },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath("/admin/integrations");
  return { ok: "MSP Cadence connected. Customer lookup is available in the calculator." };
}

export async function disconnectIntegration(): Promise<IntegrationsState> {
  const { user, tenant, db } = await requireRole("ADMIN");

  await db.tenant.update({
    where: { id: tenant.id },
    data: { mspCadenceUrl: null, mspCadenceTenantId: null, mspCadenceKeyEnc: null },
  });

  await audit({
    action: "TENANT_INTEGRATION_UPDATED",
    entity: "Tenant",
    entityId: tenant.id,
    summary: `MSP Cadence disconnected for ${tenant.name} by ${user.name}`,
    before: {
      mspCadenceUrl: tenant.mspCadenceUrl,
      mspCadenceTenantId: tenant.mspCadenceTenantId,
      keySet: Boolean(tenant.mspCadenceKeyEnc),
    },
    after: { mspCadenceUrl: null, mspCadenceTenantId: null, keySet: false, keyChanged: Boolean(tenant.mspCadenceKeyEnc) },
    tenantId: tenant.id,
    actor: user,
  });

  revalidatePath("/admin/integrations");
  return { ok: "MSP Cadence disconnected. Customer-facing quotes are switched off." };
}
