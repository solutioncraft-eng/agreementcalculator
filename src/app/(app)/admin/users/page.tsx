import { requireRole } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { UserAdmin } from "./user-admin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { tenant, db } = await requireRole("ADMIN");
  const members = await db.membership.findMany({
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
    include: { user: true },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 text-[32px] leading-9">People and roles</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Account managers build agreements. Leaders review anything flagged. Administrators also control
          pricing versions and see the audit log. Roles apply to {tenant.name} only — the same person can hold
          a different role in another workspace.
        </p>
        {emailConfigured ? null : (
          <p className="mt-3 rounded-brand bg-orange-tint/20 px-3 py-2 text-[13px] text-orange-dark">
            Email is not configured, so notifications stay in-app and temporary passwords are shown here once
            for you to hand over.
          </p>
        )}
      </header>

      <UserAdmin
        workspaceName={tenant.name}
        members={members.map((member) => ({
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          role: member.role,
          active: member.user.active,
          lastLoginAt: member.user.lastLoginAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
