import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSession, membershipsFor, type SessionAccount } from "@/lib/auth";
import { slugFromHost } from "@/lib/tenant";

/** How the person proved who they are. Recorded on the audit event. */
export type SignInMethod = "password" | "google";

/**
 * Opens a session and says where the person should land.
 *
 * Shared by every way of signing in so they cannot drift apart: whichever door
 * is used, the workspace is chosen the same way, the sign-in is audited, and
 * someone with several memberships always ends up at the picker.
 *
 * Signing in on a workspace's own hostname opens that workspace; otherwise a
 * single membership opens itself and several send the person to the picker.
 */
export async function completeSignIn(
  account: SessionAccount,
  method: SignInMethod,
): Promise<string> {
  const memberships = await membershipsFor(account.id);
  const hostSlug = await slugFromHost();
  const onHost = hostSlug ? memberships.find((m) => m.slug === hostSlug) : undefined;
  const active = onHost ?? (memberships.length === 1 ? memberships[0] : undefined);

  await prisma.user.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
  await createSession(account.id, active?.tenantId ?? null);
  await audit({
    action: "LOGIN",
    summary: `${account.email} signed in${method === "google" ? " with Google" : ""}${
      active ? ` to ${active.name}` : ""
    }`,
    tenantId: active?.tenantId,
    actor: account,
  });

  if (hostSlug && !onHost) return "/no-workspace";
  if (active) return "/calculator";
  if (memberships.length > 1) return "/workspaces";
  return account.isSuperAdmin ? "/super" : "/no-workspace";
}
