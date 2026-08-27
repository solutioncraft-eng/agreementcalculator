"use server";

import { revalidatePath } from "next/cache";
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
