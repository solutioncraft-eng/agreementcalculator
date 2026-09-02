"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword, requireRole } from "@/lib/auth";
import {
  handoverMessage,
  issueTemporaryPassword,
  temporaryPassword,
  welcomeMail,
} from "@/lib/credentials";
import { appUrl, sendMail } from "@/lib/email";

export interface UserState {
  error?: string;
  ok?: string;
  /// Shown once, when the email could not be delivered and the admin must hand it over.
  tempPassword?: string;
}

const roleSchema = z.enum(["ADMIN", "LEADER", "AM"]);

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(80),
  role: roleSchema,
});

/**
 * Invites someone into this workspace. Accounts are global and identified by
 * email, so an existing person gains a membership (and keeps their password)
 * rather than getting a second account.
 */
export async function inviteMember(_prev: UserState, formData: FormData): Promise<UserState> {
  const { user: admin, tenant, db } = await requireRole("ADMIN");
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: "Enter a name, work email and role." };
  const { email, name, role } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { where: { tenantId: tenant.id } } },
  });
  if (existing?.memberships.length) return { error: `${email} is already in ${tenant.name}.` };

  const password = existing ? null : temporaryPassword();
  const account =
    existing ??
    (await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await hashPassword(password ?? temporaryPassword()),
        mustReset: true,
      },
    }));

  await db.membership.create({ data: { tenantId: tenant.id, userId: account.id, role } });

  await audit({
    action: "MEMBERSHIP_CREATED",
    entity: "Membership",
    entityId: account.id,
    summary: `${email} added to ${tenant.name} as ${role} by ${admin.name}`,
    after: { email, name: account.name, role },
    tenantId: tenant.id,
    actor: admin,
  });

  const mailed = await sendMail(
    password
      ? await welcomeMail({
          userId: account.id,
          email,
          tenantName: tenant.name,
          intro: `${admin.name} gave you ${role} access to ${tenant.name}.`,
        })
      : {
          to: [email],
          subject: `[${tenant.name}] Your Agreement Calculator account`,
          heading: `You now have access to ${tenant.name}`,
          lines: [`${admin.name} gave you ${role} access to ${tenant.name}.`],
          actionLabel: "Sign in",
          actionUrl: appUrl("/login"),
        },
  );

  revalidatePath("/admin/users");
  if (mailed.sent) return { ok: `${email} added — an email is on its way.` };
  return password
    ? { ok: `${email} added. ${handoverMessage(mailed, email)}`, tempPassword: password }
    : { ok: `${email} added, but the notification email failed.` };
}

async function memberOrError(tenantId: string, userId: string) {
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    include: { user: true },
  });
  if (!membership) return { error: "That person is not in this workspace." } as const;
  return { membership } as const;
}

export async function updateMember(_prev: UserState, formData: FormData): Promise<UserState> {
  const { user: admin, tenant, db } = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const found = await memberOrError(tenant.id, userId);
  if ("error" in found) return { error: found.error };

  const parsed = roleSchema.safeParse(formData.get("role"));
  if (!parsed.success) return { error: "Pick a valid role." };
  const role: Role = parsed.data;
  const { membership } = found;

  if (userId === admin.id && role !== "ADMIN") {
    return { error: "You cannot remove your own administrator access." };
  }
  if (membership.role === "ADMIN" && role !== "ADMIN") {
    const admins = await db.membership.count({ where: { role: "ADMIN", userId: { not: userId } } });
    if (admins === 0) return { error: "At least one administrator must remain in this workspace." };
  }

  await db.membership.update({ where: { id: membership.id }, data: { role } });
  await audit({
    action: "MEMBERSHIP_UPDATED",
    entity: "Membership",
    entityId: membership.id,
    summary: `${membership.user.email} set to ${role} in ${tenant.name} by ${admin.name}`,
    before: { role: membership.role },
    after: { role },
    tenantId: tenant.id,
    actor: admin,
  });

  revalidatePath("/admin/users");
  return { ok: `${membership.user.email} is now ${role}.` };
}

export async function removeMember(_prev: UserState, formData: FormData): Promise<UserState> {
  const { user: admin, tenant, db } = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const found = await memberOrError(tenant.id, userId);
  if ("error" in found) return { error: found.error };
  const { membership } = found;

  if (userId === admin.id) return { error: "You cannot remove yourself from this workspace." };
  if (membership.role === "ADMIN") {
    const admins = await db.membership.count({ where: { role: "ADMIN", userId: { not: userId } } });
    if (admins === 0) return { error: "At least one administrator must remain in this workspace." };
  }

  await db.membership.delete({ where: { id: membership.id } });
  await audit({
    action: "MEMBERSHIP_REMOVED",
    entity: "Membership",
    entityId: membership.id,
    summary: `${membership.user.email} removed from ${tenant.name} by ${admin.name}`,
    before: { role: membership.role },
    tenantId: tenant.id,
    actor: admin,
  });

  revalidatePath("/admin/users");
  return { ok: `${membership.user.email} no longer has access to ${tenant.name}.` };
}

/** Mails a fresh welcome link; a temporary password only when the email cannot go out. */
export async function resendWelcome(_prev: UserState, formData: FormData): Promise<UserState> {
  const { user: admin, tenant } = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const found = await memberOrError(tenant.id, userId);
  if ("error" in found) return { error: found.error };
  const { user } = found.membership;

  await audit({
    action: "WELCOME_EMAIL_RESENT",
    entity: "User",
    entityId: user.id,
    summary: `Welcome email resent to ${user.email} by ${admin.name}`,
    tenantId: tenant.id,
    actor: admin,
  });

  const mailed = await sendMail(
    await welcomeMail({
      userId: user.id,
      email: user.email,
      tenantName: tenant.name,
      intro: `${admin.name} set up your access to ${tenant.name} as ${found.membership.role}.`,
    }),
  );

  revalidatePath("/admin/users");
  if (mailed.sent) return { ok: `Welcome email resent to ${user.email}.` };
  // With no email to carry the link, a temporary password is the only way in.
  const password = await issueTemporaryPassword(userId);
  return { ok: handoverMessage(mailed, user.email), tempPassword: password };
}

export async function resetPassword(_prev: UserState, formData: FormData): Promise<UserState> {
  const { user: admin, tenant } = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const found = await memberOrError(tenant.id, userId);
  if ("error" in found) return { error: found.error };
  const { user } = found.membership;

  const password = await issueTemporaryPassword(userId);

  await audit({
    action: "PASSWORD_CHANGED",
    entity: "User",
    entityId: user.id,
    summary: `Password reset for ${user.email} by ${admin.name}`,
    tenantId: tenant.id,
    actor: admin,
  });

  const mailed = await sendMail({
    to: [user.email],
    subject: "Your Agreement Calculator password was reset",
    heading: "Your password was reset",
    lines: [`Temporary password: ${password}`, "Change it after your next sign-in."],
    actionLabel: "Sign in",
    actionUrl: appUrl("/login"),
  });

  revalidatePath("/admin/users");
  return mailed.sent
    ? { ok: `A temporary password was emailed to ${user.email}.` }
    : { ok: handoverMessage(mailed, user.email), tempPassword: password };
}
