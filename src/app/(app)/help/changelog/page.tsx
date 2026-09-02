import Link from "next/link";
import { requireTenant } from "@/lib/auth";
import { loadChangelog } from "@/lib/changelog";
import { APP_VERSION_STAMP } from "@/lib/version";

export const dynamic = "force-dynamic";

export default async function ChangelogPage() {
  await requireTenant();
  const releases = await loadChangelog();

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Help</p>
        <h1 className="mt-2 text-[32px] leading-9">What&apos;s new</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Recent changes to Agreement Calculator, newest first. You are on {APP_VERSION_STAMP}. Missing
          something?{" "}
          <Link href="/help/support" className="font-medium text-orange">
            Ask for it
          </Link>
          .
        </p>
      </header>

      <div className="space-y-4">
        {releases.map((release) => (
          <section key={release.title} className="card space-y-4">
            <h2 className="font-display text-[20px] text-navy">{release.title}</h2>
            {release.sections.map((section, index) => (
              <div key={`${release.title}-${section.heading}-${index}`}>
                {section.heading ? (
                  <p className="font-display text-[11px] font-bold uppercase tracking-eyebrow text-slate">
                    {section.heading}
                  </p>
                ) : null}
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-ink">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
