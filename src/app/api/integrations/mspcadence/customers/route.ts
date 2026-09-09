import { NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth";
import { CryptoError } from "@/lib/crypto";
import { integrationConfigured, searchCustomers, MspCadenceError } from "@/lib/mspcadence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Customer search behind the calculator's quote picker. The workspace's MSP
 * Cadence key stays on the server, so the browser asks this route instead of
 * MSP Cadence directly. Any signed-in member may search: configuring the
 * connection is an administrator's job, using it is part of building a quote.
 */
export async function GET(request: Request) {
  const session = await getTenantSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { tenant } = session;
  if (!integrationConfigured(tenant)) {
    return NextResponse.json({ error: "MSP Cadence is not connected for this workspace." }, { status: 409 });
  }

  const q = new URL(request.url).searchParams.get("q")?.slice(0, 120) ?? "";
  try {
    return NextResponse.json({ customers: await searchCustomers(tenant, q) });
  } catch (error) {
    if (error instanceof MspCadenceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof CryptoError) {
      return NextResponse.json(
        { error: "The stored MSP Cadence key could not be read. An administrator needs to re-enter it." },
        { status: 500 },
      );
    }
    console.error("mspcadence customer search failed", error);
    return NextResponse.json({ error: "The customer directory could not be read." }, { status: 500 });
  }
}
