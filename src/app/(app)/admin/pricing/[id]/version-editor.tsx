"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import { money } from "@/lib/pricing/engine";
import {
  deleteBundle,
  deleteCogsItem,
  publishVersion,
  saveBundle,
  saveCogsItem,
  updateModel,
  type AdminState,
} from "../actions";

const UNITS = [
  { value: "USER", label: "Per user" },
  { value: "DEVICE", label: "Per device" },
  { value: "LOCATION", label: "Per location" },
  { value: "FLAT", label: "Flat per agreement" },
];

interface VersionView {
  id: string;
  label: string;
  status: string;
  costBasis: string;
  notes: string | null;
  laborMultiplier: number;
  defaultSgmPct: number;
  maxSgmPct: number;
  minPerUserFloor: number;
  addonMultiplier: number;
  publishedAt: string | null;
  publishedBy: string | null;
}

interface ItemView {
  id: string;
  label: string;
  vendor: string | null;
  unit: string;
  tier: string;
  unitCost: number;
  active: boolean;
  sortOrder: number;
}

interface BundleView {
  key: string;
  label: string;
  description: string | null;
  discountPct: number;
  sortOrder: number;
}

function Feedback({ state }: { state: AdminState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-3 rounded-brand bg-orange/10 px-3 py-2 text-[13px] text-orange-dark">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return <p className="mt-3 rounded-brand bg-navy/5 px-3 py-2 text-[13px] font-medium text-navy">{state.ok}</p>;
  }
  return null;
}

