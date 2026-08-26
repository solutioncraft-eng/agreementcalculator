import { redirect } from "next/navigation";
import { membershipsFor, requireUser } from "@/lib/auth";
import { openWorkspace } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Workspace picker, shown after sign-in to anyone who belongs to more than
 * one. A single membership never gets here — it opens itself.
 */
export default async function WorkspacesPage() {
  const user = await requireUser();
  const memberships = await membershipsFor(user.id);

  if (memberships.length === 0) redirect(user.isSuperAdmin ? "/super" : "/no-workspace");

  return (
    <main className="mx-auto max-w-[560px] px-6 py-16">
      <p className="eyebrow">Signed in as {user.email}</p>
      <h1 className="mt-2 text-[32px] leading-9">Choose a workspace</h1>
      <p className="mt-2 text-slate">
        Your role differs per workspace, so pricing, quotes and administration change with it.
      </p>

      <ul className="mt-8 space-y-3">
        {memberships.map((membership) => (
          <li key={membership.tenantId}>
            <form action={openWorkspace}>
              <input type="hidden" name="tenantId" value={membership.tenantId} />
              <button
                type="submit"
                className="card flex w-full items-center justify-between px-5 py-4 text-left hover:border-orange"
              >
                <span>
                  <span className="block font-display text-[17px] font-bold text-navy">
                    {membership.name}
                  </span>
                  <span className="block font-mono text-[12px] text-slate">{membership.slug}</span>
                </span>
                <span className="font-mono text-[11px] uppercase tracking-eyebrow text-slate">
                  {membership.role}
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>

      {user.isSuperAdmin ? (
        <p className="mt-8 text-[13px] text-slate">
          Product operator? Open the{" "}
          <a href="/super" className="font-medium text-orange">
            super-admin portal
          </a>
          .
        </p>
      ) : null}
    </main>
  );
}
