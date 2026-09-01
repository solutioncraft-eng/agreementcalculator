"use client";

import { useActionState, useMemo, useState } from "react";
import type { Role } from "@prisma/client";
import type { SuperState } from "./actions";
import {
  deleteAccount,
  operatorResendWelcome,
  operatorResetPassword,
  setAccountActive,
} from "./people-actions";

export interface PersonTenant {
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
  active: boolean;
  /** Whether anything is attributed to them, which makes deletion impossible. */
  hasHistory: boolean;
  mustReset: boolean;
  lastLogin: string | null;
  createdAt: string;
  tenants: PersonTenant[];
}

const SORTS = {
  tenant: "Tenant name",
  name: "Person name",
  email: "Email",
  lastLogin: "Last sign-in",
} as const;

type Sort = keyof typeof SORTS;

/** Tenant a person is sorted and filtered under: the first one they joined. */
function primaryTenant(person: Person): string {
  return person.tenants[0]?.name ?? "";
}

function compare(a: Person, b: Person, sort: Sort): number {
  if (sort === "name") return a.name.localeCompare(b.name);
  if (sort === "email") return a.email.localeCompare(b.email);
  if (sort === "lastLogin") {
    // Never signed in sorts last, then most recent first.
    if (!a.lastLogin) return b.lastLogin ? 1 : 0;
    if (!b.lastLogin) return -1;
    return b.lastLogin.localeCompare(a.lastLogin);
  }
  // Accounts with no tenant sort last rather than under the empty string.
  const left = primaryTenant(a);
  const right = primaryTenant(b);
  if (!left !== !right) return left ? -1 : 1;
  return left.localeCompare(right) || a.name.localeCompare(b.name);
}

function DeleteAccount({ person }: { person: Person }) {
  const [state, action, pending] = useActionState<SuperState, FormData>(deleteAccount, {});
  const [confirm, setConfirm] = useState("");

  return (
    <details className="mt-2">
      <summary className="cursor-pointer font-display text-[10px] font-bold uppercase tracking-eyebrow text-orange">
        Delete account
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-[13px] text-slate">
          {person.hasHistory
            ? "This account has quotes, reviews, exports or pricing versions attributed to it. Those records name their author permanently, so it can only be deactivated."
            : "Removes the account and its memberships. Audit events it appears in keep the email address."}
        </p>
        {person.hasHistory ? null : (
          <form action={action} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="userId" value={person.id} />
            <div>
              <label className="label" htmlFor={`confirm-user-${person.id}`}>
                Type the email to confirm
              </label>
              <input
                id={`confirm-user-${person.id}`}
                name="confirmEmail"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="off"
                className="field mt-1 w-[260px] py-[10px] font-mono text-[13px]"
              />
            </div>
            <button
              type="submit"
              className="btn-ghost btn-sm text-orange"
              disabled={pending || confirm.trim().toLowerCase() !== person.email}
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </button>
          </form>
        )}
        {state.error ? <p className="text-[13px] font-medium text-orange">{state.error}</p> : null}
        {state.ok ? <p className="text-[13px] text-slate">{state.ok}</p> : null}
      </div>
    </details>
  );
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
  const [activeState, activeAction, activePending] = useActionState<SuperState, FormData>(
    setAccountActive,
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
            {person.active ? null : <span className="tag bg-ink text-white">DEACTIVATED</span>}
            {person.mustReset ? <span className="tag bg-mist text-navy">MUST RESET</span> : null}
          </p>
          <p className="mt-1 text-[13px] text-slate">
            {person.tenants.length > 0
              ? person.tenants
                  .map((t) => `${t.name} · ${t.role}${t.suspended ? " (suspended)" : ""}`)
                  .join("  ·  ")
              : "No tenant — the account exists but has no access anywhere."}
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
          <form action={activeAction}>
            <input type="hidden" name="userId" value={person.id} />
            <input type="hidden" name="active" value={person.active ? "false" : "true"} />
            <button type="submit" className="btn-ghost btn-sm" disabled={activePending}>
              {person.active ? "Deactivate" : "Reactivate"}
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
      {activeState.error ? (
        <p className="mt-2 text-[13px] font-medium text-orange">{activeState.error}</p>
      ) : null}
      {activeState.ok ? <p className="mt-2 text-[13px] text-slate">{activeState.ok}</p> : null}

      <DeleteAccount person={person} />
    </div>
  );
}

/**
 * Every account on the product in one list, because an operator asked for help
 * knows an email address and rarely which tenant it belongs to.
 */
export function PeopleDirectory({ people }: { people: Person[] }) {
  const [query, setQuery] = useState("");
  const [tenant, setTenant] = useState("");
  const [sort, setSort] = useState<Sort>("tenant");

  const tenantNames = useMemo(
    () => [...new Set(people.flatMap((person) => person.tenants.map((t) => t.name)))].sort(),
    [people],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return people
      .filter((person) =>
        tenant === "none"
          ? person.tenants.length === 0
          : !tenant || person.tenants.some((t) => t.name === tenant),
      )
      .filter(
        (person) =>
          !needle ||
          [person.email, person.name, ...person.tenants.map((t) => `${t.name} ${t.slug}`)]
            .join(" ")
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) => compare(a, b, sort));
  }, [people, query, tenant, sort]);

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">People</p>
          <h2 className="mt-1 text-[20px] leading-6">Every account</h2>
          <p className="mt-1 text-[13px] text-slate">
            {people.length} account{people.length === 1 ? "" : "s"} across all tenants. Resetting a
            password or resending a welcome issues a new temporary password and forces a change at
            the next sign-in.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="people-tenant">
              Tenant
            </label>
            <select
              id="people-tenant"
              value={tenant}
              onChange={(event) => setTenant(event.target.value)}
              className="field mt-1 py-[10px] text-[13px]"
            >
              <option value="">All tenants</option>
              {tenantNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value="none">No tenant</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="people-sort">
              Sort by
            </label>
            <select
              id="people-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="field mt-1 py-[10px] text-[13px]"
            >
              {Object.entries(SORTS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="people-search">
              Search
            </label>
            <input
              id="people-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="email, name or tenant"
              className="field mt-1 w-full py-[10px] text-[13px] sm:w-[240px]"
            />
          </div>
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
