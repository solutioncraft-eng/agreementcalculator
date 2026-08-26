import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { APP_VERSION } from "@/lib/version";
import { logout } from "@/app/(app)/actions";

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();

  return (
    <div className="min-h-screen">
      <header className="border-b border-navy bg-navy text-white">
        <div className="mx-auto flex max-w-content items-center gap-6 px-6 py-3 md:px-10 lg:px-16">
          <Link href="/super" className="font-display text-[15px] font-bold uppercase tracking-eyebrow">
            Agreement Calculator · Operator
          </Link>
          <div className="flex flex-1 items-center justify-end gap-4 text-[13px]">
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-mist">{user.email}</span>
            <Link href="/workspaces" className="font-medium text-mist hover:text-orange-tint">
              Workspaces
            </Link>
            <form action={logout}>
              <button type="submit" className="font-medium text-mist hover:text-orange-tint">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="bg-orange px-6 py-2 text-center font-display text-[11px] font-bold uppercase tracking-eyebrow text-white">
        Operator view · workspace metadata only — quote contents and tool costs are never shown here
      </div>

      <main className="mx-auto max-w-content px-6 py-8 md:px-10 lg:px-16">{children}</main>

      <footer className="mx-auto max-w-content px-6 pb-10 text-[12px] text-slate md:px-10 lg:px-16">
        Agreement Calculator {APP_VERSION}
      </footer>
    </div>
  );
}
