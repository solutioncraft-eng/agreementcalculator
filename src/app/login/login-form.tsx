"use client";

import Link from "next/link";
import { useActionState } from "react";
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

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="h-[18px] w-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.1l3.01-2.34Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.34C4.68 5.17 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
