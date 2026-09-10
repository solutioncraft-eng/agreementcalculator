import { createHmac } from "node:crypto";

/**
 * Foundry is SolutionCraft's ticketing application. Requests are posted to its
 * `tickets-intake` function signed with this application's HMAC credential
 * (client id + signing secret), which binds the ticket to this application on
 * Foundry's side. Environment variables take precedence; the Foundry-issued
 * literals are the fallback so a deployment works without extra configuration.
 */
const INTAKE_URL =
  process.env.FOUNDRY_INTAKE_URL || "https://ibzrcrcsulqiecvovmuy.supabase.co/functions/v1/tickets-intake";
const CLIENT_ID = process.env.FOUNDRY_CLIENT_ID || "fcid_d04638fb5c2b8376";
const SIGNING_SECRET =
  process.env.FOUNDRY_SIGNING_SECRET || "fss_d06303b3fccf417ec9bf2566188db1f1260138649c37dffa8cf1c8d66cc0edf6";
const ANON_BEARER =
  process.env.FOUNDRY_ANON_BEARER ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlienJjcmNzdWxxaWVjdm92bXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MDIzMzYsImV4cCI6MjA5MjA3ODMzNn0.MUIXLxFfSavOWFWY4i_7yu0ufMUnAvH5xVX1BlLILKI";

export const FOUNDRY_APPLICATION_ID = "ac0d47e0-6422-4a23-97af-940f3b1b04fa";

export type FoundryQueue = "support" | "enhancement";

export interface FoundryRequest {
  queue: FoundryQueue;
  subject: string;
  description: string;
  requesterName: string | null;
  requesterEmail: string | null;
}

export interface FoundryResponse {
  status: number;
  body: string;
}

/**
 * Signs and forwards a ticket to Foundry. Returns Foundry's status and raw
 * response body so the caller can pass them straight through.
 */
export async function submitToFoundry(request: FoundryRequest): Promise<FoundryResponse> {
  const raw = JSON.stringify({
    application_id: FOUNDRY_APPLICATION_ID,
    queue_hint: request.queue,
    subject: request.subject.slice(0, 300),
    description: request.description.slice(0, 2_000_000),
    requester_name: request.requesterName,
    requester_email: request.requesterEmail,
    source: "webhook",
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `sha256=${createHmac("sha256", SIGNING_SECRET).update(`${timestamp}.${raw}`).digest("hex")}`;

  const response = await fetch(INTAKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_BEARER}`,
      "X-Foundry-Client": CLIENT_ID,
      "X-Foundry-Timestamp": timestamp,
      "X-Foundry-Signature": signature,
    },
    body: raw,
  });
  const body = await response.text();
  if (!response.ok) console.error("foundry intake failed", response.status, body.slice(0, 500));
  return { status: response.status, body };
}
