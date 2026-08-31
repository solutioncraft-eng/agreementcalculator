"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import { money } from "@/lib/pricing/engine";
import { DEFAULT_INPUTS } from "@/lib/pricing/defaults";
import {
  deleteBundle,
  deleteCogsItem,
  deleteServiceTier,
  moveServiceTier,
  publishVersion,
  saveBundle,
  saveCogsItem,
  saveServiceTier,
  updateVersion,
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
  model: string;
  modelLabel: string;
  settings: Record<string, number>;
  publishedAt: string | null;
  publishedBy: string | null;
}

interface SettingField {
  name: string;
  label: string;
  suffix: string;
  step: string;
}

interface TierView {
  id: string;
  key: string;
  label: string;
  description: string | null;
  parentKey: string | null;
}

interface ItemView {
  id: string;
  label: string;
  vendor: string | null;
  unit: string;
  tierKeys: string[];
  unitCost: number;
  active: boolean;
  sortOrder: number;
}

/**
 * Quantities the cost readout multiplies by. The editor has no client in front
 * of it, so a fixed reference shape is the only way to state a cost in dollars;
 * the panel says which numbers it used.
 */
const REFERENCE = DEFAULT_INPUTS;

function quantityFor(unit: string): number {
  if (unit === "USER") return REFERENCE.users;
  if (unit === "DEVICE") return REFERENCE.devices;
  if (unit === "LOCATION") return REFERENCE.locations;
  return 1;
}

/** An offering's parent chain, root first, stopping at a missing parent or a loop. */
function chainOf(tiers: TierView[], key: string): TierView[] {
  const chain: TierView[] = [];
  const seen = new Set<string>();
  let current = tiers.find((tier) => tier.key === key);
  while (current && !seen.has(current.key)) {
    seen.add(current.key);
    chain.unshift(current);
    current = current.parentKey ? tiers.find((tier) => tier.key === current!.parentKey) : undefined;
  }
  return chain;
}

/** Offerings that would build on `key` through their parents, plus `key` itself. */
function descendantsOf(tiers: TierView[], key: string): Set<string> {
  const blocked = new Set([key]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const tier of tiers) {
      if (!blocked.has(tier.key) && tier.parentKey && blocked.has(tier.parentKey)) {
        blocked.add(tier.key);
        grew = true;
      }
    }
  }
  return blocked;
}

interface TierCosting {
  /** Items assigned to the offering itself. */
  own: ItemView[];
  /** Items it only gets through its parent chain. */
  inherited: ItemView[];
  ownCost: number;
  totalCost: number;
}

