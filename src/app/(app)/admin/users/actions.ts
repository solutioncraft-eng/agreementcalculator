"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword, requireRole } from "@/lib/auth";
import { appUrl, sendMail, type MailResult } from "@/lib/email";

export interface UserState {
  error?: string;
  ok?: string;
  /// Shown once, when the email could not be delivered and the admin must hand it over.
  tempPassword?: string;
}

/**
 * Turns a failed send into an explanation the admin can act on — a rejected
 * message (unverified sending domain, bad address) reads very differently from
 * an unconfigured mailer.
 */
function handoverMessage(result: MailResult, email: string): string {
  if (result.sent) return "";
  if (result.reason === "unconfigured") {
    return `Email is not configured — hand this temporary password to ${email} securely.`;
  }
  return `Email to ${email} was rejected${result.detail ? `: ${result.detail}` : "."} Hand this temporary password over securely.`;
}

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(80),
  role: z.enum(["ADMIN", "LEADER", "AM"]),
});

function tempPassword(): string {
  return randomBytes(9).toString("base64url");
}

export async function createUser(_prev: UserState, formData: FormData): Promise<UserState> {
  const admin = await requireRole("ADMIN");
  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: "Enter a name, work email and role." };

  const { email, name, role } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) {
    return { error: `${email} already has an account.` };
  }

  const password = tempPassword();
  const user = await prisma.user.create({
    data: { email, name, role, passwordHash: await hashPassword(password), mustReset: true },
  });

  await audit({
    action: "USER_CREATED",
    entity: "User",
    entityId: user.id,
    summary: `${email} created as ${role} by ${admin.name}`,
    after: { email, name, role },
    actor: admin,
  });

  const mailed = await sendMail({
    to: [email],
    subject: "Your infinIT Agreement Calculator account",
    heading: "Your account is ready",
    lines: [
      `${admin.name} created an account for you as ${role}.`,
      `Temporary password: ${password}`,
      "Change it after your first sign-in.",
    ],
    actionLabel: "Sign in",
    actionUrl: appUrl("/login"),
  });

  revalidatePath("/admin/users");
  return mailed.sent
    ? { ok: `${email} created — a temporary password was emailed.` }
    : { ok: `${email} created. ${handoverMessage(mailed, email)}`, tempPassword: password };
}

export async function updateUser(_prev: UserState, formData: FormData): Promise<UserState> {
  const admin = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const role = formData.get("role");
  const active = formData.get("active");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "That user no longer exists." };

  const nextRole = z.enum(["ADMIN", "LEADER", "AM"]).safeParse(role);
  const nextActive = active === null ? user.active : active === "true";

  if (user.id === admin.id && ((nextRole.success && nextRole.data !== "ADMIN") || !nextActive)) {
    return { error: "You cannot remove your own administrator access." };
  }
  if (!nextActive || (nextRole.success && nextRole.data !== "ADMIN")) {
    const admins = await prisma.user.count({ where: { role: "ADMIN", active: true, id: { not: user.id } } });
    if (user.role === "ADMIN" && admins === 0) {
      return { error: "At least one active administrator must remain." };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: nextRole.success ? nextRole.data : user.role, active: nextActive },
  });

  await audit({
    action: nextActive ? "USER_UPDATED" : "USER_DEACTIVATED",
    entity: "User",
    entityId: user.id,
    summary: `${user.email} ${nextActive ? `set to ${nextRole.success ? nextRole.data : user.role}` : "deactivated"} by ${admin.name}`,
    before: { role: user.role, active: user.active },
    after: { role: nextRole.success ? nextRole.data : user.role, active: nextActive },
    actor: admin,
  });

  revalidatePath("/admin/users");
  return { ok: `${user.email} updated.` };
}

/**
 * Re-sends the sign-in invite. A temporary password cannot be recovered once
 * hashed, so the welcome mail carries a freshly issued one.
 */
export async function resendWelcome(_prev: UserState, formData: FormData): Promise<UserState> {
  const admin = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "That user no longer exists." };
  if (!user.active) return { error: `${user.email} is deactivated — reactivate them first.` };

  const password = tempPassword();
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustReset: true },
  });

  await audit({
    action: "WELCOME_EMAIL_RESENT",
    entity: "User",
    entityId: user.id,
    summary: `Welcome email resent to ${user.email} by ${admin.name}`,
    actor: admin,
  });

  const mailed = await sendMail({
    to: [user.email],
    subject: "Your infinIT Agreement Calculator account",
    heading: "Your account is ready",
    lines: [
      `${admin.name} set up an account for you as ${user.role}.`,
      `Temporary password: ${password}`,
      "Change it after your first sign-in.",
    ],
    actionLabel: "Sign in",
    actionUrl: appUrl("/login"),
  });

  revalidatePath("/admin/users");
  return mailed.sent
    ? { ok: `Welcome email resent to ${user.email} with a new temporary password.` }
    : { ok: handoverMessage(mailed, user.email), tempPassword: password };
}

export async function resetPassword(_prev: UserState, formData: FormData): Promise<UserState> {
  const admin = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "That user no longer exists." };

  const password = tempPassword();
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustReset: true },
  });

  await audit({
    action: "PASSWORD_CHANGED",
    entity: "User",
    entityId: user.id,
    summary: `Password reset for ${user.email} by ${admin.name}`,
    actor: admin,
  });

  const mailed = await sendMail({
    to: [user.email],
    subject: "Your infinIT Agreement Calculator password was reset",
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
