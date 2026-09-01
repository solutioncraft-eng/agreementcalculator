"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireSuperAdmin } from "@/lib/auth";
import { handoverMessage, issueTemporaryPassword, mailTemporaryPassword } from "@/lib/credentials";
import type { SuperState } from "./actions";

/**
 * Anyone with an account, whichever workspaces they belong to — including
 * accounts belonging to none, which is where an invitation that was never
 * completed ends up. Read unscoped because that is the whole point: a workspace
 * administrator sees their own people at Admin → People.
 */
async function accountOr(userId: unknown) {
  const id = String(userId ?? "");
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
    include: { memberships: { include: { tenant: { select: { name: true } } } } },
  });
}

/** Which workspace an operator action is attributed to, when there is one. */
function primaryTenantId(memberships: { tenantId: string }[]): string | null {
  return memberships[0]?.tenantId ?? null;
}

/**
 * Issues a fresh temporary password and emails it. Both, deliberately: the email
 * is how the person actually gets in, and the password is shown to the operator
 * as well so a bounced or delayed message does not leave them stuck on a call.
 */
export async function operatorResetPassword(
  _prev: SuperState,
  formData: FormData,
): Promise<SuperState> {
  const operator = await requireSuperAdmin();
  const account = await accountOr(formData.get("userId"));
  if (!account) return { error: "That account no longer exists." };

  const password = await issueTemporaryPassword(account.id);
  await audit({
    action: "PASSWORD_CHANGED",
    entity: "User",
    entityId: account.id,
    summary: `Password reset for ${account.email} by operator ${operator.email}`,
    tenantId: primaryTenantId(account.memberships),
    actor: operator,
  });

  const mailed = await mailTemporaryPassword({
    email: account.email,
    password,
    subject: "Your Agreement Calculator password was reset",
    heading: "Your password was reset",
    lines: ["An Agreement Calculator operator reset your password at your request."],
  });

  revalidatePath("/super");
  return {
    ok: mailed.sent
      ? `A temporary password was emailed to ${account.email}. It is also shown here in case the email does not arrive.`
      : handoverMessage(mailed, account.email),
    tempPassword: password,
  };
}

/**
 * Sends the welcome mail again with a new temporary password — for someone who
 * never received or never used the first one.
 */
export async function operatorResendWelcome(
  _prev: SuperState,
  formData: FormData,
): Promise<SuperState> {
  const operator = await requireSuperAdmin();
  const account = await accountOr(formData.get("userId"));
  if (!account) return { error: "That account no longer exists." };

  const password = await issueTemporaryPassword(account.id);
  await audit({
    action: "WELCOME_EMAIL_RESENT",
    entity: "User",
    entityId: account.id,
    summary: `Welcome email resent to ${account.email} by operator ${operator.email}`,
    tenantId: primaryTenantId(account.memberships),
    actor: operator,
  });

  const workspaces = account.memberships.map((m) => `${m.tenant.name} (${m.role})`);
  const mailed = await mailTemporaryPassword({
    email: account.email,
    password,
    subject: "Your Agreement Calculator account",
    heading: "Your account is ready",
    lines:
      workspaces.length > 0
        ? [`You have access to ${workspaces.join(", ")}.`]
        : ["Your account is set up. An administrator will add you to a workspace."],
  });

  revalidatePath("/super");
  return {
    ok: mailed.sent
      ? `Welcome email resent to ${account.email} with a new temporary password.`
      : handoverMessage(mailed, account.email),
    tempPassword: password,
  };
}

const activeSchema = z.object({
  userId: z.string().min(1),
  active: z.enum(["true", "false"]),
});

/**
 * Switches an account off or back on. A deactivated account keeps everything it
 * ever did but cannot sign in — the reversible half of removing someone, and
 * the only option once they have work attributed to them.
 */
