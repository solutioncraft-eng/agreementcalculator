import Link from "next/link";
import { requireTenant } from "@/lib/auth";
import { foundryConfigured } from "@/lib/foundry";
import { SupportForm } from "./support-form";

export const dynamic = "force-dynamic";

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { user } = await requireTenant();
  const { page } = await searchParams;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Help</p>
        <h1 className="mt-2 text-[32px] leading-9">Support &amp; requests</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Report a problem or ask for an enhancement. Requests go straight to SolutionCraft&apos;s Foundry
          queue and you&apos;ll hear back by email. Before you write, check{" "}
          <Link href="/help/changelog" className="font-medium text-orange">
            what&apos;s new
          </Link>{" "}
          in case it has already shipped.
        </p>
      </header>

      {foundryConfigured() ? (
        <SupportForm requester={`${user.name} <${user.email}>`} initialPage={page ?? ""} />
      ) : (
        <section className="card">
          <p className="text-[15px] text-ink">
            Support requests are not switched on for this deployment yet. An operator needs to set a Foundry intake credential ({" "}
            <code className="font-mono text-[13px]">FOUNDRY_CLIENT_ID</code> and{" "}
            <code className="font-mono text-[13px]">FOUNDRY_SIGNING_SECRET</code>); until then, contact
            SolutionCraft directly.
          </p>
        </section>
      )}
    </div>
  );
}
