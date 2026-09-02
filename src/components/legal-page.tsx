import { LEGAL_UPDATED, legalUpdatedLabel } from "@/lib/legal";
import { MarketingFooter, MarketingHeader } from "@/components/marketing-chrome";

/** A paragraph, or a bulleted list of points. */
export type LegalBlock = string | string[];

export interface LegalSection {
  heading: string;
  body: LegalBlock[];
}

/**
 * The shared shape of the privacy policy and the terms: same chrome, same
 * measure, same "last updated" line, so the two documents read as one set
 * rather than two pages that happen to be legal text.
 */
export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-paper">
      <MarketingHeader />

      <main className="mx-auto max-w-content px-6 py-12 md:px-10">
        <div className="max-w-[720px]">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-[36px] leading-10">{title}</h1>
          <p className="mt-3 text-[17px] text-slate">{intro}</p>
          <p className="mt-2 text-[13px] text-slate">
            Last updated <time dateTime={LEGAL_UPDATED}>{legalUpdatedLabel()}</time>
          </p>

          <div className="card mt-8 space-y-8">
            {sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-display text-[19px] font-bold text-navy">{section.heading}</h2>
                {section.body.map((block, index) =>
                  Array.isArray(block) ? (
                    <ul key={index} className="mt-3 space-y-2 text-[15px] text-slate">
                      {block.map((point) => (
                        <li key={point} className="border-l-2 border-orange pl-4">
                          {point}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p key={index} className="mt-3 text-[15px] leading-6 text-slate">
                      {block}
                    </p>
                  ),
                )}
              </section>
            ))}
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