export async function setAccountActive(_prev: SuperState, formData: FormData): Promise<SuperState> {
  const operator = await requireSuperAdmin();
  const parsed = activeSchema.safeParse({
    userId: formData.get("userId"),
    active: formData.get("active"),
  });
  if (!parsed.success) return { error: "That is not a valid change." };

  const account = await accountOr(parsed.data.userId);
  if (!account) return { error: "That account no longer exists." };

  const active = parsed.data.active === "true";
  if (!active && account.id === operator.id) {
    return { error: "You cannot deactivate the account you are signed in with." };
  }
  if (account.active === active) {
    return { ok: `${account.email} is already ${active ? "active" : "deactivated"}.` };
  }

  await prisma.user.update({ where: { id: account.id }, data: { active } });
  await audit({
    action: active ? "USER_UPDATED" : "USER_DEACTIVATED",
    entity: "User",
    entityId: account.id,
    summary: `${account.email} ${active ? "reactivated" : "deactivated"} by operator ${operator.email}`,
    before: { active: account.active },
    after: { active },
    tenantId: primaryTenantId(account.memberships),
    actor: operator,
  });

  revalidatePath("/super");
  return {
    ok: active
      ? `${account.email} can sign in again.`
      : `${account.email} can no longer sign in. Their history is untouched.`,
  };
}

const deleteSchema = z.object({
  userId: z.string().min(1),
  confirmEmail: z.string().trim().toLowerCase(),
});

/**
 * Deletes an account outright. Only possible while nothing is attributed to it:
 * quotes, reviews, exports and pricing versions all name their author, and that
 * attribution is the point of the audit trail, so an account that has done any
 * of it can only be deactivated. Memberships and reset tokens cascade; audit
 * events keep the email they recorded and lose the link to the row.
 */
export async function deleteAccount(_prev: SuperState, formData: FormData): Promise<SuperState> {
  const operator = await requireSuperAdmin();
  const parsed = deleteSchema.safeParse({
    userId: formData.get("userId"),
    confirmEmail: formData.get("confirmEmail"),
  });
  if (!parsed.success) return { error: "Type the email address to confirm." };

  const account = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    include: {
      memberships: { select: { tenantId: true } },
      _count: {
        select: {
          quoteRequests: true,
          reviews: true,
          exports: true,
          createdVersions: true,
          publishedVersion: true,
        },
      },
    },
  });
  if (!account) return { error: "That account no longer exists." };
  if (account.id === operator.id) return { error: "You cannot delete your own account." };
  if (parsed.data.confirmEmail !== account.email) {
    return { error: `Type ${account.email} exactly to delete this account.` };
  }

  const attributed = describeWork(account._count);
  if (attributed) {
    return {
      error: `${account.email} has ${attributed} attributed to them, which the audit trail keeps. Deactivate the account instead.`,
    };
  }

  await audit({
    action: "USER_DELETED",
    entity: "User",
    entityId: account.id,
    summary: `Account ${account.email} deleted by operator ${operator.email}`,
    before: {
      email: account.email,
      name: account.name,
      isSuperAdmin: account.isSuperAdmin,
      memberships: account.memberships.length,
      createdAt: account.createdAt.toISOString(),
    },
    actor: operator,
  });

  await prisma.user.delete({ where: { id: account.id } });

  revalidatePath("/super");
  return { ok: `${account.email} has been deleted.` };
}

/** Reads back what an account has authored, as a phrase, or null when nothing. */
function describeWork(counts: {
  quoteRequests: number;
  reviews: number;
  exports: number;
  createdVersions: number;
  publishedVersion: number;
}): string | null {
  const parts: string[] = [];
  const add = (count: number, one: string, many: string) => {
    if (count > 0) parts.push(`${count} ${count === 1 ? one : many}`);
  };
  add(counts.quoteRequests, "quote", "quotes");
  add(counts.reviews, "review", "reviews");
  add(counts.exports, "export", "exports");
  add(counts.createdVersions + counts.publishedVersion, "pricing version", "pricing versions");
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
