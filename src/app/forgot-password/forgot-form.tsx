"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestReset, type ForgotState } from "./actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(requestReset, {});

  if (state.sent) {
    return (
      <div className="mt-6 space-y-4">
        <p role="status" className="rounded-brand bg-navy/5 px-3 py-3 text-[14px] text-navy">
          If that address has an account, a reset link is on its way. The link works once and expires
          in an hour.
        </p>
        <Link href="/login" className="text-[13px] font-medium text-orange">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="field mt-1"
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-brand bg-orange/10 px-3 py-2 text-[13px] font-medium text-orange-dark">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
      <Link href="/login" className="block text-[13px] font-medium text-slate hover:text-orange">
        Back to sign in
      </Link>
    </form>
  );
}
