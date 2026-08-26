"use client";

import { useActionState, useMemo, useState } from "react";
import clsx from "clsx";
import {
  money,
  moneyRounded,
  type CalcInputs,
  type PricingConfig,
  type Tier,
  type TierResult,
} from "@/lib/pricing/engine";
import { calculate } from "@/lib/pricing/models";
import { submitForReview, type SubmitState } from "./actions";
import { downloadExport } from "@/lib/export-client";

const UNIT_LABEL: Record<string, string> = {
  USER: "per user",
  DEVICE: "per device",
  LOCATION: "per location",
  FLAT: "per agreement",
};

export function CalculatorClient({
  config,
  defaults,
}: {
  config: PricingConfig;
  defaults: CalcInputs;
}) {
  const [inputs, setInputs] = useState<CalcInputs>(defaults);
  const [tier, setTier] = useState<Tier>("ADVANTAGE");
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [showCosts, setShowCosts] = useState(true);
  const [exportError, setExportError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [state, submitAction, submitting] = useActionState<SubmitState, FormData>(submitForReview, {});

  const result = useMemo(() => calculate(config, inputs), [config, inputs]);
  const set = <K extends keyof CalcInputs>(key: K, value: CalcInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const selected = tier === "PINNACLE" ? result.pinnacle : result.advantage;

  async function runExport(docType: "QUOTE" | "COGS") {
    setExportError(null);
    if (!clientName.trim()) {
      setExportError("Enter a client name before exporting.");
      return;
    }
    setBusy(docType);
    const error = await downloadExport({ docType, tier, clientName, notes, inputs });
    setBusy(null);
    if (error) setExportError(error);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Agreement calculator</p>
          <h1 className="mt-2 text-[32px] leading-9">Build a managed services agreement</h1>
        </div>
        <div className="text-right text-[13px] text-slate">
          <p>
            Pricing version{" "}
            <span className="font-display font-bold text-navy">{config.versionLabel}</span>
          </p>
          <p>Cost basis {config.costBasis}</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <section className="card">
            <h2 className="text-[18px]">Environment</h2>
            <div className="mt-4 space-y-4">
              <Counter label="Users" value={inputs.users} min={1} max={2000} onChange={(v) => set("users", v)} />
              <Counter
                label="Devices"
                value={inputs.devices}
                min={0}
                max={5000}
                onChange={(v) => set("devices", v)}
              />
              <Counter
                label="Locations"
                value={inputs.locations}
                min={0}
                max={100}
                onChange={(v) => set("locations", v)}
              />
            </div>
          </section>

          <section className="card">
            <h2 className="text-[18px]">Pricing levers</h2>
            <div className="mt-4 space-y-5">
              {config.model === "COST_PLUS" ? (
                <div>
                  <div className="flex items-baseline justify-between">
                    <label className="label" htmlFor="sgm">
                      Service gross margin
                    </label>
                    <span
                      className={clsx(
                        "font-display text-[18px] font-bold",
                        inputs.sgmPct === config.settings.defaultSgmPct ? "text-navy" : "text-orange",
                      )}
                    >
                      {inputs.sgmPct}%
                    </span>
                  </div>
                  <input
                    id="sgm"
                    type="range"
                    min={0}
                    max={config.settings.maxSgmPct}
                    step={1}
                    value={inputs.sgmPct}
                    onChange={(e) => set("sgmPct", Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                  <p className="mt-1 text-[12px] text-slate">
                    Default {config.settings.defaultSgmPct}% · derived multiplier{" "}
                    {result.multiplier.toFixed(2)}×
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-baseline justify-between">
                    <label className="label" htmlFor="markup">
                      Markup on tool cost
                    </label>
                    <span
                      className={clsx(
                        "font-display text-[18px] font-bold",
                        inputs.markupMultiple === config.settings.defaultMarkup
                          ? "text-navy"
                          : "text-orange",
                      )}
                    >
                      {inputs.markupMultiple.toFixed(2)}×
                    </span>
                  </div>
                  <input
                    id="markup"
                    type="range"
                    min={1}
                    max={Math.max(config.settings.defaultMarkup * 2, 8)}
                    step={0.05}
                    value={inputs.markupMultiple}
                    onChange={(e) => set("markupMultiple", Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                  <p className="mt-1 text-[12px] text-slate">
                    Default {config.settings.defaultMarkup}× · review below {config.settings.minMarkup}×
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="floor">
                    Per-user floor
                  </label>
                  <input
                    id="floor"
                    type="number"
                    min={0}
                    step={5}
                    value={inputs.perUserFloor}
                    onChange={(e) => set("perUserFloor", Number(e.target.value))}
                    className={clsx(
                      "field mt-1",
                      inputs.perUserFloor !== config.settings.minPerUserFloor && "field-alert",
                    )}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="addon">
                    Add-on {config.model === "COST_PLUS" ? "multiplier" : "markup"}
                  </label>
                  <input
                    id="addon"
                    type="number"
                    min={1}
                    step={0.01}
                    value={inputs.addonMultiplier}
                    onChange={(e) => set("addonMultiplier", Number(e.target.value))}
                    disabled={config.model !== "COST_PLUS"}
                    className={clsx(
                      "field mt-1",
                      config.model === "COST_PLUS" &&
                        inputs.addonMultiplier !== config.settings.addonMultiplier &&
                        "field-alert",
                    )}
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 text-[14px]">
                <input
                  type="checkbox"
                  checked={inputs.floorOverride}
                  onChange={(e) => set("floorOverride", e.target.checked)}
                  className="mt-1 h-4 w-4 accent-orange"
                />
                <span>
                  <span className="font-semibold text-navy">Override the per-user floor</span>
                  <span className="block text-[12px] text-slate">
                    Show the calculated rate even when it falls below {money(inputs.perUserFloor)} per user.
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section className="card">
            <h2 className="text-[18px]">Bundle</h2>
            <div className="mt-3 space-y-2">
              {config.bundles.map((b) => (
                <label
                  key={b.key}
                  className={clsx(
                    "flex cursor-pointer items-center justify-between rounded-brand border px-3 py-2 transition",
                    inputs.bundleKey === b.key
                      ? "border-orange bg-orange/5"
                      : "border-mist hover:border-slate",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="bundle"
                      value={b.key}
                      checked={inputs.bundleKey === b.key}
                      onChange={() => set("bundleKey", b.key)}
                      className="h-4 w-4 accent-orange"
                    />
                    <span>
                      <span className="text-[14px] font-semibold text-navy">{b.label}</span>
                      {b.description ? (
                        <span className="block text-[12px] text-slate">{b.description}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="font-display text-[15px] font-bold text-orange">
                    {b.discountPct > 0 ? `-${b.discountPct}%` : "—"}
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {result.needsApproval ? (
            <section className="rounded-brand border border-orange bg-orange/5 p-5">
              <p className="eyebrow">Leadership review required</p>
              <h2 className="mt-2 text-[20px] text-orange-dark">
                This configuration falls outside standard pricing
              </h2>
              <ul className="mt-3 space-y-1 text-[14px]">
                {result.triggers.map((t) => (
                  <li key={t.code} className="flex gap-2">
                    <span className="text-orange">▸</span>
                    <span>{t.message}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[13px] text-slate">
                PDF export is disabled until a leader approves. Submit it for review below.
              </p>
            </section>
          ) : (
            <section className="rounded-brand border border-mist bg-white p-4 text-[14px]">
              <span className="tag">Standard pricing</span>
              <span className="ml-3 text-slate">
                Within policy — no review needed, PDFs can be exported now.
              </span>
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <TierCard
              name={config.tierLabels.ADVANTAGE}
              blurb="Core managed services"
              tierResult={result.advantage}
              selected={tier === "ADVANTAGE"}
              onSelect={() => setTier("ADVANTAGE")}
            />
            <TierCard
              name={config.tierLabels.PINNACLE}
              blurb={`${config.tierLabels.ADVANTAGE} plus the security stack`}
              tierResult={result.pinnacle}
              selected={tier === "PINNACLE"}
              onSelect={() => setTier("PINNACLE")}
              footnote={`+${moneyRounded(result.delta.discountedRate)}/mo over ${config.tierLabels.ADVANTAGE}`}
            />
          </div>

          <section className="card">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px]">Cost build — {config.tierLabels[tier]}</h2>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setShowCosts((v) => !v)}>
                {showCosts ? "Hide costs" : "Show costs"}
              </button>
            </div>

            {showCosts ? (
              <>
                <table className="mt-4 w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-navy text-left font-display text-[11px] uppercase tracking-eyebrow text-slate">
                      <th className="pb-2">Item</th>
                      <th className="pb-2">Basis</th>
                      <th className="pb-2 text-right">Unit</th>
                      <th className="pb-2 text-right">Qty</th>
                      <th className="pb-2 text-right">Monthly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tier === "PINNACLE"
                      ? [...result.advantage.lines, ...result.pinnacle.lines]
                      : result.advantage.lines
                    ).map((l) => (
                      <tr key={`${l.tier}-${l.key}`} className="border-b border-mist">
                        <td className="py-2">
                          {l.label}
                          {l.tier === "PINNACLE" ? (
                            <span className="ml-2 font-mono text-[10px] uppercase text-orange">add-on</span>
                          ) : null}
                        </td>
                        <td className="py-2 text-slate">{UNIT_LABEL[l.unit]}</td>
                        <td className="py-2 text-right">{money(l.unitCost)}</td>
                        <td className="py-2 text-right">{l.quantity}</td>
                        <td className="py-2 text-right font-medium">{money(l.monthlyCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <dl className="mt-4 space-y-2 text-[14px]">
                  <Line label="Monthly tool cost" value={money(selected.toolCost)} />
                  {config.model === "COST_PLUS" ? (
                    <Line
                      label={`Imputed labor (${config.settings.laborMultiplier}× tool)`}
                      value={money(selected.costFloor - selected.toolCost)}
                      muted
                    />
                  ) : null}
                  <Line label="Hard cost floor" value={money(selected.costFloor)} strong />
                  <Line
                    label={
                      config.model === "COST_PLUS"
                        ? `Standard rate at ${result.split.sgmPct}% SGM`
                        : `Standard rate at ${result.multiplier.toFixed(2)}× tool cost`
                    }
                    value={money(selected.standardRate)}
                  />
                  {selected.discount > 0 ? (
                    <Line
                      label={`${result.bundle.label} discount${selected.discountCappedAtCost ? " (capped at cost)" : ""}`}
                      value={`-${money(selected.discount)}`}
                    />
                  ) : null}
                  {selected.belowFloor ? (
                    <Line
                      label={`Per-user floor applied (${money(inputs.perUserFloor)}/user)`}
                      value={money(selected.headlineRate - selected.discountedRate)}
                    />
                  ) : null}
                  <Line label="Agreement rate" value={money(selected.headlineRate)} strong />
                </dl>

                <div className="mt-4 flex gap-1 overflow-hidden rounded-brand text-center font-display text-[11px] font-bold uppercase tracking-eyebrow text-white">
                  <span className="bg-navy py-2" style={{ width: `${result.split.toolPct}%` }}>
                    Tool {result.split.toolPct}%
                  </span>
                  {result.split.laborPct > 0 ? (
                    <span className="bg-slate py-2" style={{ width: `${result.split.laborPct}%` }}>
                      Labor {result.split.laborPct}%
                    </span>
                  ) : null}
                  <span className="bg-orange py-2" style={{ width: `${result.split.sgmPct}%` }}>
                    GM {result.split.sgmPct}%
                  </span>
                </div>
              </>
            ) : null}
          </section>

          <section className="card">
            <h2 className="text-[18px]">Client and output</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="label" htmlFor="clientName">
                  Client name
                </label>
                <input
                  id="clientName"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Acme Manufacturing"
                  className="field mt-1"
                />
              </div>
              <div>
                <label className="label" htmlFor="notes">
                  Notes for the PDF / reviewer
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="field mt-1"
                />
              </div>
            </div>

            {exportError ? (
              <p role="alert" className="mt-4 rounded-brand bg-orange/10 px-3 py-2 text-[13px] text-orange-dark">
                {exportError}
              </p>
            ) : null}
            {state.error ? (
              <p role="alert" className="mt-4 rounded-brand bg-orange/10 px-3 py-2 text-[13px] text-orange-dark">
                {state.error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              {result.needsApproval ? (
                <form action={submitAction} className="contents">
                  <input type="hidden" name="clientName" value={clientName} />
                  <input type="hidden" name="notes" value={notes} />
                  <input type="hidden" name="requestedTier" value={tier} />
                  <input type="hidden" name="users" value={inputs.users} />
                  <input type="hidden" name="devices" value={inputs.devices} />
                  <input type="hidden" name="locations" value={inputs.locations} />
                  <input type="hidden" name="sgmPct" value={inputs.sgmPct} />
                  <input type="hidden" name="perUserFloor" value={inputs.perUserFloor} />
                  <input type="hidden" name="floorOverride" value={String(inputs.floorOverride)} />
                  <input type="hidden" name="addonMultiplier" value={inputs.addonMultiplier} />
                  <input type="hidden" name="markupMultiple" value={inputs.markupMultiple} />
                  <input type="hidden" name="bundleKey" value={inputs.bundleKey} />
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? "Submitting…" : "Submit for leadership review"}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => runExport("QUOTE")}
                  disabled={busy !== null}
                >
                  {busy === "QUOTE" ? "Generating…" : "Export agreement PDF"}
                </button>
              )}
              <button
                type="button"
                className="btn-navy"
                onClick={() => runExport("COGS")}
                disabled={busy !== null || result.needsApproval}
              >
                {busy === "COGS" ? "Generating…" : "Export internal COGS PDF"}
              </button>
            </div>
            <p className="mt-3 text-[12px] text-slate">
              Nothing on this screen is stored unless you submit it for review. Every exported PDF is stamped
              with an export ID, timestamp, app build and pricing version, and recorded in the audit log.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const clamp = (n: number) => Math.min(Math.max(Number.isFinite(n) ? n : min, min), max);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label" htmlFor={`count-${label}`}>
          {label}
        </label>
        <input
          id={`count-${label}`}
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className="field w-24 py-1 text-right"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="mt-2 w-full"
        aria-label={`${label} slider`}
      />
    </div>
  );
}

function TierCard({
  name,
  blurb,
  tierResult,
  selected,
  onSelect,
  footnote,
}: {
  name: string;
  blurb: string;
  tierResult: TierResult;
  selected: boolean;
  onSelect: () => void;
  footnote?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "rounded-brand border p-5 text-left transition",
        selected ? "border-orange bg-navy text-white" : "border-mist bg-white hover:border-slate",
      )}
    >
      <p className={clsx("eyebrow", selected && "text-orange")}>{selected ? "Selected tier" : "Tier"}</p>
      <h3 className={clsx("mt-2 text-[20px]", selected && "text-white")}>{name}</h3>
      <p className={clsx("text-[13px]", selected ? "text-mist" : "text-slate")}>{blurb}</p>
      <p className={clsx("mt-4 font-display text-[34px] font-bold leading-none", selected ? "text-white" : "text-navy")}>
        {moneyRounded(tierResult.headlineRate)}
      </p>
      <p className={clsx("mt-1 text-[13px]", selected ? "text-orange" : "text-slate")}>
        {money(tierResult.headlinePerUser)} per user / month
      </p>
      {tierResult.belowFloor ? (
        <p className="mt-2 font-display text-[11px] font-bold uppercase tracking-eyebrow text-orange">
          Floor rate applied
        </p>
      ) : null}
      {footnote ? (
        <p className={clsx("mt-2 text-[12px]", selected ? "text-mist" : "text-slate")}>{footnote}</p>
      ) : null}
    </button>
  );
}

function Line({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex justify-between",
        muted && "text-slate",
        strong && "border-t border-mist pt-2 font-display font-bold text-navy",
      )}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
