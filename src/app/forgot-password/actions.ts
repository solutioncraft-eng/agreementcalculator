"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { appUrl, sendMail } from "@/lib/email";
import {
  RESET_MAX_REQUESTS,
  RESET_TTL_MINUTES,
  newResetToken,
  resetExpiry,
  resetWindowStart,
} from "@/lib/password-reset";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

export interface ForgotState {
  error?: string;
  sent?: boolean;
}

/**
 * Always reports the same outcome, whether or not the address has an account:
 * this form is unauthenticated, so telling the difference would turn it into an
 * account-enumeration oracle.
 */
export async function requestReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter the work email you sign in with." };
  const { email } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    await audit({
      action: "PASSWORD_RESET_REQUESTED",
      summary: `Password reset requested for unknown or inactive account ${email}`,
      actorEmail: email,
    });
    return { sent: true };
  }

  const recent = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: resetWindowStart() } },
  });
  if (recent >= RESET_MAX_REQUESTS) return { sent: true };

  // Older links stop working the moment a new one is issued.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const { token, tokenHash } = newResetToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: resetExpiry() },
  });

  await audit({
    action: "PASSWORD_RESET_REQUESTED",
    entity: "User",
    entityId: user.id,
    summary: `Password reset link sent to ${user.email}`,
    actorEmail: user.email,
  });

  const url = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const mailed = await sendMail({
    to: [user.email],
    subject: "Reset your Agreement Calculator password",
    heading: "Choose a new password",
    lines: [
      "Use the link below to set a new password.",
      `The link works once and expires in ${RESET_TTL_MINUTES} minutes.`,
      "If you did not ask for this, you can ignore this email — your current password still works.",
    ],
    actionLabel: "Set a new password",
    actionUrl: url,
  });

  // The link is never returned to the browser — this form is unauthenticated,
  // so anyone could then reset anyone's password. An install without a mail
  // provider logs it for the operator instead.
  if (!mailed.sent && mailed.reason === "unconfigured") {
    console.warn(`password reset link for ${user.email} (no mail provider configured): ${url}`);
  }
  return { sent: true };
}
