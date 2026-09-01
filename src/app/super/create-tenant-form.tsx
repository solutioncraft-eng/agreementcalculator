"use client";

import { useActionState, useState } from "react";
import { createTenant, type SuperState } from "./actions";

export function CreateTenantForm({
  models,
}: {
  models: { key: string; label: string; summary: string }[];
}) {
  const [state, action, pending] = useActionState<SuperState, FormData>(createTenant, {});
  const [model, setModel] = useState(models[0]?.key ?? "COST_PLUS");
  const chosen = models.find((m) => m.key === model);

  return (
    <form action={action} className="card space-y-5">
      <div>
        <h2 className="text-[22px]">Create a tenant</h2>
        <p className="mt-1 text-[13px] text-slate">
          The tenant opens with a draft pricing version — its administrator reviews the costs and publishes
          before anyone can quote.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Company name
          </label>
          <input id="name" name="name" className="field mt-1" required />
        </div>
        <div>
          <label className="label" htmlFor="slug">
            Subdomain
          </label>
          <input
            id="slug"
            name="slug"
            className="field mt-1 font-mono text-[13px]"
            placeholder="derived from the name"
          />
        </div>
      </div>

      <fieldset>
        <legend className="label">Pricing model</legend>
        <div className="mt-2 space-y-2">
          {models.map((option) => (
            <label
              key={option.key}
              className="flex cursor-pointer items-start gap-3 rounded-brand border border-mist px-4 py-3"
            >
              <input
                type="radio"
                name="pricingModel"
                value={option.key}
                checked={model === option.key}
                onChange={() => setModel(option.key)}
                className="mt-1"
              />
              <span>
                <span className="block font-display text-[15px] font-bold text-navy">{option.label}</span>
                <span className="block text-[13px] text-slate">{option.summary}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-slate">
          {chosen ? `${chosen.label} is adopted for every version this tenant publishes.` : null} Changing
          it later is an operator action, since it changes what a quote means.
        </p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="adminName">
            First administrator
          </label>
          <input id="adminName" name="adminName" className="field mt-1" required />
        </div>
        <div>
          <label className="label" htmlFor="adminEmail">
            Their work email
          </label>
          <input id="adminEmail" name="adminEmail" type="email" className="field mt-1" required />
        </div>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-slate">
        <input type="checkbox" name="seedCatalog" defaultChecked />
        Seed the reference COGS catalogue as a starting point to edit
      </label>

      {state.error ? <p className="text-[13px] font-medium text-orange">{state.error}</p> : null}
      {state.ok ? <p className="text-[13px] font-medium text-navy">{state.ok}</p> : null}
      {state.tempPassword ? (
        <p className="rounded-brand bg-orange-tint/20 px-3 py-2 font-mono text-[13px] text-orange-dark">
          Temporary password: {state.tempPassword} — hand it over securely, it is shown once.
        </p>
      ) : null}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create tenant"}
      </button>
    </form>
  );
}
