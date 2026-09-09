"use client";

import { useEffect, useRef, useState } from "react";
import type { MspCadenceCustomer } from "@/lib/mspcadence";
import { lookupCustomers } from "./actions";

/**
 * Optional "look up from MSP Cadence" control under the client name. Picking a
 * customer fills the name and carries logo/website/contacts to the PDF header;
 * the name field itself stays free text.
 */
export function CustomerLookup({
  selected,
  onSelect,
  onClear,
}: {
  selected: MspCadenceCustomer | null;
  onSelect: (customer: MspCadenceCustomer) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MspCadenceCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      const state = await lookupCustomers(query);
      if (id !== requestId.current) return;
      setSearching(false);
      setError(state.error ?? null);
      setResults(state.customers ?? null);
    }, 250);
    return () => clearTimeout(timer);
  }, [open, query]);

  if (selected) {
    return (
      <div className="mt-2 flex items-start gap-3 rounded-brand border border-mist bg-paper px-3 py-2 text-[13px]">
        {selected.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote logo of unknown size
          <img src={selected.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-navy">From MSP Cadence</p>
          <p className="truncate text-slate">
            {[selected.website?.replace(/^https?:\/\//i, ""), selected.primaryContactPhone]
              .filter(Boolean)
              .join(" · ") || "No website or phone on file"}
          </p>
          {selected.technicalPocName || selected.executiveSponsorName ? (
            <p className="truncate text-slate">
              {[selected.technicalPocName, selected.executiveSponsorName].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-[12px]" onClick={onClear}>
          Clear
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="mt-2 text-[13px] font-medium text-orange-dark underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        Look up customer from MSP Cadence
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-brand border border-mist bg-paper p-3">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers…"
          aria-label="Search MSP Cadence customers"
          className="field flex-1"
        />
        <button type="button" className="btn-ghost px-2 py-1 text-[12px]" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-orange-dark">
          {error}
        </p>
      ) : null}
      {!error && results !== null ? (
        results.length ? (
          <ul className="mt-2 max-h-56 divide-y divide-mist overflow-y-auto">
            {results.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-1 py-2 text-left text-[13px] hover:bg-white"
                  onClick={() => {
                    onSelect(customer);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {customer.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote logo of unknown size
                    <img src={customer.logoUrl} alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
                  ) : (
                    <span className="h-6 w-6 shrink-0 rounded bg-mist" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-navy">{customer.name}</span>
                    {customer.website ? (
                      <span className="block truncate text-slate">
                        {customer.website.replace(/^https?:\/\//i, "")}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-slate">{searching ? "Searching…" : "No active customers match."}</p>
        )
      ) : searching ? (
        <p className="mt-2 text-[13px] text-slate">Searching…</p>
      ) : null}
    </div>
  );
}
