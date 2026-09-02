"use client";

import Link from "next/link";
import { useActionState } from "react";
import { completeReset, type ResetState } from "./actions";

export function ResetForm({
  token,
  submitLabel = "Set new password",
}: {
  token: string;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState<ResetState, FormData>(completeReset, {});

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="next">
          Password
        </label>
        <input
          id="next"
          name="next"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="field mt-1"
        />
        <p className="mt-1 text-[12px] text-slate">At least 12 characters.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          className="field mt-1"
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-brand bg-orange/10 px-3 py-2 text-[13px] font-medium text-orange-dark">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
      <Link href="/login" className="block text-[13px] font-medium text-slate hover:text-orange">
        Back to sign in
      </Link>
    </form>
  );
}
