"use client";

import { useActionState, useState } from "react";
import { deleteTenant, type SuperState } from "./actions";

interface Props {
  tenantId: string;
  name: string;
  slug: string;
  people: number;
  quotes: number;
  exports: number;
}

/**
 * Deleting a tenant is the one operator action nothing undoes, so it sits
 * behind a disclosure, spells out what goes with it, and stays disabled until
 * the subdomain has been typed back exactly.
 */
export function DeleteTenant({ tenantId, name, slug, people, quotes, exports }: Props) {
  const [state, action, pending] = useActionState<SuperState, FormData>(deleteTenant, {});
  const [confirm, setConfirm] = useState("");

  return (
    <details className="border-t border-mist pt-3">
      <summary className="cursor-pointer font-display text-[11px] font-bold uppercase tracking-eyebrow text-orange">
        Delete tenant
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-[13px] text-slate">
          Deleting {name} permanently removes {people} membership{people === 1 ? "" : "s"},{" "}
          {quotes} quote{quotes === 1 ? "" : "s"}, {exports} export record
          {exports === 1 ? "" : "s"}, every pricing version and the tenant&apos;s audit trail.
          There is no undo. Accounts themselves are kept — a person left with no tenant simply
          loses access.
        </p>

        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tenantId" value={tenantId} />
          <div>
            <label className="label" htmlFor={`confirm-${tenantId}`}>
              Type <span className="font-mono">{slug}</span> to confirm
            </label>
            <input
              id={`confirm-${tenantId}`}
              name="confirmSlug"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="off"
              className="field mt-1 w-[220px] py-[10px] font-mono text-[13px]"
            />
          </div>
          <button
            type="submit"
            className="btn-ghost btn-sm text-orange"
            disabled={pending || confirm.trim().toLowerCase() !== slug}
          >
            {pending ? "Deleting…" : "Delete permanently"}
          </button>
        </form>

        {state.error ? <p className="text-[13px] font-medium text-orange">{state.error}</p> : null}
        {state.ok ? <p className="text-[13px] text-slate">{state.ok}</p> : null}
      </div>
    </details>
  );
}
