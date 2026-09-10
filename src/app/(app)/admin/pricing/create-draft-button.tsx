"use client";

import { useActionState } from "react";
import { createDraft, type AdminState } from "./actions";

export function CreateDraftButton({ hasDraft }: { hasDraft: boolean }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(createDraft, {});

  return (
    <form action={action} className="space-y-2">
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Working…" : hasDraft ? "Open the working draft" : "Create a new draft"}
      </button>
      {state.error ? (
        <p role="alert" className="max-w-xs text-[13px] font-medium text-orange">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
