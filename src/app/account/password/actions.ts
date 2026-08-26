"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword, requireUser, verifyPassword } from "@/lib/auth";

export interface PasswordState {
  error?: string;
}

const schema = z
  .object({
    current: z.string().min(1),
    next: z.string().min(12, "Use at least 12 characters."),
    confirm: z.string(),
  })
  .refine((value) => value.next === value.confirm, {
    message: "The new passwords do not match.",
  });

export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the fields and try again." };
  }

  const account = await prisma.user.findUnique({ where: { id: user.id } });
  if (!account || !(await verifyPassword(parsed.data.current, account.passwordHash))) {
    return { error: "That current password is not right." };
  }
  if (await verifyPassword(parsed.data.next, account.passwordHash)) {
    return { error: "Choose a password you have not used here before." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.next), mustReset: false },
  });

  await audit({
    action: "PASSWORD_CHANGED",
    entity: "User",
    entityId: user.id,
    summary: `${user.email} changed their own password`,
    actor: user,
  });

  redirect("/calculator");
}
