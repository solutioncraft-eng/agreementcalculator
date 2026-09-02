"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import { submitSupportRequest, type SupportState } from "./actions";

const KINDS = [
  {
    value: "support",
    label: "Something isn't working",
    hint: "A bug, an error, a number that looks wrong or something you can't get to.",
    placeholder:
      "What were you trying to do, what happened instead, and what did you expect? Quote IDs and screenshots links help.",
  },
  {
    value: "enhancement",
    label: "I'd like an enhancement",
    hint: "A new capability, a change to how something works, or a rough edge worth smoothing.",
    placeholder: "What would you like to be able to do, and what would it save you or your team?",
  },
] as const;

export function SupportForm({ requester, initialPage }: { requester: string; initialPage: string }) {
  const [state, action, pending] = useActionState<SupportState, FormData>(submitSupportRequest, {});
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("support");
  const selected = KINDS.find((k) => k.value === kind) ?? KINDS[0];

  if (state.ok) {
    return (
      <section className="card space-y-4">
        <p className="eyebrow">Sent</p>
        <p className="text-[15px] text-ink">{state.ok}</p>
        <a href="/help/support" className="btn-ghost btn-sm">
          Send another
        </a>
      </section>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <section className="card space-y-4">
        <fieldset className="space-y-2">
          <legend className="label">What kind of request is this?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {KINDS.map((option) => (
              <label
                key={option.value}
                className={clsx(
                  "cursor-pointer rounded-brand border p-4 transition",
                  kind === option.value ? "border-navy bg-paper" : "border-mist hover:border-steel",
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={option.value}
                  checked={kind === option.value}
                  onChange={() => setKind(option.value)}
                  className="sr-only"
                />
                <span className="block font-display text-[15px] font-bold text-navy">{option.label}</span>
                <span className="mt-1 block text-[13px] text-slate">{option.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="label" htmlFor="subject">
            Title
          </label>
          <input
            id="subject"
            name="subject"
            required
            minLength={4}
            maxLength={200}
            className="field mt-1"
            placeholder={kind === "support" ? "e.g. PDF export fails for quotes over 250 users" : "e.g. Export quotes to CSV"}
          />
        </div>

        <div>
          <label className="label" htmlFor="description">
            Details
          </label>
          <textarea
            id="description"
            name="description"
            required
            minLength={10}
            maxLength={10_000}
            rows={8}
            className="field mt-1"
            placeholder={selected.placeholder}
          />
        </div>

        <div>
          <label className="label" htmlFor="page">
            Page it relates to <span className="font-normal">(optional)</span>
          </label>
          <input id="page" name="page" defaultValue={initialPage} maxLength={500} className="field mt-1" />
        </div>

        <p className="text-[13px] text-slate">
          Sent as {requester}. Your workspace, role and app version are attached so we can reproduce what you
          saw; tool costs and margins are never included.
        </p>

        {state.error ? <p className="text-[13px] font-medium text-orange">{state.error}</p> : null}

        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Sending…" : kind === "support" ? "Send support request" : "Send enhancement request"}
        </button>
      </section>
    </form>
  );
}
