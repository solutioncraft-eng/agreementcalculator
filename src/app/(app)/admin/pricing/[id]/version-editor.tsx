"use client";

import { useActionState, useEffect, useState } from "react";
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
  setTierItems,
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
  const [deleteState, deleteAction] = useActionState<AdminState, FormData>(deleteCogsItem, {});
  const [bundleState, bundleAction, savingBundle] = useActionState<AdminState, FormData>(saveBundle, {});
  const [bundleDeleteState, bundleDeleteAction] = useActionState<AdminState, FormData>(deleteBundle, {});
  const [publishState, publishAction, publishing] = useActionState<AdminState, FormData>(publishVersion, {});
  const [tierState, tierAction, savingTier] = useActionState<AdminState, FormData>(saveServiceTier, {});
  const [tierMoveState, tierMoveAction] = useActionState<AdminState, FormData>(moveServiceTier, {});
  const [tierDeleteState, tierDeleteAction] = useActionState<AdminState, FormData>(deleteServiceTier, {});
  const [tierItemsState, tierItemsAction, savingTierItems] = useActionState<AdminState, FormData>(
    setTierItems,
    {},
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [pickingTier, setPickingTier] = useState<string | null>(null);
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
                  key={`${tier.id}-${tier.parentKey ?? "standalone"}`}
                  action={tierAction}
                  versionId={version.id}
                  tiers={tiers}
                  tier={tier}
                  items={items}
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
                      {costing.get(tier.key)?.inherited.length ?? 0} inherited
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
                        onClick={() => setPickingTier(pickingTier === tier.id ? null : tier.id)}
                      >
                        COGS items
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => setEditingTier(tier.id)}
                      >
                        Edit
                      </button>
                      <form
                        action={tierDeleteAction}
                        onSubmit={(event) => {
                          const own = costing.get(tier.key)?.own.length ?? 0;
                          const detail =
                            own > 0
                              ? ` It carries ${own} COGS item${own === 1 ? "" : "s"} itself; those items stay in the draft but stop being carried by it.`
                              : "";
                          if (!window.confirm(`Remove ${tier.label} from this draft?${detail}`)) {
                            event.preventDefault();
                          }
                        }}
                      >
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
              {editable && editingTier !== tier.id ? (
                <TierItemPicker
                  key={`${tier.id}-${(costing.get(tier.key)?.own ?? []).map((item) => item.id).join(",")}`}
                  action={tierItemsAction}
                  versionId={version.id}
                  tier={tier}
                  items={items}
                  pending={savingTierItems}
                  open={pickingTier === tier.id || (costing.get(tier.key)?.own.length ?? 0) === 0}
                  onClose={pickingTier === tier.id ? () => setPickingTier(null) : undefined}
                />
              ) : null}
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
            <Feedback state={tierItemsState} />
            <Feedback state={tierMoveState} />
            <Feedback state={tierDeleteState} />
          </>
        ) : null}

        {editable ? (
          <div className="mt-6 border-t border-mist pt-5">
            <h3 className="label">Add an offering</h3>
            <TierForm
              action={tierAction}
              versionId={version.id}
              tiers={tiers}
              items={items}
              pending={savingTier}
            />
          </div>
        ) : null}

      </section>

      {tiers.length > 0 ? (
        <section className="card">
          <h2 className="text-[18px]">What each offering includes</h2>
          <p className="mt-1 text-[14px] text-slate">
            Costs are at {REFERENCE.users} users, {REFERENCE.devices} devices and {REFERENCE.locations}{" "}
            locations, so offerings are comparable rather than quoted. Inherited items come from the offering
            this one builds on.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {tiers.map((tier) => {
              const row = costing.get(tier.key);
              return (
                <article key={tier.id} className="rounded-brand border border-mist p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-[16px] font-bold text-navy">{tier.label}</h3>
                    <p className="font-mono text-[11px] uppercase tracking-eyebrow text-slate">
                      {tier.parentKey ? `Builds on ${tierLabel(tier.parentKey)}` : "Standalone"}
                    </p>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 border-y border-mist py-3 text-[13px]">
                    {[
                      { term: "Own cost", value: `${money(row?.ownCost ?? 0)}/mo` },
                      { term: "Included cost", value: `${money(row?.totalCost ?? 0)}/mo` },
                      { term: "Per user", value: money((row?.totalCost ?? 0) / REFERENCE.users) },
                    ].map((stat) => (
                      <div key={stat.term}>
                        <dt className="font-display text-[10px] uppercase tracking-eyebrow text-slate">
                          {stat.term}
                        </dt>
                        <dd className="font-mono text-[14px] text-navy">{stat.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <ItemChips
                    heading={`Carries itself (${row?.own.length ?? 0})`}
                    items={row?.own ?? []}
                    tone="own"
                    empty={
                      editable
                        ? `No items of its own — it sells ${
                            tier.parentKey ? `${tierLabel(tier.parentKey)}'s stack` : "nothing"
                          } at this price.`
                        : "No items of its own."
                    }
                  />
                  {tier.parentKey ? (
                    <ItemChips
                      heading={`Inherited from ${tierLabel(tier.parentKey)} (${row?.inherited.length ?? 0})`}
                      items={row?.inherited ?? []}
                      tone="inherited"
                      empty="Nothing inherited yet."
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="card">
        <h2 className="text-[18px]">COGS items</h2>
        <p className="mt-1 text-[14px] text-slate">
          Each item is billed to you on a unit basis and is carried by one or more offerings. The offerings
          listed on a row are the ones that carry it themselves; anything building on them inherits it.
        </p>

        <ul className="mt-4 divide-y divide-steel border-t border-navy">
          {items.map((item) => (
            <li key={item.id} className="py-3">
              {editing === item.id ? (
                <ItemForm
                  versionId={version.id}
                  tiers={tiers}
                  item={item}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                  <div className="min-w-[220px] flex-1">
                    <p className="font-medium text-navy">
                      {item.label}
                      {item.active ? null : (
                        <span className="ml-2 font-display text-[10px] uppercase tracking-eyebrow text-slate">
                          Inactive
                        </span>
                      )}
                    </p>
                    <p className="text-[13px] text-slate">
                      {item.vendor ?? "No vendor"} ·{" "}
                      {UNITS.find((u) => u.value === item.unit)?.label ?? item.unit}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.tierKeys.length === 0 ? (
                        <span className="text-[12px] text-orange-dark">No offering carries this item.</span>
                      ) : (
                        tiers
                          .filter((tier) => item.tierKeys.includes(tier.key))
                          .map((tier) => (
                            <span key={tier.key} className="chip-own">
                              {tier.label}
                            </span>
                          ))
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-mono text-[15px] text-navy">
                      {money(item.unitCost)}
                      <span className="text-[11px] text-slate">
                        /{item.unit === "FLAT" ? "mo" : item.unit.toLowerCase()}
                      </span>
                    </p>
                    {editable ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setEditing(item.id)}
                        >
                          Edit
                        </button>
                        <form action={deleteAction}>
                          <input type="hidden" name="versionId" value={version.id} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <button type="submit" className="btn-ghost btn-sm text-orange-dark">
                            Remove
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </li>
          ))}
          {items.length === 0 ? <li className="py-3 text-slate">No COGS items on this version.</li> : null}
        </ul>
        <Feedback state={deleteState} />

        {editable ? (
          <div className="mt-6 border-t border-mist pt-5">
            <h3 className="label">Add an item</h3>
            <p className="mt-1 text-[13px] text-slate">
              Pick every offering that carries it. An offering that builds on another does not need the parent&apos;s
              items ticked again.
            </p>
            <ItemForm versionId={version.id} tiers={tiers} />
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

/**
 * Asks which COGS items an offering carries itself. Opens on its own for an
 * offering with an empty stack — a new one, or one just decoupled from its
 * parent — because that offering has no costing until this is answered.
 */
function TierItemPicker({
  action,
  versionId,
  tier,
  items,
  pending,
  open,
  onClose,
}: {
  action: (formData: FormData) => void;
  versionId: string;
  tier: TierView;
  items: ItemView[];
  pending: boolean;
  open: boolean;
  onClose?: () => void;
}) {
  if (!open) return null;

  return (
    <form action={action} className="mt-3 border-t border-mist pt-3">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="tierKey" value={tier.key} />
      <p className="label">Which COGS items does {tier.label} carry itself?</p>
      <p className="mt-1 text-[13px] text-slate">
        {tier.parentKey
          ? `Everything ${tier.label} inherits stays inherited — tick only what it adds on top.`
          : `${tier.label} stands alone, so it costs nothing until it carries items of its own.`}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-[13px] text-orange-dark">
          This draft has no COGS items yet. Add one under COGS items below and tick {tier.label} there.
        </p>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <label
              key={item.id}
              className="flex items-start gap-2 rounded-brand border border-steel px-3 py-2 text-[13px]"
            >
              <input
                type="checkbox"
                name="itemIds"
                value={item.id}
                defaultChecked={item.tierKeys.includes(tier.key)}
                className="mt-[3px] h-4 w-4 accent-orange"
              />
              <span>
                {item.label}
                <span className="block font-mono text-[11px] text-slate">
                  {money(item.unitCost)}/{item.unit === "FLAT" ? "mo" : item.unit.toLowerCase()}
                  {item.active ? "" : " · inactive"}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length > 0 ? (
          <button type="submit" className="btn-navy btn-sm" disabled={pending}>
            {pending ? "Saving…" : `Save ${tier.label}'s items`}
          </button>
        ) : null}
        {onClose ? (
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** One offering's item list: what it carries itself, or what it inherits. */
function ItemChips({
  heading,
  items,
  tone,
  empty,
}: {
  heading: string;
  items: ItemView[];
  tone: "own" | "inherited";
  empty: string;
}) {
  return (
    <div className="mt-3">
      <p className="font-display text-[10px] uppercase tracking-eyebrow text-slate">{heading}</p>
      {items.length === 0 ? (
        <p className={clsx("mt-1 text-[12px]", tone === "own" ? "text-orange-dark" : "text-slate")}>{empty}</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1">
          {items.map((item) => (
            <span key={item.id} className={tone === "own" ? "chip-own" : "chip-inherited"}>
              {item.label}
              <span className="ml-1 font-mono text-[10px] opacity-70">{money(item.unitCost)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TierForm({
  action,
  versionId,
  tiers,
  tier,
  items,
  pending,
  onDone,
}: {
  action: (formData: FormData) => void;
  versionId: string;
  tiers: TierView[];
  tier?: TierView;
  items: ItemView[];
  pending: boolean;
  onDone?: () => void;
}) {
  // An offering cannot build on itself or on anything that builds on it.
  const blocked = tier ? descendantsOf(tiers, tier.key) : new Set<string>();
  const candidates = tiers.filter((candidate) => !blocked.has(candidate.key));
  const [parentKey, setParentKey] = useState(
    tier ? (tier.parentKey ?? "") : (candidates.at(-1)?.key ?? ""),
  );
  const [addingItem, setAddingItem] = useState(false);
  const name = tier?.label ?? "this offering";
  const parentLabel = tiers.find((candidate) => candidate.key === parentKey)?.label ?? parentKey;
  // Items reached through the chosen parent chain arrive with it, so they are
  // shown as inherited rather than offered for ticking.
  const inheritedKeys = parentKey ? chainOf(tiers, parentKey).map((member) => member.key) : [];
  const inheritedBy = (item: ItemView) => inheritedKeys.some((key) => item.tierKeys.includes(key));
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(tier ? items.filter((item) => item.tierKeys.includes(tier.key)).map((item) => item.id) : []),
  );
  const toggle = (id: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <>
      <form action={action} className="grid gap-3 md:grid-cols-4 md:items-end">
        <input type="hidden" name="versionId" value={versionId} />
        {tier ? <input type="hidden" name="tierId" value={tier.id} /> : null}
        <Field name="label" label="Offering name" defaultValue={tier?.label} placeholder="Co-Managed Agreement" />
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
            value={parentKey}
            onChange={(event) => setParentKey(event.target.value)}
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
        <div className="md:col-span-4 border-t border-mist pt-3">
          <input type="hidden" name="chooseItems" value="1" />
          <p className="label">{parentKey ? `Which COGS items does it add on top of ${parentLabel}?` : "Which COGS items does it carry?"}</p>
          <p className="mt-1 text-[13px] text-slate">
            {parentKey
              ? `Everything ${parentLabel} carries comes with it and is priced with the main lever — tick only what ${name} adds, priced with the add-on multiplier. Saved with the offering.`
              : `Standalone means nothing is inherited, so ${name} costs what you tick here — saved with the offering.`}
          </p>
          {items.length === 0 ? (
            <p className="mt-2 text-[13px] text-orange-dark">
              This draft has no COGS items yet — add the first one below.
            </p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const inherited = inheritedBy(item);
                return (
                  <label
                    key={item.id}
                    className={clsx(
                      "flex items-start gap-2 rounded-brand border px-3 py-2 text-[13px]",
                      inherited ? "border-mist bg-paper text-slate" : "border-steel",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="itemIds"
                      value={item.id}
                      checked={inherited || ticked.has(item.id)}
                      onChange={(event) => toggle(item.id, event.target.checked)}
                      disabled={inherited}
                      className="mt-[3px] h-4 w-4 accent-orange disabled:opacity-60"
                    />
                    <span>
                      {item.label}
                      <span className="block font-mono text-[11px] text-slate">
                        {money(item.unitCost)}/{item.unit === "FLAT" ? "mo" : item.unit.toLowerCase()}
                        {item.active ? "" : " · inactive"}
                      </span>
                      {inherited ? (
                        <span className="block font-display text-[10px] uppercase tracking-eyebrow text-slate">
                          Inherited from {parentLabel}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
            <button
              type="button"
              className="btn-ghost btn-sm mt-3"
              onClick={() => setAddingItem(!addingItem)}
            >
              {addingItem ? "Never mind the new item" : "Need a COGS item that is not listed?"}
            </button>
          </div>
      </form>
      {addingItem ? (
        <div className="mt-3 rounded-brand border border-steel bg-paper p-3">
          <p className="label">New COGS item</p>
          <p className="mt-1 text-[13px] text-slate">
            {tier
              ? `Saved on its own, already carried by ${tier.label}. Your unsaved offering edits above are kept.`
              : "Saved on its own — tick it above once it appears, then add the offering."}
          </p>
          <div className="mt-2">
            <ItemForm
              versionId={versionId}
              tiers={tiers}
              presetTierKeys={tier ? [tier.key] : []}
              onDone={() => setAddingItem(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Adds or edits one COGS item. Owns its own action state so the outcome shows
 * beside the form, and an edit closes itself once saved — React resets an
 * open form to the values it was rendered with, which would otherwise show the
 * item's old offerings as if the save had not happened.
 */
function ItemForm({
  versionId,
  tiers,
  item,
  presetTierKeys,
  onDone,
}: {
  versionId: string;
  tiers: TierView[];
  item?: ItemView;
  presetTierKeys?: string[];
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveCogsItem, {});
  useEffect(() => {
    if (state.ok && item) onDone?.();
  }, [state, item, onDone]);
  // Controlled so a failed save keeps what was ticked instead of resetting.
  const [carried, setCarried] = useState<Set<string>>(
    () =>
      new Set(
        item ? item.tierKeys : (presetTierKeys ?? tiers.slice(0, 1).map((tier) => tier.key)),
      ),
  );
  const toggle = (key: string, on: boolean) =>
    setCarried((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <form action={action} className="grid gap-3 md:grid-cols-4 md:items-end">
      <input type="hidden" name="versionId" value={versionId} />
      {item ? <input type="hidden" name="itemId" value={item.id} /> : null}
      <Field name="label" label="Item" defaultValue={item?.label} placeholder="Security Tool" />
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
      <Field
        name="unitCost"
        label="Unit cost $"
        type="number"
        step="0.0001"
        defaultValue={item?.unitCost ?? ""}
      />
      <div className="md:col-span-4">
        <span className="label">Carried by these offerings</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {tiers.map((tier) => (
            <label
              key={tier.key}
              className="flex items-center gap-2 rounded-brand border border-steel px-3 py-2 text-[13px]"
            >
              <input
                type="checkbox"
                name="tierKeys"
                value={tier.key}
                checked={carried.has(tier.key)}
                onChange={(event) => toggle(tier.key, event.target.checked)}
                className="h-4 w-4 accent-orange"
              />
              {tier.label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-4 md:col-span-4">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            name="active"
            defaultChecked={item?.active ?? true}
            className="h-4 w-4 accent-orange"
          />
          Active — counted in every offering that carries it
        </label>
      </div>
      <div className="flex gap-2 md:col-span-4">
        <button type="submit" className="btn-navy" disabled={pending}>
          {pending ? "Saving…" : item ? "Save item" : "Add item"}
        </button>
        {onDone ? (
          <button type="button" className="btn-ghost" onClick={onDone}>
            Cancel
          </button>
        ) : null}
      </div>
      <div className="md:col-span-4">
        <Feedback state={state} />
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
