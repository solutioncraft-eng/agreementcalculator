import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { appUrl, sendMail, type MailResult } from "@/lib/email";

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
