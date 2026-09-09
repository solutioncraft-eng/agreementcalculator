"use client";

import { useActionState, useState, useTransition } from "react";
import { disconnectIntegration, saveIntegration, type IntegrationsState } from "./actions";

interface IntegrationConfig {
  /** Derived from the key on connect; shown so admins can see which deployment they are linked to. */
  host: string | null;
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
  const [disconnectState, setDisconnectState] = useState<IntegrationsState>({});
  const [disconnecting, startDisconnect] = useTransition();
  const [replacing, setReplacing] = useState(false);

  const showKeyField = !config.connected || replacing;
  const message = disconnectState.error || disconnectState.ok ? disconnectState : state;

  return (
    <div className="space-y-6">
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

        {config.connected ? (
          <p className="text-[13px] text-slate">
            Reading customers from <span className="font-mono text-ink">{config.host}</span>. The key is stored
            encrypted and never shown again.
          </p>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-slate">
            <li>
              In MSP Cadence open <span className="text-ink">Settings → Integrations → Agreement Calculator</span>{" "}
              and click <span className="text-ink">Generate key</span>.
            </li>
            <li>Copy the key (it is only shown once) and paste it below.</li>
          </ol>
        )}

        {showKeyField ? (
          <form action={action} className="space-y-3">
            <div>
              <label className="label" htmlFor="mspCadenceKey">
                MSP Cadence API key
              </label>
              <input
                id="mspCadenceKey"
                name="mspCadenceKey"
                type="password"
                autoComplete="off"
                required
                placeholder="mspc_…"
                className="field mt-1 font-mono text-[13px]"
              />
              <p className="mt-1 text-[12px] text-slate">
                The key identifies your MSP Cadence deployment and workspace, so nothing else needs to be entered.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" className="btn-primary" disabled={pending || !encryptionConfigured}>
                {pending ? "Checking key…" : config.connected ? "Replace key" : "Connect"}
              </button>
              {replacing ? (
                <button type="button" className="btn-ghost" onClick={() => setReplacing(false)}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <button type="button" className="btn-ghost" onClick={() => setReplacing(true)}>
              Replace key
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={disconnecting}
              onClick={() =>
                startDisconnect(async () => {
                  setDisconnectState(await disconnectIntegration());
                })
              }
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        )}
      </section>

      {message.error ? <p className="text-[13px] font-medium text-orange">{message.error}</p> : null}
      {message.ok ? <p className="text-[13px] font-medium text-navy">{message.ok}</p> : null}
    </div>
  );
}
