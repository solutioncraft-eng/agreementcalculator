"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import {
  createSession,
  destroySession,
  getCurrentUser,
  membershipsFor,
} from "@/lib/auth";

export async function logout(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await audit({ action: "LOGOUT", summary: `${user.email} signed out`, actor: user });
  await destroySession();
  redirect("/login");
}

/**
 * Moves the session to another workspace. The membership is re-checked here
 * rather than trusted from the form, so a posted tenant id the person has no
 * membership in changes nothing.
 */
export async function switchWorkspace(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const tenantId = String(formData.get("tenantId") ?? "");
  const memberships = await membershipsFor(user.id);
  const target = memberships.find((m) => m.tenantId === tenantId);
  if (!target) redirect("/workspaces");

  await createSession(user.id, target.tenantId);
  await audit({
    action: "WORKSPACE_SWITCHED",
    summary: `${user.email} opened ${target.name}`,
    tenantId: target.tenantId,
    actor: user,
  });
  redirect("/calculator");
}
