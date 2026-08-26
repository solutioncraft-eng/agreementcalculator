import Link from "next/link";
import { requireTenant } from "@/lib/auth";
import { getActiveConfig } from "@/lib/pricing/config";
import { DEFAULT_INPUTS } from "@/lib/pricing/defaults";
import { startingInputs } from "@/lib/pricing/models";
import { CalculatorClient } from "./calculator-client";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const { tenant, role, db } = await requireTenant();
  const config = await getActiveConfig(db, tenant);

  if (!config) {
    return (
      <div className="card max-w-xl">
        <p className="eyebrow">Not ready</p>
        <h1 className="mt-2 text-[26px]">No published pricing version</h1>
        <p className="mt-3 text-slate">
          The calculator needs a published pricing version before it can quote. An administrator can create
          and publish one from the pricing settings.
        </p>
        {role === "ADMIN" ? (
          <Link href="/admin/pricing" className="btn-primary mt-5 inline-block">
            Go to pricing settings
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <CalculatorClient config={config} defaults={{ ...DEFAULT_INPUTS, ...startingInputs(config) }} />
  );
}