/** What each offering costs at the reference quantities, own items and inherited. */
function costings(tiers: TierView[], items: ItemView[]): Map<string, TierCosting> {
  const active = items.filter((item) => item.active);
  return new Map(
    tiers.map((tier) => {
      const own = active.filter((item) => item.tierKeys.includes(tier.key));
      const chain = chainOf(tiers, tier.key).filter((member) => member.key !== tier.key);
      const inherited = active.filter(
        (item) =>
          !item.tierKeys.includes(tier.key) &&
          chain.some((member) => item.tierKeys.includes(member.key)),
      );
      const cost = (rows: ItemView[]) =>
        rows.reduce((sum, item) => sum + item.unitCost * quantityFor(item.unit), 0);
      const ownCost = cost(own);
      return [tier.key, { own, inherited, ownCost, totalCost: ownCost + cost(inherited) }];
    }),
  );
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
  fields,
  tiers,
  items,
  bundles,
}: {
  version: VersionView;
  fields: SettingField[];
  tiers: TierView[];
  items: ItemView[];
  bundles: BundleView[];
}) {
  const editable = version.status === "DRAFT";
  const [modelState, modelAction, savingModel] = useActionState<AdminState, FormData>(updateVersion, {});
  const [itemState, itemAction, savingItem] = useActionState<AdminState, FormData>(saveCogsItem, {});
  const [deleteState, deleteAction] = useActionState<AdminState, FormData>(deleteCogsItem, {});
  const [bundleState, bundleAction, savingBundle] = useActionState<AdminState, FormData>(saveBundle, {});
  const [bundleDeleteState, bundleDeleteAction] = useActionState<AdminState, FormData>(deleteBundle, {});
  const [publishState, publishAction, publishing] = useActionState<AdminState, FormData>(publishVersion, {});
  const [tierState, tierAction, savingTier] = useActionState<AdminState, FormData>(saveServiceTier, {});
  const [tierMoveState, tierMoveAction] = useActionState<AdminState, FormData>(moveServiceTier, {});
  const [tierDeleteState, tierDeleteAction] = useActionState<AdminState, FormData>(deleteServiceTier, {});
  const [editing, setEditing] = useState<string | null>(null);
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const tierLabel = (key: string) => tiers.find((tier) => tier.key === key)?.label ?? key;
  const costing = costings(tiers, items);

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
        <h2 className="text-[18px]">Pricing model — {version.modelLabel}</h2>
        <p className="mt-1 text-[14px] text-slate">
          The model is chosen when the workspace is created; these are its settings.
        </p>
        <form action={modelAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <input type="hidden" name="versionId" value={version.id} />
          <Field name="label" label="Version label" defaultValue={version.label} disabled={!editable} />
          <Field name="costBasis" label="Cost basis" defaultValue={version.costBasis} disabled={!editable} />
          {fields.map((field) => (
            <Field
              key={field.name}
              name={field.name}
              label={`${field.label} ${field.suffix}`}
              type="number"
              step={field.step}
              defaultValue={version.settings[field.name]}
              disabled={!editable}
            />
          ))}
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
                {savingModel ? "Saving…" : "Save pricing settings"}
              </button>
            </div>
          ) : null}
        </form>
        <Feedback state={modelState} />
      </section>

      <section className="card">
        <h2 className="text-[18px]">Offerings</h2>
        <p className="mt-1 text-[14px] text-slate">
          What this workspace sells. An offering either stands alone or builds on another: it then includes
          every COGS item of the offering it builds on, and what it adds is priced with the add-on multiplier.
          Publishing freezes this list, so quotes and PDFs keep reproducing the offerings they were priced
          against.
        </p>

        <ol className="mt-4 space-y-2">
          {tiers.map((tier, index) => (
            <li
              key={tier.id}
              className="rounded-brand border border-mist px-4 py-3"
            >
              {editingTier === tier.id ? (
                <TierForm
                  action={tierAction}
                  versionId={version.id}
                  tiers={tiers}
                  tier={tier}
                  pending={savingTier}
                  onDone={() => setEditingTier(null)}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy">
                      <span className="mr-2 font-display text-[11px] uppercase tracking-eyebrow text-slate">
                        {tier.parentKey ? `Builds on ${tierLabel(tier.parentKey)}` : "Standalone"}
                      </span>
                      {tier.label}
                    </p>
                    <p className="text-[13px] text-slate">{tier.description ?? "—"}</p>
                    <p className="font-mono text-[11px] text-slate">{tier.key}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate">
                      {costing.get(tier.key)?.own.length ?? 0} own ·{" "}
                      {costing.get(tier.key)?.inherited.length ?? 0} inherited ·{" "}
                      {money(costing.get(tier.key)?.totalCost ?? 0)}/mo cost
                    </p>
                    {editable && (costing.get(tier.key)?.own.length ?? 0) === 0 ? (
                      <p className="mt-1 text-[12px] text-orange-dark">
                        No COGS items of its own — it sells{" "}
                        {tier.parentKey ? `${tierLabel(tier.parentKey)}'s stack` : "nothing"} at this price.
                      </p>
                    ) : null}
                  </div>
                  {editable ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {[
                        { direction: "up", symbol: "↑", disabled: index === 0 },
                        { direction: "down", symbol: "↓", disabled: index === tiers.length - 1 },
                      ].map((move) => (
                        <form key={move.direction} action={tierMoveAction}>
                          <input type="hidden" name="versionId" value={version.id} />
                          <input type="hidden" name="tierId" value={tier.id} />
                          <input type="hidden" name="direction" value={move.direction} />
                          <button
                            type="submit"
                            className="btn-ghost btn-sm"
                            disabled={move.disabled}
                            aria-label={`Move ${tier.label} ${move.direction}`}
                          >
                            {move.symbol}
                          </button>
                        </form>
                      ))}
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => setEditingTier(tier.id)}
                      >
                        Edit
                      </button>
                      <form action={tierDeleteAction}>
                        <input type="hidden" name="versionId" value={version.id} />
                        <input type="hidden" name="tierId" value={tier.id} />
                        <button type="submit" className="btn-ghost btn-sm text-orange-dark">
                          Remove
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          ))}
          {tiers.length === 0 ? (
            <li className="text-slate">No offerings yet — add at least one before publishing.</li>
          ) : null}
        </ol>
        {/* Publishing leaves the last attempt's message behind, and it can only
            mislead once the ladder is frozen. */}
        {editable ? (
          <>
            <Feedback state={tierState} />
            <Feedback state={tierMoveState} />
            <Feedback state={tierDeleteState} />
          </>
        ) : null}

        {editable ? (
          <div className="mt-6 border-t border-mist pt-5">
            <h3 className="label">Add an offering</h3>
            <TierForm action={tierAction} versionId={version.id} tiers={tiers} pending={savingTier} />
          </div>
        ) : null}

        {tiers.length > 0 ? (
          <div className="mt-6 border-t border-mist pt-5">
            <h3 className="label">Cost per offering</h3>
            <p className="mt-1 text-[13px] text-slate">
              At {REFERENCE.users} users, {REFERENCE.devices} devices and {REFERENCE.locations} locations, so
              the numbers are comparable rather than a quote. Inherited items come from the offering this one
              builds on.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-[14px]">
                <thead>
                  <tr className="border-b border-navy text-left font-display text-[11px] uppercase tracking-eyebrow text-slate">
                    <th className="py-2">Offering</th>
                    <th className="py-2 text-right">Own items</th>
                    <th className="py-2 text-right">Own cost</th>
                    <th className="py-2 text-right">Included cost</th>
                    <th className="py-2 text-right">Per user</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((tier) => {
                    const row = costing.get(tier.key);
                    return (
                      <tr key={tier.id} className="border-b border-steel last:border-0">
                        <td className="py-2 font-medium text-navy">{tier.label}</td>
                        <td className="py-2 text-right">{row?.own.length ?? 0}</td>
                        <td className="py-2 text-right">{money(row?.ownCost ?? 0)}</td>
                        <td className="py-2 text-right font-medium">{money(row?.totalCost ?? 0)}</td>
                        <td className="py-2 text-right text-slate">
                          {money((row?.totalCost ?? 0) / REFERENCE.users)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2 className="text-[18px]">COGS items</h2>
        <p className="mt-1 text-[14px] text-slate">
          Each item is billed to you on a unit basis, and belongs to one or more offerings. A filled square is
          an item the offering carries itself; a hollow one is inherited from the offering it builds on.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-navy text-left font-display text-[11px] uppercase tracking-eyebrow text-slate">
                <th className="py-3">Item</th>
                <th className="py-3">Vendor</th>
                <th className="py-3">Basis</th>
                {tiers.map((tier) => (
                  <th key={tier.key} className="py-3 text-center">
                    {tier.label}
                  </th>
                ))}
                <th className="py-3 text-right">Unit cost</th>
                <th className="py-3">Active</th>
                {editable ? <th className="py-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) =>
                editing === item.id ? (
                  <tr key={item.id} className="border-b border-steel bg-paper">
                    <td colSpan={(editable ? 6 : 5) + tiers.length} className="py-4">
                      <ItemForm
                        action={itemAction}
                        versionId={version.id}
                        tiers={tiers}
                        item={item}
                        pending={savingItem}
                        onDone={() => setEditing(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id} className="border-b border-steel last:border-0">
                    <td className="py-3 font-medium text-navy">{item.label}</td>
                    <td className="py-3 text-slate">{item.vendor ?? "—"}</td>
                    <td className="py-3">{UNITS.find((u) => u.value === item.unit)?.label ?? item.unit}</td>
                    {tiers.map((tier) => {
                      const own = item.tierKeys.includes(tier.key);
                      const inherited = !own && (costing.get(tier.key)?.inherited.includes(item) ?? false);
                      return (
                        <td key={tier.key} className="py-3 text-center">
                          <span
                            aria-label={`${item.label} in ${tier.label}: ${
                              own ? "own item" : inherited ? "inherited" : "not included"
                            }`}
                            className={clsx(
                              "inline-block h-3 w-3 rounded-[2px]",
                              own
                                ? "bg-navy"
                                : inherited
                                  ? "border border-orange bg-transparent"
                                  : "border border-mist bg-transparent",
                            )}
                          />
                        </td>
                      );
                    })}
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
            <p className="mt-1 text-[13px] text-slate">
              Pick every offering that carries it. An offering that builds on another does not need the parent&apos;s
              items ticked again.
            </p>
            <ItemForm action={itemAction} versionId={version.id} tiers={tiers} pending={savingItem} />
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

function TierForm({
  action,
  versionId,
  tiers,
  tier,
  pending,
  onDone,
}: {
  action: (formData: FormData) => void;
  versionId: string;
  tiers: TierView[];
  tier?: TierView;
  pending: boolean;
  onDone?: () => void;
}) {
  // An offering cannot build on itself or on anything that builds on it.
  const blocked = tier ? descendantsOf(tiers, tier.key) : new Set<string>();
  const candidates = tiers.filter((candidate) => !blocked.has(candidate.key));

  return (
    <form action={action} className="grid gap-3 md:grid-cols-4 md:items-end">
      <input type="hidden" name="versionId" value={versionId} />
      {tier ? <input type="hidden" name="tierId" value={tier.id} /> : null}
      <Field name="label" label="Offering name" defaultValue={tier?.label} placeholder="Pinnacle" />
      <Field
        name="description"
        label="One-line description"
        defaultValue={tier?.description ?? ""}
        placeholder="Adds the security stack"
      />
      <div>
        <label className="label" htmlFor={`parent-${tier?.id ?? "new"}`}>
          Builds on
        </label>
        <select
          id={`parent-${tier?.id ?? "new"}`}
          name="parentKey"
          defaultValue={tier ? (tier.parentKey ?? "") : (candidates.at(-1)?.key ?? "")}
          className="field mt-1"
        >
          <option value="">Nothing — standalone offering</option>
          {candidates.map((candidate) => (
            <option key={candidate.key} value={candidate.key}>
              {candidate.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-navy" disabled={pending}>
          {pending ? "Saving…" : tier ? "Save offering" : "Add offering"}
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

function ItemForm({
  action,
  versionId,
  tiers,
  item,
  pending,
  onDone,
}: {
  action: (formData: FormData) => void;
  versionId: string;
  tiers: TierView[];
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
      <div className="md:col-span-2">
        <span className="label">Offerings</span>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
          {tiers.map((tier, index) => (
            <label key={tier.key} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                name="tierKeys"
                value={tier.key}
                defaultChecked={item ? item.tierKeys.includes(tier.key) : index === 0}
                className="h-4 w-4 accent-orange"
              />
              {tier.label}
            </label>
          ))}
        </div>
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
