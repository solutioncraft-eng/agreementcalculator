import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/(app)/actions";

export const dynamic = "force-dynamic";

/**
 * Dead end for an authenticated account with no membership in the workspace it
 * asked for — including someone landing on another workspace's hostname. It
 * deliberately reveals nothing about whether that workspace exists.
 */
export default async function NoWorkspacePage() {
  const user = await requireUser();

  return (
    <main className="mx-auto max-w-[520px] px-6 py-16">
      <p className="eyebrow">Signed in as {user.email}</p>
      <h1 className="mt-2 text-[32px] leading-9">No workspace access</h1>
      <p className="mt-3 text-slate">
        This account is not a member of this workspace. Ask an administrator there to invite you, then sign in
        again.
      </p>

      <div className="mt-8 flex items-center gap-4">
        <form action={logout}>
          <button type="submit" className="btn-primary">
            Sign out
          </button>
        </form>
        {user.isSuperAdmin ? (
          <Link href="/super" className="text-[13px] font-medium text-orange">
            Super-admin portal
          </Link>
        ) : null}
      </div>
    </main>
  );
}
