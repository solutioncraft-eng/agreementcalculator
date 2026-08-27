"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { hashResetToken, resetTokenUsable } from "@/lib/password-reset";

export interface ResetState {
  error?: string;
}

const schema = z
  .object({
    token: z.string().min(1),
    next: z.string().min(12, "Use at least 12 characters."),
    confirm: z.string(),
  })
  .refine((value) => value.next === value.confirm, {
    message: "The new passwords do not match.",
  });

const EXPIRED = "That reset link has expired or has already been used. Request a new one.";

/** The link itself is the credential, so the token is all this action trusts. */
export async function completeReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the fields and try again." };
  }

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(parsed.data.token) },
    include: { user: true },
  });
  if (!row || !resetTokenUsable(row) || !row.user.active) return { error: EXPIRED };
  if (await verifyPassword(parsed.data.next, row.user.passwordHash)) {
    return { error: "Choose a password you have not used here before." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: await hashPassword(parsed.data.next), mustReset: false },
    }),
    // Consume this link and retire any other outstanding one for the account.
    prisma.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  await audit({
    action: "PASSWORD_RESET",
    entity: "User",
    entityId: row.userId,
    summary: `${row.user.email} set a new password with a reset link`,
    actorEmail: row.user.email,
  });

  redirect("/login?reset=1");
}
