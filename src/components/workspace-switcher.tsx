"use client";

import { useRef } from "react";
import type { MembershipSummary } from "@/lib/auth";
import { switchWorkspace } from "@/app/(app)/actions";

/**
 * Header control for people who belong to more than one workspace. Rendered
 * only in that case — a single-workspace user sees their workspace name as
 * plain text instead.
 */
export function WorkspaceSwitcher({
  memberships,
  activeTenantId,
}: {
  memberships: MembershipSummary[];
  activeTenantId: string;
}) {
  const form = useRef<HTMLFormElement>(null);

  return (
    <form action={switchWorkspace} ref={form}>
      <label className="sr-only" htmlFor="workspace">
        Workspace
      </label>
      <select
        id="workspace"
        name="tenantId"
        defaultValue={activeTenantId}
        onChange={() => form.current?.requestSubmit()}
        className="rounded border border-mist bg-paper px-2 py-1 font-display text-[12px] font-semibold text-navy"
      >
        {memberships.map((m) => (
          <option key={m.tenantId} value={m.tenantId}>
            {m.name}
          </option>
        ))}
      </select>
    </form>
  );
}
