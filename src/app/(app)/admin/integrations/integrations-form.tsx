"use client";

import { useActionState } from "react";
import { saveIntegration, type IntegrationsState } from "./actions";

interface IntegrationConfig {
  url: string | null;
  tenantId: string | null;
  /** Whether a key is stored. The key itself is never sent to the browser. */
  keySet: boolean;
  connected: boolean;
}

export function IntegrationsForm({
  config,
  encryptionConfigured,
}: {
  config: IntegrationConfig;
  encryptionConfigured: boolean;
}) {
  const [state, action, pending] = useActionState<IntegrationsState, FormData>(saveIntegration, {});

  return (
    <form action={action} className="space-y-6">
      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[20px]">MSP Cadence</h2>
          <span className="font-mono text-[11px] uppercase tracking-eyebrow text-slate">
            {config.connected ? "Connected" : "Not connected"}
          </span>
        </div>

        {!encryptionConfigured ? (
          <p className="rounded-brand bg-orange/10 px-3 py-2 text-[13px] text-orange-dark">
            <code>INTEGRATION_ENCRYPTION_KEY</code> is not set on this deployment, so a key cannot be stored
            encrypted. Set it (32 random bytes, base64) and reload before connecting.
          </p>
        ) : null}

        <div>
          <label className="label" htmlFor="mspCadenceUrl">
            Directory function URL
          </label>
          <input
            id="mspCadenceUrl"
            name="mspCadenceUrl"
            type="url"
            defaultValue={config.url ?? ""}
            placeholder="https://your-project.supabase.co/functions/v1/quote-customer-directory"
            className="field mt-1 font-mono text-[13px]"
          />
        </div>

        <div>
          <label className="label" htmlFor="mspCadenceTenantId">
            MSP Cadence tenant id
          </label>
          <input
            id="mspCadenceTenantId"
            name="mspCadenceTenantId"
            defaultValue={config.tenantId ?? ""}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="field mt-1 font-mono text-[13px]"
          />
          <p className="mt-1 text-[12px] text-slate">
            Which MSP Cadence workspace this one reads customers from.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="mspCadenceKey">
            Directory key
          </label>
          <input
            id="mspCadenceKey"
            name="mspCadenceKey"
            type="password"
            autoComplete="off"
            placeholder={config.keySet ? "•••••••• (stored) — type to replace" : "Paste the key from MSP Cadence"}
            className="field mt-1 font-mono text-[13px]"
          />
          <p className="mt-1 text-[12px] text-slate">
            Stored encrypted (AES-256-GCM) and never shown again — leave it blank to keep the current key.
            It is the <code>QUOTE_DIRECTORY_KEY</code> secret set on your MSP Cadence project.
          </p>
        </div>

        <p className="text-[12px] text-slate">
          Clear all three fields and save to disconnect.
        </p>
      </section>

      {state.error ? <p className="text-[13px] font-medium text-orange">{state.error}</p> : null}
      {state.ok ? <p className="text-[13px] font-medium text-navy">{state.ok}</p> : null}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save connection"}
      </button>
    </form>
  );
}
