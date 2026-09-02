"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth";
import { completeSignIn } from "@/lib/sign-in";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your work email and password." };

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Same message for unknown user, wrong password and deactivated account.
  const ok = user && user.active && (await verifyPassword(password, user.passwordHash));
  if (!ok || !user) {
    await audit({
      action: "LOGIN_FAILED",
      summary: `Failed sign-in attempt for ${email}`,
      actorEmail: email,
    });
    return { error: "Those credentials are not valid." };
  }

  const account = { id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin };
  redirect(await completeSignIn(account, "password"));
}
