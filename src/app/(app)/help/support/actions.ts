"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { requireTenant } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { FoundryError, submitToFoundry } from "@/lib/foundry";
import { APP_VERSION_STAMP } from "@/lib/version";

export interface SupportState {
  error?: string;
  ok?: string;
}

const schema = z.object({
  kind: z.enum(["support", "enhancement"]),
  subject: z.string().trim().min(4, "Give the request a short title.").max(200, "Keep the title under 200 characters."),
  description: z
    .string()
    .trim()
    .min(10, "Add a little more detail so we can act on it.")
    .max(10_000, "Keep the description under 10,000 characters."),
  page: z.string().trim().max(500).optional(),
});

export async function submitSupportRequest(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const { user, tenant, role } = await requireTenant();

  const parsed = schema.safeParse({
    kind: formData.get("kind"),
    subject: formData.get("subject") ?? "",
    description: formData.get("description") ?? "",
    page: formData.get("page") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the request details." };
  const { kind, subject, description, page } = parsed.data;

  const userAgent = (await headers()).get("user-agent") ?? "";
  const context = [
    `Application: Agreement Calculator ${APP_VERSION_STAMP}`,
    `Tenant: ${tenant.name} (${tenant.slug}, ${tenant.id})`,
    `Requester: ${user.name} <${user.email}> · ${role}`,
    page ? `Page: ${page}` : null,
    userAgent ? `Browser: ${userAgent}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await submitToFoundry({
      queue: kind,
      subject: `[${tenant.name}] ${subject}`,
      description: `${description}\n\n---\n${context}`,
      requesterName: user.name,
      requesterEmail: user.email,
    });
  } catch (error) {
    return { error: error instanceof FoundryError ? error.message : "The request could not be sent." };
  }

  await audit({
    action: kind === "support" ? "SUPPORT_REQUEST_SENT" : "ENHANCEMENT_REQUEST_SENT",
    summary: `${kind === "support" ? "Support" : "Enhancement"} request "${subject}" sent to Foundry by ${user.name}`,
    entity: "Foundry",
    after: { kind, subject },
    tenantId: tenant.id,
    actor: user,
  });

  return {
    ok:
      kind === "support"
        ? "Thanks — your support request is with SolutionCraft. We'll reply by email."
        : "Thanks — your enhancement request has been filed. We'll let you know what happens to it.",
  };
}
