"use client";

import { useActionState } from "react";
import clsx from "clsx";
import { createUser, resendWelcome, resetPassword, updateUser, type UserState } from "./actions";

interface UserView {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
}

const ROLES = [
  { value: "AM", label: "Account manager" },
  { value: "LEADER", label: "Leader (approver)" },
  { value: "ADMIN", label: "Administrator" },
];

function Feedback({ state }: { state: UserState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-3 rounded-brand bg-orange/10 px-3 py-2 text-[13px] text-orange-dark">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <div className="mt-3 rounded-brand bg-navy/5 px-3 py-2 text-[13px] text-navy">
        <p className="font-medium">{state.ok}</p>
        {state.tempPassword ? (
          <p className="mt-1 font-mono text-[13px] text-orange-dark">{state.tempPassword}</p>
        ) : null}
      </div>
    );
  }
  return null;
}

export function UserAdmin({ users }: { users: UserView[] }) {
  const [createState, createAction, creating] = useActionState<UserState, FormData>(createUser, {});
  const [updateState, updateAction] = useActionState<UserState, FormData>(updateUser, {});
  const [resetState, resetAction] = useActionState<UserState, FormData>(resetPassword, {});
  const [welcomeState, welcomeAction] = useActionState<UserState, FormData>(resendWelcome, {});

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-[18px]">Add a person</h2>
        <form action={createAction} className="mt-4 grid gap-4 md:grid-cols-4 md:items-end">
          <div>
            <label className="label" htmlFor="new-name">
              Name
            </label>
            <input id="new-name" name="name" required className="field mt-1" />
          </div>
          <div>
            <label className="label" htmlFor="new-email">
              Work email
            </label>
            <input id="new-email" name="email" type="email" required className="field mt-1" />
          </div>
          <div>
            <label className="label" htmlFor="new-role">
              Role
            </label>
            <select id="new-role" name="role" defaultValue="AM" className="field mt-1">
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? "Creating…" : "Create account"}
          </button>
        </form>
        <Feedback state={createState} />
      </section>

      <section className="card">
        <h2 className="text-[18px]">People</h2>
        <Feedback state={updateState} />
        <Feedback state={resetState} />
        <Feedback state={welcomeState} />
        <ul className="mt-4 divide-y divide-mist border-t border-navy">
          {users.map((user) => (
            <li
              key={user.id}
              className={clsx(
                "flex flex-wrap items-center gap-x-6 gap-y-3 py-4 text-[14px]",
                !user.active && "text-slate",
              )}
            >
              <div className="min-w-[220px] flex-1">
                <p className="font-medium text-navy">
                  {user.name}
                  {user.active ? null : (
                    <span className="ml-2 font-mono text-[10px] uppercase text-slate">inactive</span>
                  )}
                </p>
                <p className="text-slate">{user.email}</p>
                <p className="mt-1 font-mono text-[11px] text-slate">
                  {user.lastLoginAt
                    ? `Last sign-in ${user.lastLoginAt.slice(0, 16).replace("T", " ")} UTC`
                    : "Never signed in"}
                </p>
              </div>

              <form action={updateAction} className="flex items-center gap-2">
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="active" value={String(user.active)} />
                <select name="role" defaultValue={user.role} className="field w-44 py-1">
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-ghost btn-sm">
                  Save
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-2">
                <form action={welcomeAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button type="submit" className="btn-ghost btn-sm" disabled={!user.active}>
                    Resend welcome email
                  </button>
                </form>
                <form action={resetAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button type="submit" className="btn-ghost btn-sm">
                    Reset password
                  </button>
                </form>
                <form action={updateAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="role" value={user.role} />
                  <input type="hidden" name="active" value={String(!user.active)} />
                  <button type="submit" className="btn-ghost btn-sm text-orange-dark">
                    {user.active ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
