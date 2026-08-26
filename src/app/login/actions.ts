"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSession, membershipsFor, verifyPassword } from "@/lib/auth";
import { slugFromHost } from "@/lib/tenant";

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
  const memberships = await membershipsFor(user.id);

  // Signing in on a workspace's own hostname opens that workspace; otherwise a
  // single membership opens itself and several send the person to the picker.
  const hostSlug = await slugFromHost();
  const onHost = hostSlug ? memberships.find((m) => m.slug === hostSlug) : undefined;
  const active = onHost ?? (memberships.length === 1 ? memberships[0] : undefined);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id, active?.tenantId ?? null);
  await audit({
    action: "LOGIN",
    summary: `${user.email} signed in${active ? ` to ${active.name}` : ""}`,
    tenantId: active?.tenantId,
    actor: account,
  });

  if (hostSlug && !onHost) redirect("/no-workspace");
  if (active) redirect("/calculator");
  if (memberships.length > 1) redirect("/workspaces");
  redirect(user.isSuperAdmin ? "/super" : "/no-workspace");
}
