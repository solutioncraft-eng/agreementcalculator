"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { destroySession, getSession } from "@/lib/auth";

export async function logout(): Promise<void> {
  const session = await getSession();
  if (session) await audit({ action: "LOGOUT", summary: `${session.email} signed out`, actor: session });
  await destroySession();
  redirect("/login");
}
