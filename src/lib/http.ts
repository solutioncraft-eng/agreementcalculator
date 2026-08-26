import { redirect } from "next/navigation";

/// Sends a signed-in user who lacks the role back to a page they can use.
export function forbidden(): never {
  redirect("/calculator?denied=1");
}
