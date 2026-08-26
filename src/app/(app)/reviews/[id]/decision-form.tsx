"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import type { QuoteStatus } from "@prisma/client";
import { decide, type DecisionState } from "../actions";

type Decision = "APPROVED" | "CHANGES_REQUESTED" | "DENIED" | "COMMENTED";

const OPTIONS: { value: Decision; label: string; hint: string }[] = [
  { value: "APPROVED", label: "Approve", hint: "Unlocks PDF export at these numbers" },
  { value: "CHANGES_REQUESTED", label: "Recommend changes", hint: "Note is required" },
  { value: "DENIED", label: "Deny", hint: "Note is required" },
  { value: "COMMENTED", label: "Comment only", hint: "Leaves the status unchanged" },
];

export function DecisionForm({ quoteId, status }: { quoteId: string; status: QuoteStatus }) {
  const [decision, setDecision] = useState<Decision>("APPROVED");
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(decide, {});
  const settled = status !== "PENDING";

  return (
    <section className="card">
      <h2 className="text-[18px]">Your decision</h2>
      {settled ? (
        <p className="mt-2 text-[14px] text-slate">
          This quote has already been decided. You can still leave a comment for the account manager.
        </p>
      ) : null}

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="decision" value={decision} />

        <div className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.filter((o) => !settled || o.value === "COMMENTED").map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setDecision(option.value)}
              className={clsx(
                "rounded-brand border px-4 py-3 text-left transition",
                decision === option.value ? "border-orange bg-orange/5" : "border-mist hover:border-slate",
              )}
            >
              <span className="block font-display text-[15px] font-bold text-navy">{option.label}</span>
              <span className="block text-[12px] text-slate">{option.hint}</span>
            </button>
          ))}
        </div>

        <div>
          <label className="label" htmlFor="comment">
            Note to the account manager
          </label>
          <textarea id="comment" name="comment" rows={4} className="field mt-1" />
        </div>

        {state.error ? (
          <p role="alert" className="rounded-brand bg-orange/10 px-3 py-2 text-[13px] text-orange-dark">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="rounded-brand bg-navy/5 px-3 py-2 text-[13px] font-medium text-navy">{state.ok}</p>
        ) : null}

        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Recording…" : "Record decision"}
        </button>
      </form>
    </section>
  );
}
