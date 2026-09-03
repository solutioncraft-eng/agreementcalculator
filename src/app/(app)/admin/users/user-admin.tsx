"use client";

import { useActionState } from "react";
import clsx from "clsx";
import { LocalTime } from "@/components/local-time";
import {
  inviteMember,
  removeMember,
  resendWelcome,
  resetPassword,
  updateMember,
  type UserState,
} from "./actions";

interface MemberView {
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

export function UserAdmin({
  workspaceName,
  members,
}: {
  workspaceName: string;
  members: MemberView[];
}) {
  const [inviteState, inviteAction, inviting] = useActionState<UserState, FormData>(inviteMember, {});
  const [updateState, updateAction] = useActionState<UserState, FormData>(updateMember, {});
  const [removeState, removeAction] = useActionState<UserState, FormData>(removeMember, {});
  const [resetState, resetAction] = useActionState<UserState, FormData>(resetPassword, {});
  const [welcomeState, welcomeAction] = useActionState<UserState, FormData>(resendWelcome, {});

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-[18px]">Add a person</h2>
        <p className="mt-1 text-[14px] text-slate">
          If they already use the Agreement Calculator elsewhere, they keep their password and simply gain
          access to {workspaceName}.
        </p>
        <form action={inviteAction} className="mt-4 grid gap-4 md:grid-cols-4 md:items-end">
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
          <button type="submit" className="btn-primary" disabled={inviting}>
            {inviting ? "Adding…" : "Add to workspace"}
          </button>
        </form>
        <Feedback state={inviteState} />
      </section>

      <section className="card">
        <h2 className="text-[18px]">People in {workspaceName}</h2>
        <Feedback state={updateState} />
        <Feedback state={removeState} />
        <Feedback state={resetState} />
        <Feedback state={welcomeState} />
        <ul className="mt-4 divide-y divide-mist border-t border-navy">
          {members.map((member) => (
            <li
              key={member.id}
              className={clsx(
                "flex flex-wrap items-center gap-x-6 gap-y-3 py-4 text-[14px]",
                !member.active && "text-slate",
              )}
            >
              <div className="min-w-[220px] flex-1">
                <p className="font-medium text-navy">
                  {member.name}
                  {member.active ? null : (
                    <span className="ml-2 font-mono text-[10px] uppercase text-slate">inactive</span>
                  )}
                </p>
                <p className="text-slate">{member.email}</p>
                <p className="mt-1 font-mono text-[11px] text-slate">
                  {member.lastLoginAt ? (
                    <>
                      Last sign-in <LocalTime iso={member.lastLoginAt} />
                    </>
                  ) : (
                    "Never signed in"
                  )}
                </p>
              </div>

              <form key={member.role} action={updateAction} className="flex items-center gap-2">
                <input type="hidden" name="userId" value={member.id} />
                <select name="role" defaultValue={member.role} className="field w-44 py-1">
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
                  <input type="hidden" name="userId" value={member.id} />
                  <button type="submit" className="btn-ghost btn-sm" disabled={!member.active}>
                    Resend welcome email
                  </button>
                </form>
                <form action={resetAction}>
                  <input type="hidden" name="userId" value={member.id} />
                  <button type="submit" className="btn-ghost btn-sm">
                    Reset password
                  </button>
                </form>
                <form
                  action={removeAction}
                  onSubmit={(event) => {
                    if (
                      !window.confirm(
                        `Remove ${member.name} (${member.email}) from ${workspaceName}? They lose access to this workspace; their quotes and history stay.`,
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="userId" value={member.id} />
                  <button type="submit" className="btn-ghost btn-sm text-orange-dark">
                    Remove from workspace
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
