"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { GoogleMark } from "@/components/google-mark";
import { slugFromName } from "@/lib/slug";
import { signUp, type SignupState } from "./actions";

export function SignupForm({
  models,
  rootDomain,
  google,
  googleStartUrl,
}: {
  models: { key: string; label: string; summary: string }[];
  rootDomain: string;
  /** The identity Google vouched for, when signup started there. */
  google?: { email: string; name: string | null } | null;
  googleStartUrl?: string;
}) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signUp, {});
  const [company, setCompany] = useState(state.values?.company ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [model, setModel] = useState(models[0]?.key ?? "COST_PLUS");
  const address = slug || slugFromName(company) || "your-company";

  return (
    <form action={action} className="space-y-5">
      {googleStartUrl && !google ? (
        <div>
          <a href={googleStartUrl} className="btn-ghost w-full">
            <GoogleMark />
            Continue with Google
          </a>
          <div className="mt-5 flex items-center gap-3 text-[12px] uppercase tracking-eyebrow text-slate">
            <span className="h-px flex-1 bg-mist" />
            or
            <span className="h-px flex-1 bg-mist" />
          </div>
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor="company">
          Company name
        </label>
        <input
          id="company"
          name="company"
          className="field mt-1"
          required
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="slug">
          Workspace address
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="slug"
            name="slug"
            className="field font-mono text-[13px]"
            placeholder={slugFromName(company)}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
          />
          <span className="whitespace-nowrap font-mono text-[13px] text-slate">.{rootDomain}</span>
        </div>
        <p className="mt-1 font-mono text-[12px] text-slate">
          {address}.{rootDomain}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input
            id="name"
            name="name"
            className="field mt-1"
            required
            defaultValue={state.values?.name ?? google?.name ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Work email
          </label>
          {/* The address Google vouched for is the account being created, so it
              is shown rather than asked for — the server reads it from the
              signed cookie either way. */}
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            className="field mt-1"
            required
            readOnly={Boolean(google)}
            defaultValue={google?.email ?? state.values?.email ?? ""}
          />
        </div>
      </div>

      {google ? null : (
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            className="field mt-1"
            required
          />
          <p className="mt-1 text-[12px] text-slate">At least 12 characters.</p>
        </div>
      )}

      <fieldset>
        <legend className="label">Pricing model</legend>
        <div className="mt-2 space-y-2">
          {models.map((option) => (
            <label
              key={option.key}
              className="flex cursor-pointer items-start gap-3 rounded-brand border border-mist px-4 py-3"
            >
              <input
                type="radio"
                name="pricingModel"
                value={option.key}
                checked={model === option.key}
                onChange={() => setModel(option.key)}
                className="mt-1"
              />
              <span>
                <span className="block font-display text-[15px] font-bold text-navy">{option.label}</span>
                <span className="block text-[13px] text-slate">{option.summary}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-slate">
          Every version your workspace publishes uses this model. Changing it later is a support request,
          since it changes what a quote means.
        </p>
      </fieldset>

      {state.error ? (
        <p role="alert" className="rounded-brand bg-orange/10 px-3 py-2 text-[13px] font-medium text-orange-dark">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending
          ? "Setting up your workspace…"
          : google
            ? "Create workspace with Google"
            : "Start free trial"}
      </button>
      <p className="text-[12px] text-slate">
        No card required. Your workspace opens with a draft pricing version — nothing is quotable until you
        publish it. By setting it up you agree to our{" "}
        <Link href="/terms" className="font-medium text-orange">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-medium text-orange">
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}
