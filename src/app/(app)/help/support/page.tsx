import Link from "next/link";
import { requireTenant } from "@/lib/auth";
import { SupportForms } from "./support-form";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const { user } = await requireTenant();

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

      <SupportForms fullName={user.name} email={user.email} />
    </div>
  );
}
