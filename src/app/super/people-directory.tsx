"use client";

import { useActionState, useMemo, useState } from "react";
import type { Role } from "@prisma/client";
import type { SuperState } from "./actions";
import { operatorResendWelcome, operatorResetPassword } from "./people-actions";

export interface PersonWorkspace {
  name: string;
  slug: string;
  role: Role;
  suspended: boolean;
}

export interface Person {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  mustReset: boolean;
  lastLogin: string | null;
  createdAt: string;
  workspaces: PersonWorkspace[];
}

function PersonRow({ person }: { person: Person }) {
  const [resetState, resetAction, resetPending] = useActionState<SuperState, FormData>(
    operatorResetPassword,
    {},
  );
  const [welcomeState, welcomeAction, welcomePending] = useActionState<SuperState, FormData>(
    operatorResendWelcome,
    {},
  );
  const result = resetState.error || resetState.ok ? resetState : welcomeState;

  return (
    <div className="border-t border-mist py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-navy">
            <span className="font-medium">{person.name}</span>
            <span className="font-mono text-[12px] text-slate">{person.email}</span>
            {person.isSuperAdmin ? <span className="tag bg-navy text-white">OPERATOR</span> : null}
            {person.mustReset ? <span className="tag bg-mist text-navy">MUST RESET</span> : null}
          </p>
          <p className="mt-1 text-[13px] text-slate">
            {person.workspaces.length > 0
              ? person.workspaces
                  .map((w) => `${w.name} · ${w.role}${w.suspended ? " (suspended)" : ""}`)
                  .join("  ·  ")
              : "No workspace — the account exists but has no access anywhere."}
          </p>
          <p className="mt-1 font-mono text-[12px] text-slate">
            created {person.createdAt} · last sign-in {person.lastLogin ?? "never"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action={resetAction}>
            <input type="hidden" name="userId" value={person.id} />
            <button type="submit" className="btn-ghost btn-sm" disabled={resetPending}>
              Reset password
            </button>
          </form>
          <form action={welcomeAction}>
            <input type="hidden" name="userId" value={person.id} />
            <button type="submit" className="btn-ghost btn-sm" disabled={welcomePending}>
              Resend welcome
            </button>
          </form>
        </div>
      </div>

      {result.error ? (
        <p className="mt-2 text-[13px] font-medium text-orange">{result.error}</p>
      ) : null}
      {result.ok ? <p className="mt-2 text-[13px] text-slate">{result.ok}</p> : null}
      {result.tempPassword ? (
        <p className="mt-1 font-mono text-[13px] text-navy">
          Temporary password: {result.tempPassword}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Every account on the product in one list, because an operator asked for help
 * knows an email address and rarely which workspace it belongs to.
 */
export function PeopleDirectory({ people }: { people: Person[] }) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) =>
      [person.email, person.name, ...person.workspaces.map((w) => `${w.name} ${w.slug}`)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [people, query]);

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">People</p>
          <h2 className="mt-1 text-[20px] leading-6">Every account</h2>
          <p className="mt-1 text-[13px] text-slate">
            {people.length} account{people.length === 1 ? "" : "s"} across all workspaces. Resetting a
            password or resending a welcome issues a new temporary password and forces a change at
            the next sign-in.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="people-search">
            Search
          </label>
          <input
            id="people-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="email, name or workspace"
            className="field w-full py-[10px] text-[13px] sm:w-[260px]"
          />
        </div>
      </div>

      <div>
        {shown.map((person) => (
          <PersonRow key={person.id} person={person} />
        ))}
        {shown.length === 0 ? (
          <p className="text-[13px] text-slate">No account matches that.</p>
        ) : null}
      </div>
    </section>
  );
}
