"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { createSession, getCurrentUser, membershipsFor } from "@/lib/auth";

/**
 * Opens a workspace from the picker. The membership is re-read here so a
 * posted tenant id the person does not belong to changes nothing.
 */
export async function openWorkspace(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const tenantId = String(formData.get("tenantId") ?? "");
  const target = (await membershipsFor(user.id)).find((m) => m.tenantId === tenantId);
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
