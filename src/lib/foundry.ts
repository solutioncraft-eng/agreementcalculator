import { createHmac } from "node:crypto";

/**
 * Foundry is SolutionCraft's ticketing application. Requests are posted to its
 * `tickets-intake` function using a per-application credential, which binds
 * the ticket to this application on Foundry's side: either an HMAC pair
 * (client id + signing secret) or a bearer intake key (`fk_…`).
 */
const DEFAULT_INTAKE_URL = "https://ibzrcrcsulqiecvovmuy.supabase.co/functions/v1/tickets-intake";

export type FoundryQueue = "support" | "enhancement";

export interface FoundryRequest {
  queue: FoundryQueue;
  subject: string;
  description: string;
  requesterName: string;
  requesterEmail: string;
}

export class FoundryError extends Error {}

function credential():
  | { kind: "hmac"; clientId: string; signingSecret: string }
  | { kind: "bearer"; key: string }
  | null {
  const clientId = process.env.FOUNDRY_CLIENT_ID;
  const signingSecret = process.env.FOUNDRY_SIGNING_SECRET;
  if (clientId && signingSecret) return { kind: "hmac", clientId, signingSecret };
  const key = process.env.FOUNDRY_INTAKE_KEY;
  if (key) return { kind: "bearer", key };
  return null;
}

export function foundryConfigured(): boolean {
  return credential() !== null;
}

export async function submitToFoundry(request: FoundryRequest): Promise<void> {
  const cred = credential();
  if (!cred) throw new FoundryError("Support requests are not switched on for this deployment.");
  const url = process.env.FOUNDRY_INTAKE_URL ?? DEFAULT_INTAKE_URL;

  const body = JSON.stringify({
    queue_hint: request.queue,
    subject: request.subject,
    description: request.description,
    requester_name: request.requesterName,
    requester_email: request.requesterEmail,
    source: "webhook",
  });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cred.kind === "hmac") {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    headers["X-Foundry-Client"] = cred.clientId;
    headers["X-Foundry-Timestamp"] = timestamp;
    headers["X-Foundry-Signature"] = `sha256=${createHmac("sha256", cred.signingSecret)
      .update(`${timestamp}.${body}`)
      .digest("hex")}`;
  } else {
    headers["X-Intake-Secret"] = cred.key;
  }

  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers, body });
  } catch {
    throw new FoundryError("Foundry could not be reached. Try again in a moment.");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("foundry intake failed", response.status, text.slice(0, 500));
    throw new FoundryError("Foundry did not accept the request. Try again in a moment.");
  }
}
