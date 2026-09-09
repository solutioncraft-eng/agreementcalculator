/**
 * MSP Cadence is SolutionCraft's account-management application. Its
 * `quote-customer-directory` function is a read-only view of a tenant's
 * customers, authenticated with a per-application shared key rather than a
 * user session. A workspace here is linked to exactly one MSP Cadence tenant
 * through `Tenant.mspCadenceTenantId`; that id is what scopes every read.
 */
const DEFAULT_DIRECTORY_URL =
  "https://rifynfswkfuzfwmrfnif.supabase.co/functions/v1/quote-customer-directory";

export interface MspCadenceCustomer {
  id: string;
  name: string;
  website: string | null;
  logoUrl: string | null;
  primaryContactPhone: string | null;
  technicalPocName: string | null;
  technicalPocEmail: string | null;
  executiveSponsorName: string | null;
  executiveSponsorEmail: string | null;
}

/** Wire shape returned by the directory function. */
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

export class MspCadenceError extends Error {}

function credential(): { url: string; key: string } | null {
  const key = process.env.MSPCADENCE_DIRECTORY_KEY;
  if (!key) return null;
  return { url: process.env.MSPCADENCE_DIRECTORY_URL || DEFAULT_DIRECTORY_URL, key };
}

/** True when this deployment can talk to the directory at all. */
export function mspCadenceConfigured(): boolean {
  return credential() !== null;
}

/**
 * Only logos hosted by the MSP Cadence project are fetched server-side: the
 * URL arrives in the export payload, so this keeps the export route from
 * being pointed at arbitrary hosts.
 */
export function isMspCadenceAssetUrl(url: string | null | undefined): boolean {
  const cred = credential();
  if (!cred || !url) return false;
  try {
    const asset = new URL(url);
    return asset.protocol === "https:" && asset.host === new URL(cred.url).host;
  } catch {
    return false;
  }
}

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function websiteOf(client: DirectoryClient): string | null {
  const raw = blank(client.website) ?? blank(client.primary_domain);
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function toCustomer(client: DirectoryClient): MspCadenceCustomer {
  return {
    id: client.id,
    name: client.name,
    website: websiteOf(client),
    logoUrl: blank(client.logo_url),
    primaryContactPhone: blank(client.primary_contact_phone),
    technicalPocName: blank(client.technical_poc_name),
    technicalPocEmail: blank(client.technical_poc_email),
    executiveSponsorName: blank(client.executive_sponsor_name),
    executiveSponsorEmail: blank(client.executive_sponsor_email),
  };
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const cred = credential();
  if (!cred) throw new MspCadenceError("The MSP Cadence customer lookup is not switched on for this deployment.");
  let response: Response;
  try {
    response = await fetch(cred.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cred.key}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new MspCadenceError("MSP Cadence could not be reached. Try again in a moment.");
  }
  if (response.status === 404) throw new MspCadenceError("That customer is no longer in MSP Cadence.");
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("mspcadence directory failed", response.status, text.slice(0, 500));
    throw new MspCadenceError("MSP Cadence did not answer the lookup. Try again in a moment.");
  }
  return (await response.json()) as T;
}

/** Active customers of the linked tenant whose name or website matches `query`. */
export async function fetchCustomers(
  mspCadenceTenantId: string,
  query: string,
  limit = 25,
): Promise<MspCadenceCustomer[]> {
  const data = await call<{ clients: DirectoryClient[] }>({
    tenant_id: mspCadenceTenantId,
    query,
    limit,
  });
  return (data.clients ?? []).map(toCustomer);
}

export async function fetchCustomer(
  mspCadenceTenantId: string,
  customerId: string,
): Promise<MspCadenceCustomer> {
  const data = await call<{ client: DirectoryClient }>({
    tenant_id: mspCadenceTenantId,
    client_id: customerId,
  });
  return toCustomer(data.client);
}