export function VersionEditor({
  version,
  items,
  bundles,
}: {
  version: VersionView;
  items: ItemView[];
  bundles: BundleView[];
}) {
  const editable = version.status === "DRAFT";
  const [modelState, modelAction, savingModel] = useActionState<AdminState, FormData>(updateModel, {});
  const [itemState, itemAction, savingItem] = useActionState<AdminState, FormData>(saveCogsItem, {});
  const [deleteState, deleteAction] = useActionState<AdminState, FormData>(deleteCogsItem, {});
  const [bundleState, bundleAction, savingBundle] = useActionState<AdminState, FormData>(saveBundle, {});
  const [bundleDeleteState, bundleDeleteAction] = useActionState<AdminState, FormData>(deleteBundle, {});
  const [publishState, publishAction, publishing] = useActionState<AdminState, FormData>(publishVersion, {});
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <header className="card flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Pricing version</p>
          <h1 className="mt-2 text-[30px] leading-9">{version.label}</h1>
          <p className="mt-1 text-[14px] text-slate">
            {editable
              ? "Draft — edit freely. Publishing freezes these numbers permanently."
              : `${version.status} — immutable. Create a new draft to change pricing.`}
            {version.publishedAt
              ? ` Published ${version.publishedAt.slice(0, 16).replace("T", " ")} UTC by ${version.publishedBy}.`
              : ""}
          </p>
        </div>
        {editable ? (
          <form action={publishAction}>
            <input type="hidden" name="versionId" value={version.id} />
            <button type="submit" className="btn-primary" disabled={publishing}>
              {publishing ? "Publishing…" : `Publish ${version.label}`}
            </button>
          </form>
        ) : null}
      </header>
      <Feedback state={publishState} />

      <section className="card">
        <h2 className="text-[18px]">Pricing model</h2>
        <form action={modelAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <input type="hidden" name="versionId" value={version.id} />
          <Field name="label" label="Version label" defaultValue={version.label} disabled={!editable} />
          <Field name="costBasis" label="Cost basis" defaultValue={version.costBasis} disabled={!editable} />
          <Field
            name="laborMultiplier"
            label="Labor multiplier (× tool cost)"
            type="number"
            step="0.01"
            defaultValue={version.laborMultiplier}
            disabled={!editable}
          />
          <Field
            name="defaultSgmPct"
            label="Default service gross margin %"
            type="number"
            step="0.5"
            defaultValue={version.defaultSgmPct}
            disabled={!editable}
          />
          <Field
            name="maxSgmPct"
            label="Maximum service gross margin %"
            type="number"
            step="0.5"
            defaultValue={version.maxSgmPct}
            disabled={!editable}
          />
          <Field
            name="minPerUserFloor"
            label="Minimum per-user floor $"
            type="number"
            step="1"
            defaultValue={version.minPerUserFloor}
            disabled={!editable}
          />
          <Field
            name="addonMultiplier"
            label="Pinnacle add-on multiplier"
            type="number"
            step="0.01"
            defaultValue={version.addonMultiplier}
            disabled={!editable}
          />
          <div className="md:col-span-2">
            <label className="label" htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={version.notes ?? ""}
              disabled={!editable}
              className="field mt-1"
            />
          </div>
          {editable ? (
            <div className="md:col-span-3">
              <button type="submit" className="btn-navy" disabled={savingModel}>
                {savingModel ? "Saving…" : "Save pricing model"}
              </button>
            </div>
          ) : null}
        </form>
        <Feedback state={modelState} />
      </section>

      <section className="card">
        <h2 className="text-[18px]">COGS items</h2>
        <p className="mt-1 text-[14px] text-slate">
          Each item is billed to InfinIT on a unit basis. The basis decides what it multiplies by: user count,
          device count, location count, or once per agreement.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-navy text-left font-display text-[11px] uppercase tracking-eyebrow text-slate">
                <th className="py-3">Item</th>
                <th className="py-3">Vendor</th>
                <th className="py-3">Basis</th>
                <th className="py-3">Tier</th>
                <th className="py-3 text-right">Unit cost</th>
                <th className="py-3">Active</th>
                {editable ? <th className="py-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) =>
                editing === item.id ? (
                  <tr key={item.id} className="border-b border-mist bg-paper">
                    <td colSpan={editable ? 7 : 6} className="py-4">
                      <ItemForm
                        action={itemAction}
                        versionId={version.id}
                        item={item}
                        pending={savingItem}
                        onDone={() => setEditing(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id} className="border-b border-mist last:border-0">
                    <td className="py-3 font-medium text-navy">{item.label}</td>
                    <td className="py-3 text-slate">{item.vendor ?? "—"}</td>
                    <td className="py-3">{UNITS.find((u) => u.value === item.unit)?.label ?? item.unit}</td>
                    <td className="py-3">
                      <span
                        className={clsx(
                          "rounded-brand px-2 py-1 font-display text-[10px] font-bold uppercase tracking-eyebrow",
                          item.tier === "PINNACLE" ? "bg-orange text-white" : "bg-navy text-white",
                        )}
                      >
                        {item.tier}
                      </span>
                    </td>
                    <td className="py-3 text-right">{money(item.unitCost)}</td>
                    <td className="py-3 text-slate">{item.active ? "Yes" : "No"}</td>
                    {editable ? (
                      <td className="py-3 text-right">
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(item.id)}>
                          Edit
                        </button>
                        <form action={deleteAction} className="inline">
                          <input type="hidden" name="versionId" value={version.id} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <button type="submit" className="btn-ghost btn-sm text-orange-dark">
                            Remove
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <Feedback state={itemState} />
        <Feedback state={deleteState} />

        {editable ? (
          <div className="mt-6 border-t border-mist pt-5">
            <h3 className="label">Add an item</h3>
            <ItemForm action={itemAction} versionId={version.id} pending={savingItem} />
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2 className="text-[18px]">Bundle discounts</h2>
        <div className="mt-4 space-y-2">
          {bundles.map((bundle) => (
            <div
              key={bundle.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-brand border border-mist px-4 py-3"
            >
              <div>
                <p className="font-semibold text-navy">{bundle.label}</p>
                <p className="font-mono text-[11px] text-slate">{bundle.key}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-display text-[16px] font-bold text-orange">-{bundle.discountPct}%</span>
                {editable ? (
                  <form action={bundleDeleteAction}>
                    <input type="hidden" name="versionId" value={version.id} />
                    <input type="hidden" name="key" value={bundle.key} />
                    <button type="submit" className="btn-ghost btn-sm text-orange-dark">
                      Remove
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
          {bundles.length === 0 ? <p className="text-slate">No bundle discounts on this version.</p> : null}
        </div>
        <Feedback state={bundleState} />
        <Feedback state={bundleDeleteState} />

        {editable ? (
          <form action={bundleAction} className="mt-6 grid gap-4 border-t border-mist pt-5 md:grid-cols-5">
            <input type="hidden" name="versionId" value={version.id} />
            <Field name="key" label="Key" placeholder="voip" />
            <Field name="label" label="Label" placeholder="VoIP only" />
            <Field name="description" label="Description" placeholder="5% off managed services" />
            <Field name="discountPct" label="Discount %" type="number" step="0.5" defaultValue={5} />
            <div className="flex items-end">
              <button type="submit" className="btn-navy w-full" disabled={savingBundle}>
                {savingBundle ? "Saving…" : "Save bundle"}
              </button>
            </div>
          </form>
        ) : null}
        <p className="mt-4 text-[12px] text-slate">
          Bundle discounts never take a rate below the hard cost floor — the calculator caps the discount and
          flags the quote for review when that happens.
        </p>
      </section>
    </div>
  );
}

function ItemForm({
  action,
  versionId,
  item,
  pending,
  onDone,
}: {
  action: (formData: FormData) => void;
  versionId: string;
  item?: ItemView;
  pending: boolean;
  onDone?: () => void;
}) {
  return (
    <form action={action} className="grid gap-3 md:grid-cols-7 md:items-end">
      <input type="hidden" name="versionId" value={versionId} />
      {item ? <input type="hidden" name="itemId" value={item.id} /> : null}
      <div className="md:col-span-2">
        <Field name="label" label="Item" defaultValue={item?.label} placeholder="Security Tool" />
      </div>
      <Field name="vendor" label="Vendor" defaultValue={item?.vendor ?? ""} placeholder="Vendor" />
      <div>
        <label className="label" htmlFor={`unit-${item?.id ?? "new"}`}>
          Basis
        </label>
        <select
          id={`unit-${item?.id ?? "new"}`}
          name="unit"
          defaultValue={item?.unit ?? "USER"}
          className="field mt-1"
        >
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`tier-${item?.id ?? "new"}`}>
          Tier
        </label>
        <select
          id={`tier-${item?.id ?? "new"}`}
          name="tier"
          defaultValue={item?.tier ?? "ADVANTAGE"}
          className="field mt-1"
        >
          <option value="ADVANTAGE">Advantage</option>
          <option value="PINNACLE">Pinnacle add-on</option>
        </select>
      </div>
      <Field
        name="unitCost"
        label="Unit cost $"
        type="number"
        step="0.0001"
        defaultValue={item?.unitCost ?? ""}
      />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            name="active"
            defaultChecked={item?.active ?? true}
            className="h-4 w-4 accent-orange"
          />
          Active
        </label>
      </div>
      <div className="flex gap-2 md:col-span-7">
        <button type="submit" className="btn-navy" disabled={pending}>
          {pending ? "Saving…" : item ? "Save item" : "Add item"}
        </button>
        {onDone ? (
          <button type="button" className="btn-ghost" onClick={onDone}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  step,
  defaultValue,
  placeholder,
  disabled,
}: {
  name: string;
  label: string;
  type?: string;
  step?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={`f-${name}`}>
        {label}
      </label>
      <input
        id={`f-${name}`}
        name={name}
        type={type}
        step={step}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        className="field mt-1"
      />
    </div>
  );
}
