"use client";

import { useMemo, useState } from "react";
import { TenantRow, type PricingModelOption, type Row } from "./tenant-row";

const SORTS = {
  newest: "Newest first",
  name: "Tenant name A–Z",
  nameDesc: "Tenant name Z–A",
  people: "Most people",
} as const;

type Sort = keyof typeof SORTS;

export function TenantList({
  tenants,
  models,
}: {
  tenants: Row[];
  models: PricingModelOption[];
}) {
  const [name, setName] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  const shown = useMemo(() => {
    const needle = name.trim().toLowerCase();
    const filtered = tenants.filter(
      (tenant) =>
        !needle ||
        tenant.name.toLowerCase().includes(needle) ||
        tenant.slug.toLowerCase().includes(needle),
    );
    if (sort === "newest") return filtered;
    return [...filtered].sort((a, b) => {
      if (sort === "people") return b.people - a.people || a.name.localeCompare(b.name);
      const order = a.name.localeCompare(b.name);
      return sort === "nameDesc" ? -order : order;
    });
  }, [tenants, name, sort]);

  return (
    <section className="space-y-3">
      <div className="card flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] leading-6">
            {shown.length === tenants.length
              ? `${tenants.length} tenant${tenants.length === 1 ? "" : "s"}`
              : `${shown.length} of ${tenants.length} tenants`}
          </h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="tenant-filter">
              Filter by tenant name
            </label>
            <input
              id="tenant-filter"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="name or subdomain"
              className="field mt-1 w-full py-[10px] text-[13px] sm:w-[240px]"
            />
          </div>
          <div>
            <label className="label" htmlFor="tenant-sort">
              Sort by
            </label>
            <select
              id="tenant-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="field mt-1 py-[10px] text-[13px]"
            >
              {Object.entries(SORTS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {shown.map((tenant) => (
        <TenantRow key={tenant.id} tenant={tenant} models={models} />
      ))}
      {tenants.length === 0 ? (
        <p className="card text-slate">No tenants yet — create the first one below.</p>
      ) : null}
      {tenants.length > 0 && shown.length === 0 ? (
        <p className="card text-slate">No tenant matches that name.</p>
      ) : null}
    </section>
  );
}
