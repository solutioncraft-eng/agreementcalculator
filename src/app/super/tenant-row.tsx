"use client";

import { useActionState } from "react";
import clsx from "clsx";
import type { TenantStatus } from "@prisma/client";
import { setPricingModel, setTenantStatus, type SuperState } from "./actions";

interface Row {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  /** What the workspace is running on: trial, subscription, or comp. */
  billing: string;
  pricingModel: string;
  pricingModelLabel: string;
  createdAt: string;
  people: number;
  quotes: number;
  exports: number;
  publishedVersion: string | null;
  lastActivity: string | null;
}

export interface PricingModelOption {
  key: string;
  label: string;
}

const STATUS_CLASS: Record<TenantStatus, string> = {
  TRIAL: "bg-orange-tint/25 text-orange-dark",
  ACTIVE: "bg-navy text-white",
  SUSPENDED: "bg-ink text-white",
};

export function TenantRow({ tenant, models }: { tenant: Row; models: PricingModelOption[] }) {
  const [state, action, pending] = useActionState<SuperState, FormData>(setTenantStatus, {});
  const [modelState, modelAction, modelPending] = useActionState<SuperState, FormData>(
    setPricingModel,
    {},
  );
  const suspended = tenant.status === "SUSPENDED";

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[20px] leading-6">{tenant.name}</h2>
            <span className={clsx("tag", STATUS_CLASS[tenant.status])}>{tenant.status}</span>
          </div>
          <p className="mt-1 font-mono text-[12px] text-slate">
            {tenant.slug} · {tenant.pricingModelLabel} · created {tenant.createdAt}
            {` · ${tenant.billing}`}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <form action={modelAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="tenantId" value={tenant.id} />
            <label className="sr-only" htmlFor={`model-${tenant.id}`}>
              Pricing model
            </label>
            <select
              id={`model-${tenant.id}`}
              // Remount when the workspace's model changes so the uncontrolled
              // select does not keep showing the pre-action value.
              key={tenant.pricingModel}
              name="pricingModel"
              defaultValue={tenant.pricingModel}
              className="field w-full py-[10px] text-[13px] sm:w-auto"
            >
              {models.map((model) => (
                <option key={model.key} value={model.key}>
                  {model.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-ghost btn-sm" disabled={modelPending}>
              Change model
            </button>
          </form>
          {tenant.status === "TRIAL" ? (
            <form action={action}>
              <input type="hidden" name="tenantId" value={tenant.id} />
              <input type="hidden" name="status" value="ACTIVE" />
              <button type="submit" className="btn-ghost btn-sm" disabled={pending}>
                Activate
              </button>
            </form>
          ) : null}
          <form action={action}>
            <input type="hidden" name="tenantId" value={tenant.id} />
            <input type="hidden" name="status" value={suspended ? "ACTIVE" : "SUSPENDED"} />
            <button type="submit" className="btn-ghost btn-sm" disabled={pending}>
              {suspended ? "Reinstate" : "Suspend"}
            </button>
          </form>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-4">
        {[
          ["People", String(tenant.people)],
          ["Quotes in review", String(tenant.quotes)],
          ["PDF exports", String(tenant.exports)],
          ["Published pricing", tenant.publishedVersion ?? "none yet — draft only"],
          ["Last activity", tenant.lastActivity ?? "—"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="font-display text-[10px] font-bold uppercase tracking-eyebrow text-slate">
              {label}
            </dt>
            <dd className="text-navy">{value}</dd>
          </div>
        ))}
      </dl>

      {[state, modelState].map((result, index) => (
        <div key={index}>
          {result.error ? <p className="text-[13px] font-medium text-orange">{result.error}</p> : null}
          {result.ok ? <p className="text-[13px] text-slate">{result.ok}</p> : null}
        </div>
      ))}
    </div>
  );
}
