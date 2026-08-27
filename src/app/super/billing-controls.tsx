"use client";

import { useActionState } from "react";
import type { TenantStatus } from "@prisma/client";
import type { SuperState } from "./actions";
import {
  cancelSubscription,
  endComplimentary,
  extendGrace,
  grantComplimentary,
  resetTrial,
} from "./billing-actions";

interface Props {
  tenantId: string;
  status: TenantStatus;
  compReason: string | null;
  hasSubscription: boolean;
}

function Result({ state }: { state: SuperState }) {
  if (state.error) return <p className="text-[13px] font-medium text-orange">{state.error}</p>;
  if (state.ok) return <p className="text-[13px] text-slate">{state.ok}</p>;
  return null;
}

/**
 * The operator's billing levers for one workspace. Collapsed by default: these
 * are consequential and rarely used, so they should take a deliberate click
 * rather than sit next to Suspend waiting to be hit by accident.
 */
export function BillingControls({ tenantId, status, compReason, hasSubscription }: Props) {
  const [compState, compAction, compPending] = useActionState<SuperState, FormData>(
    grantComplimentary,
    {},
  );
  const [endState, endAction, endPending] = useActionState<SuperState, FormData>(
    endComplimentary,
    {},
  );
  const [trialState, trialAction, trialPending] = useActionState<SuperState, FormData>(
    resetTrial,
    {},
  );
  const [graceState, graceAction, gracePending] = useActionState<SuperState, FormData>(
    extendGrace,
    {},
  );
  const [cancelState, cancelAction, cancelPending] = useActionState<SuperState, FormData>(
    cancelSubscription,
    {},
  );

  const comped = status === "COMPLIMENTARY";

  return (
    <details className="border-t border-mist pt-3">
      <summary className="cursor-pointer font-display text-[11px] font-bold uppercase tracking-eyebrow text-slate">
        Billing &amp; trial
      </summary>

      <div className="mt-3 space-y-3">
        <form action={compAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tenantId" value={tenantId} />
          <div className="min-w-[200px] flex-1">
            <label className="label" htmlFor={`comp-reason-${tenantId}`}>
              {comped ? "Update comp reason" : "Complimentary reason"}
            </label>
            <input
              id={`comp-reason-${tenantId}`}
              name="reason"
              defaultValue={compReason ?? ""}
              placeholder="Partner, internal, goodwill…"
              className="field w-full py-[10px] text-[13px]"
            />
          </div>
          <div>
            <label className="label" htmlFor={`comp-expires-${tenantId}`}>
              Ends (optional)
            </label>
            <input
              id={`comp-expires-${tenantId}`}
              name="expiresOn"
              type="date"
              className="field py-[10px] text-[13px]"
            />
          </div>
          <button type="submit" className="btn-ghost btn-sm" disabled={compPending}>
            {comped ? "Update comp" : "Make complimentary"}
          </button>
        </form>
        <Result state={compState} />

        <div className="flex flex-wrap items-center gap-2">
          {comped ? (
            <form action={endAction}>
              <input type="hidden" name="tenantId" value={tenantId} />
              <button type="submit" className="btn-ghost btn-sm" disabled={endPending}>
                End comp
              </button>
            </form>
          ) : null}

          <form action={trialAction}>
            <input type="hidden" name="tenantId" value={tenantId} />
            <button type="submit" className="btn-ghost btn-sm" disabled={trialPending}>
              Reset 14-day trial
            </button>
          </form>

          <form action={graceAction} className="flex items-center gap-2">
            <input type="hidden" name="tenantId" value={tenantId} />
            <label className="sr-only" htmlFor={`grace-${tenantId}`}>
              Extra days to pay
            </label>
            <input
              id={`grace-${tenantId}`}
              name="days"
              type="number"
              min={1}
              max={60}
              defaultValue={7}
              className="field w-[72px] py-[10px] text-[13px]"
            />
            <button type="submit" className="btn-ghost btn-sm" disabled={gracePending}>
              Extend grace
            </button>
          </form>

          {hasSubscription ? (
            <>
              <form action={cancelAction}>
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="when" value="period_end" />
                <button type="submit" className="btn-ghost btn-sm" disabled={cancelPending}>
                  Cancel at period end
                </button>
              </form>
              <form action={cancelAction}>
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="when" value="now" />
                <button type="submit" className="btn-ghost btn-sm" disabled={cancelPending}>
                  Cancel now
                </button>
              </form>
            </>
          ) : null}
        </div>

        {[endState, trialState, graceState, cancelState].map((state, index) => (
          <Result key={index} state={state} />
        ))}
      </div>
    </details>
  );
}
