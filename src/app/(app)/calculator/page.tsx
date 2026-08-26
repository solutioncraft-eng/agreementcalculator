import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveConfig } from "@/lib/pricing/config";
import { DEFAULT_INPUTS } from "@/lib/pricing/defaults";
import { CalculatorClient } from "./calculator-client";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const user = await requireUser();
  const config = await getActiveConfig();

  if (!config) {
    return (
      <div className="card max-w-xl">
        <p className="eyebrow">Not ready</p>
        <h1 className="mt-2 text-[26px]">No published pricing version</h1>
        <p className="mt-3 text-slate">
          The calculator needs a published pricing version before it can quote. An administrator can create
          and publish one from the pricing settings.
        </p>
        {user.role === "ADMIN" ? (
          <Link href="/admin/pricing" className="btn-primary mt-5 inline-block">
            Go to pricing settings
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <CalculatorClient
      config={config}
      defaults={{
        ...DEFAULT_INPUTS,
        sgmPct: config.defaultSgmPct,
        perUserFloor: config.minPerUserFloor,
        floorOverride: false,
        addonMultiplier: config.addonMultiplier,
        bundleKey: "none",
      }}
    />
  );
}
