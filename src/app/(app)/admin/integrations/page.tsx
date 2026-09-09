import { requireRole } from "@/lib/auth";
import { encryptionConfigured } from "@/lib/crypto";
import { integrationConfigured } from "@/lib/mspcadence";
import { IntegrationsForm } from "./integrations-form";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const { tenant } = await requireRole("ADMIN");

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 text-[32px] leading-9">Integrations</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Connect this workspace to your MSP Cadence instance and anyone who can export an agreement can build
          a customer-facing quote: pick the customer and their logo, website and contacts fill the PDF header.
          Pricing, approvals and the export log are untouched by this.
        </p>
      </header>

      <IntegrationsForm
        config={{
          url: tenant.mspCadenceUrl,
          tenantId: tenant.mspCadenceTenantId,
          // Only whether a key exists — the encrypted value never leaves the server.
          keySet: Boolean(tenant.mspCadenceKeyEnc),
          connected: integrationConfigured(tenant),
        }}
        encryptionConfigured={encryptionConfigured()}
      />
    </div>
  );
}
