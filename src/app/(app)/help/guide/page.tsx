import { redirect } from "next/navigation";
import { listGuideTopics } from "@/lib/guide";

export const dynamic = "force-dynamic";

export default async function GuideIndexPage() {
  const [first] = await listGuideTopics();
  redirect(first ? `/help/guide/${first.slug}` : "/help/changelog");
}
