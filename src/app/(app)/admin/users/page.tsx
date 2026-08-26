import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { UserAdmin } from "./user-admin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireRole("ADMIN");
  const users = await prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 text-[32px] leading-9">People and roles</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Account managers build agreements. Leaders review anything flagged. Administrators also control
          pricing versions and see the audit log.
        </p>
        {emailConfigured ? null : (
          <p className="mt-3 rounded-brand bg-orange-tint/20 px-3 py-2 text-[13px] text-orange-dark">
            Email is not configured, so notifications stay in-app and temporary passwords are shown here once
            for you to hand over.
          </p>
        )}
      </header>

      <UserAdmin
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
