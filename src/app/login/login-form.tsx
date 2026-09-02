"use client";

import Link from "next/link";
import { useActionState } from "react";
import { GoogleMark } from "@/components/google-mark";
import { login, type LoginState } from "./actions";

export function LoginForm({ googleStartUrl }: { googleStartUrl?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <>
      {googleStartUrl ? (
        <div className="mt-8">
          <a href={googleStartUrl} className="btn-ghost w-full">
            <GoogleMark />
            Continue with Google
          </a>
          <div className="mt-6 flex items-center gap-3 text-[12px] uppercase tracking-eyebrow text-slate">
            <span className="h-px flex-1 bg-mist" />
            or
            <span className="h-px flex-1 bg-mist" />
          </div>
        </div>
      ) : null}

      <form action={formAction} className="mt-8 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Work email
          </label>
          <input id="email" name="email" type="email" autoComplete="username" required className="field mt-1" />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label className="label" htmlFor="password">
              Password
            </label>
            <Link href="/forgot-password" className="text-[13px] font-medium text-orange">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
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
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}
