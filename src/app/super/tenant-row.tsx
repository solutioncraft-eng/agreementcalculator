"use client";

import { useActionState } from "react";
import clsx from "clsx";
import type { TenantStatus } from "@prisma/client";
import { setTenantStatus, type SuperState } from "./actions";

interface Row {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  pricingModel: string;
  pricingModelLabel: string;
  createdAt: string;
  people: number;
  quotes: number;
  exports: number;
  publishedVersion: string | null;
  lastActivity: string | null;
}

const STATUS_CLASS: Record<TenantStatus, string> = {
  TRIAL: "bg-orange-tint/25 text-orange-dark",
  ACTIVE: "bg-navy text-white",
  SUSPENDED: "bg-ink text-white",
};

export function TenantRow({ tenant }: { tenant: Row }) {
  const [state, action, pending] = useActionState<SuperState, FormData>(setTenantStatus, {});
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
          </p>
        </div>

        <div className="flex items-center gap-2">
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

      {state.error ? <p className="text-[13px] font-medium text-orange">{state.error}</p> : null}
      {state.ok ? <p className="text-[13px] text-slate">{state.ok}</p> : null}
    </div>
  );
}
