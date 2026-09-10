import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getTenantSession } from "@/lib/auth";
import { submitToFoundry } from "@/lib/foundry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  queue_hint: z.string().optional(),
  subject: z.string().optional(),
  description: z.string().optional(),
  requester_name: z.string().nullish(),
  requester_email: z.string().nullish(),
});

export async function POST(request: Request) {
  const session = await getTenantSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, tenant } = session;

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const input = parsed.data;

  const queue = input.queue_hint === "enhancement" ? "enhancement" : "support";
  const subject = String(input.subject ?? "");
  try {
    const result = await submitToFoundry({
      queue,
      subject,
      description: String(input.description ?? ""),
      requesterName: input.requester_name || user.name || null,
      requesterEmail: input.requester_email || user.email || null,
    });

    if (result.status === 200 || result.status === 201) {
      await audit({
        action: queue === "support" ? "SUPPORT_REQUEST_SENT" : "ENHANCEMENT_REQUEST_SENT",
        summary: `${queue === "support" ? "Support" : "Enhancement"} request "${subject}" sent to Foundry by ${user.name}`,
        entity: "Foundry",
        after: { queue, subject },
        tenantId: tenant.id,
        actor: user,
      });
    }

    return new NextResponse(result.body, {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("foundry-intake-proxy error:", error);
    return NextResponse.json({ error: "intake_failed" }, { status: 500 });
  }
}
