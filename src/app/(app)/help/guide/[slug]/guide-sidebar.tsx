import Link from "next/link";
import clsx from "clsx";
import type { GuideTopicMeta } from "@/lib/guide";

export function GuideSidebar({
  topics,
  current,
  headings,
}: {
  topics: GuideTopicMeta[];
  current: string;
  headings: { id: string; text: string }[];
}) {
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <nav aria-label="Guide topics" className="card p-4">
        <p className="font-display text-[11px] font-bold uppercase tracking-eyebrow text-slate">Topics</p>
        <ol className="mt-3 space-y-0.5 text-[14px]">
          {topics.map((topic, index) => {
            const active = topic.slug === current;
            return (
              <li key={topic.slug}>
                <Link
                  href={`/help/guide/${topic.slug}`}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex gap-2 rounded-brand px-2 py-1.5 transition",
                    active ? "bg-orange/10 font-semibold text-navy" : "text-slate hover:bg-paper hover:text-navy",
                  )}
                >
                  <span className="w-5 shrink-0 tabular-nums text-slate">{index + 1}.</span>
                  <span>{topic.title}</span>
                </Link>
                {active && headings.length > 1 ? (
                  <ul className="mb-2 ml-9 mt-1 space-y-0.5 border-l border-mist pl-3 text-[13px]">
                    {headings.map((heading) => (
                      <li key={heading.id}>
                        <a href={`#${heading.id}`} className="block py-0.5 text-slate hover:text-navy">
                          {heading.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}
