import { decryptSecret } from "@/lib/crypto";

/**
 * MSP Cadence is SolutionCraft's account-management app; its client records
 * hold the customer-facing details a quote header wants (logo, website, who to
 * talk to). Unlike Foundry, the credential is per workspace rather than per
 * deployment: each `Tenant` points at one MSP Cadence instance and tenant, and
 * stores its bearer secret encrypted (`mspCadenceKeyEnc`).
 *
 * Everything here is server-only. The decrypted secret never leaves this
 * module — API routes proxy the calls so the browser never sees it.
 */

/** The bits of a `Tenant` row this module reads. */
export interface IntegrationTenant {
  mspCadenceUrl: string | null;
  mspCadenceKeyEnc: string | null;
  mspCadenceTenantId: string | null;
}

export interface Customer {
  id: string;
  name: string;
  logoUrl: string | null;
  website: string | null;
  contactPhone: string | null;
  technicalContactName: string | null;
  technicalContactEmail: string | null;
  executiveContactName: string | null;
  executiveContactEmail: string | null;
}

export class MspCadenceError extends Error {}

/** True when the workspace has all three settings, so the picker can be used. */
export function integrationConfigured(tenant: IntegrationTenant): boolean {
  return Boolean(tenant.mspCadenceUrl && tenant.mspCadenceKeyEnc && tenant.mspCadenceTenantId);
}

/**
 * True when `url` is an https URL on the same host as the workspace's MSP
 * Cadence directory function, i.e. an asset MSP Cadence itself serves.
 */
export function isCustomerAssetUrl(url: string | null | undefined, directoryUrl: string | null | undefined): boolean {
  if (!url || !directoryUrl) return false;
  try {
    const asset = new URL(url);
    const directory = new URL(directoryUrl);
    return asset.protocol === "https:" && asset.host === directory.host;
  } catch {
    return false;
  }
}

function credential(tenant: IntegrationTenant): { url: string; key: string; tenantId: string } {
  if (!integrationConfigured(tenant)) {
    throw new MspCadenceError("MSP Cadence is not connected for this workspace.");
  }
  return {
    url: tenant.mspCadenceUrl!,
    key: decryptSecret(tenant.mspCadenceKeyEnc!),
    tenantId: tenant.mspCadenceTenantId!,
  };
}

interface DirectoryClient {
  id: string;
  name: string;
  website: string | null;
  primary_domain: string | null;
  logo_url: string | null;
  primary_contact_phone: string | null;
  technical_poc_name: string | null;
  technical_poc_email: string | null;
  executive_sponsor_name: string | null;
  executive_sponsor_email: string | null;
}

/** A bare domain ("acme.com") becomes an https URL; anything blank becomes null. */
function websiteOf(row: DirectoryClient): string | null {
  const raw = (row.website ?? row.primary_domain ?? "").trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function toCustomer(row: DirectoryClient): Customer {
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url ?? null,
    website: websiteOf(row),
    contactPhone: row.primary_contact_phone ?? null,
    technicalContactName: row.technical_poc_name ?? null,
    technicalContactEmail: row.technical_poc_email ?? null,
    executiveContactName: row.executive_sponsor_name ?? null,
    executiveContactEmail: row.executive_sponsor_email ?? null,
  };
}

async function post(tenant: IntegrationTenant, body: Record<string, unknown>): Promise<unknown> {
  const cred = credential(tenant);
  let response: Response;
  try {
    response = await fetch(cred.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cred.key}` },
      body: JSON.stringify({ tenant_id: cred.tenantId, ...body }),
      cache: "no-store",
    });
  } catch {
    throw new MspCadenceError("MSP Cadence could not be reached. Try again in a moment.");
  }
  if (!response.ok) {
    // The body may quote the request; log the status only so no secret or
    // customer data reaches the logs.
    console.error("mspcadence directory call failed", response.status);
    if (response.status === 401) {
      throw new MspCadenceError("MSP Cadence rejected the stored key. Re-enter it under Settings → Integrations.");
    }
    throw new MspCadenceError("MSP Cadence did not answer the request. Try again in a moment.");
  }
  return response.json().catch(() => {
    throw new MspCadenceError("MSP Cadence returned something unreadable.");
  });
}

export async function searchCustomers(tenant: IntegrationTenant, q: string): Promise<Customer[]> {
  const data = (await post(tenant, { q })) as { clients?: DirectoryClient[] };
  return (data.clients ?? []).map(toCustomer);
}

export async function getCustomer(tenant: IntegrationTenant, clientId: string): Promise<Customer> {
  const data = (await post(tenant, { client_id: clientId })) as { client?: DirectoryClient };
  if (!data.client) throw new MspCadenceError("That customer is no longer in MSP Cadence.");
  return toCustomer(data.client);
}
