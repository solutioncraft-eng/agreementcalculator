import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/auth";
import { listGuideTopics, loadGuideTopic } from "@/lib/guide";
import { GuideBlocks } from "@/components/guide-content";
import { GuideSidebar } from "./guide-sidebar";

export const dynamic = "force-dynamic";

const MODEL_LABEL = { COST_PLUS: "Cost-plus", MARKUP_MULTIPLE: "Markup multiple" } as const;

export default async function GuideTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant } = await requireTenant();
  const [topics, topic] = await Promise.all([listGuideTopics(), loadGuideTopic(slug)]);
  if (!topic) notFound();

  const index = topics.findIndex((t) => t.slug === topic.slug);
  const previous = index > 0 ? topics[index - 1] : null;
  const next = index >= 0 && index < topics.length - 1 ? topics[index + 1] : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Help · Reference guide</p>
        <h1 className="mt-2 text-[32px] leading-9">{topic.title}</h1>
        {topic.summary ? <p className="mt-2 max-w-2xl text-slate">{topic.summary}</p> : null}
        <p className="mt-2 text-[13px] text-slate">
          Every topic is shown to every role; steps that need a leader or administrator are labelled. This
          workspace prices with the <strong className="text-navy">{MODEL_LABEL[tenant.pricingModel]}</strong>{" "}
          model.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <GuideSidebar topics={topics} current={topic.slug} headings={topic.headings} />

        <article className="card space-y-4">
          <GuideBlocks blocks={topic.blocks} activeModel={tenant.pricingModel} />

          <nav className="flex flex-wrap justify-between gap-3 border-t border-mist pt-4 text-[14px]">
            {previous ? (
              <Link href={`/help/guide/${previous.slug}`} className="font-medium text-orange">
                ← {previous.title}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/help/guide/${next.slug}`} className="font-medium text-orange">
                {next.title} →
              </Link>
            ) : (
              <Link href="/help/support" className="font-medium text-orange">
                Still stuck? Contact support →
              </Link>
            )}
          </nav>
        </article>
      </div>
    </div>
  );
}
