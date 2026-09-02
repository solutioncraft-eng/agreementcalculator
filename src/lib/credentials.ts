import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { appUrl, sendMail, type Mail, type MailResult } from "@/lib/email";
import { WELCOME_TTL_MINUTES, newResetToken, resetExpiry } from "@/lib/password-reset";

/** A password nobody has to remember: it is replaced at first sign-in. */
export function temporaryPassword(): string {
  return randomBytes(9).toString("base64url");
}

/**
 * Replaces someone's password with a fresh temporary one and forces a change at
 * their next sign-in. Written through the unscoped client on purpose: accounts
 * are global, and an operator resets passwords for people whose workspace they
 * are not a member of.
 */
export async function issueTemporaryPassword(userId: string): Promise<string> {
  const password = temporaryPassword();
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustReset: true },
  });
  return password;
}

/**
 * Mints the single-use link a welcome email carries. It lands on `/welcome`,
 * where the person either continues with Google or chooses a password — so no
 * temporary password has to travel by email. Any earlier outstanding link for
 * the account stops working. `base` lets a workspace-hosted deployment point at
 * the tenant's own hostname.
 */
const WELCOME_TTL_DAYS = WELCOME_TTL_MINUTES / (24 * 60);

export async function issueWelcomeLink(userId: string, base?: (path: string) => string): Promise<string> {
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  const { token, tokenHash } = newResetToken();
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt: resetExpiry(new Date(), WELCOME_TTL_MINUTES) },
  });
  return (base ?? appUrl)(`/welcome?token=${encodeURIComponent(token)}`);
}

/**
 * Turns a failed send into an explanation the sender can act on — a rejected
 * message (unverified sending domain, bad address) reads very differently from
 * an unconfigured mailer.
 */
export function handoverMessage(result: MailResult, email: string): string {
  if (result.sent) return "";
  if (result.reason === "unconfigured") {
    return `Email is not configured — hand this temporary password to ${email} securely.`;
  }
  return `Email to ${email} was rejected${result.detail ? `: ${result.detail}` : "."} Hand this temporary password over securely.`;
}

/** The welcome email: one link, on which the person picks Google or a password. */
export async function welcomeMail(input: {
  userId: string;
  email: string;
  tenantName: string;
  intro: string;
  lines?: string[];
  base?: (path: string) => string;
}): Promise<Mail> {
  return {
    to: [input.email],
    subject: `[${input.tenantName}] Your Agreement Calculator account`,
    heading: "Your account is ready",
    lines: [
      input.intro,
      ...(input.lines ?? []),
      "Use the link below to finish setting up: continue with Google, or choose a password.",
      `The link works once and expires in ${WELCOME_TTL_DAYS} days.`,
    ],
    actionLabel: "Set up your sign-in",
    actionUrl: await issueWelcomeLink(input.userId, input.base),
  };
}

/** Mails a temporary password out. The subject says which workspace, if any. */
export function mailTemporaryPassword(input: {
  email: string;
  password: string;
  subject: string;
  heading: string;
  lines: string[];
}): Promise<MailResult> {
  return sendMail({
    to: [input.email],
    subject: input.subject,
    heading: input.heading,
    lines: [...input.lines, `Temporary password: ${input.password}`, "You will be asked to change it when you sign in."],
    actionLabel: "Sign in",
    actionUrl: appUrl("/login"),
  });
}
