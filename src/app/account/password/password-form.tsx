"use client";

import Link from "next/link";
import { useActionState } from "react";
import { changePassword, type PasswordState } from "./actions";

export function PasswordForm({ forced }: { forced: boolean }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label className="label" htmlFor="current">
          {forced ? "Temporary password" : "Current password"}
        </label>
        <input id="current" name="current" type="password" required autoComplete="current-password" className="field mt-1" />
      </div>
      <div>
        <label className="label" htmlFor="next">
          New password
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
          Confirm new password
        </label>
        <input id="confirm" name="confirm" type="password" required autoComplete="new-password" className="field mt-1" />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-brand bg-orange/10 px-3 py-2 text-[13px] text-orange-dark">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </button>
        {forced ? null : (
          <Link href="/calculator" className="text-[13px] font-medium text-slate hover:text-orange">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
