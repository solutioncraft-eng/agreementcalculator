import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { FAQ, PRODUCT_NAME, landingJsonLd } from "@/lib/seo";
import { slugFromHost } from "@/lib/tenant";
import { PRICE_PER_MONTH, TRIAL_DAYS } from "@/lib/trial";
import { LogoMark } from "@/components/logo";
import { MarketingFooter, MarketingHeader } from "@/components/marketing-chrome";

export const dynamic = "force-dynamic";

const TITLE = "MSP agreement pricing software · Agreement Calculator";
const DESCRIPTION = `Price managed services agreements from your own COGS and margin policy: published pricing versions, per-user floors, leadership approval on off-policy pricing, and stamped PDF quotes. $${PRICE_PER_MONTH} a month per company, ${TRIAL_DAYS}-day free trial.`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "MSP agreement pricing",
    "managed services quoting software",
    "MSP pricing calculator",
    "managed services margin",
    "per-user pricing model",
    "MSP quote approval",
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  // A page's `openGraph` replaces the layout's rather than merging into it, so
  // the site-level fields are repeated here.
  openGraph: {
    type: "website",
    siteName: PRODUCT_NAME,
    locale: "en_US",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const PROBLEM = [
  [
    "Every quote is its own spreadsheet",
    "A copy of last quarter's file, a few numbers changed, a tab nobody else understands. Two account managers price the same deal differently and both are defensible.",
  ],
  [
    "Margin leaks where nobody is looking",
    "A tool cost went up in March, the sheet still says January. The discount to win the deal quietly landed under cost. You find out at renewal.",
  ],
  [
    "The price cannot be reconstructed",
    "Twelve months later, nobody can say which costs, which margin or whose approval produced the number the client signed.",
  ],
];

const PLAN = [
  [
    "Load your costs and your policy",
    "Your COGS catalogue — licences, tools, labour — with the margin, per-user floor and discount limits you are willing to sell at.",
  ],
  [
    "Publish a pricing version",
    "Publishing freezes it. Every quote pins the version it was priced with, so the numbers behind any agreement stay reproducible.",
  ],
  [
    "Your team quotes inside the guardrails",
    "Account managers price in seconds, anything off-policy goes to a leader for approval, and the approved PDF is stamped and logged.",
  ],
];

export default async function Home() {
  // A workspace hostname is for the workspace, not the marketing site.
  if (await slugFromHost()) redirect("/login");
  if (await getCurrentUser()) redirect("/calculator");

  return (
    <div className="min-h-screen bg-paper">
      <MarketingHeader />

      <main>
        <section className="bg-navy">
          <div className="mx-auto max-w-content px-6 py-20 md:px-10 md:py-28">
            <p className="eyebrow flex items-center gap-3">
              {/* Single-colour on the navy hero: the primary lockup's navy quadrant would vanish. */}
              <LogoMark variant="current" className="h-5 w-5" />
              Agreement pricing for MSPs
            </p>
            <h1 className="mt-4 max-w-3xl text-[44px] leading-[48px] text-white md:text-[56px] md:leading-[60px]">
              Price every agreement the same way, and prove the margin
            </h1>
            <p className="mt-6 max-w-2xl text-[19px] text-mist">
              Your costs, your margin policy, your tiers — with leadership approval on anything that leaves
              them, and a stamped PDF that shows exactly how the number was produced.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link href="/signup" className="btn-primary">
                Start your {TRIAL_DAYS}-day free trial
              </Link>
              <Link href="#how" className="font-display text-[15px] font-bold text-mist hover:text-white">
                See how it works →
              </Link>
            </div>
            <p className="mt-4 font-mono text-[12px] uppercase tracking-eyebrow text-slate">
              ${PRICE_PER_MONTH}/month per company · unlimited users · no card required
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-content px-6 py-20 md:px-10">
          <p className="eyebrow">The problem</p>
          <h2 className="mt-3 max-w-2xl text-[32px] leading-9">
            You are the only one who can price a deal properly — and you shouldn&apos;t be
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PROBLEM.map(([title, body]) => (
              <div key={title} className="card">
                <h3 className="text-[18px] leading-6">{title}</h3>
                <p className="mt-2 text-slate">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 max-w-2xl text-[19px] text-ink">
            None of that is a discipline problem. It is a tooling problem — and you should not have to guess
            whether the deal you just won makes money.
          </p>
        </section>

        <section className="border-y border-mist bg-white">
          <div className="mx-auto grid max-w-content gap-10 px-6 py-20 md:grid-cols-2 md:px-10">
            <div>
              <p className="eyebrow">Who we are</p>
              <h2 className="mt-3 text-[32px] leading-9">
                Twenty-five years in managed services, building the tool we wish we&apos;d had
              </h2>
            </div>
            <div className="space-y-4 text-[17px] text-slate">
              <p>
                We have priced these agreements, been the bottleneck for them, and been surprised by them at
                renewal. We know what a quote looks like when it is really a favour to a salesperson, and what
                it costs eighteen months later.
              </p>
              <p>
                So the rules here are the ones we needed: costs in one place, a published version behind every
                quote, approval where the money actually moves, and a document you can hand to a client or an
                auditor without qualification.
              </p>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-content px-6 py-20 md:px-10">
          <p className="eyebrow">The plan</p>
          <h2 className="mt-3 text-[32px] leading-9">Three steps to consistent pricing</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {PLAN.map(([title, body], index) => (
              <li key={title} className="card">
                <p className="stat text-[28px]">{index + 1}</p>
                <h3 className="mt-2 text-[18px] leading-6">{title}</h3>
                <p className="mt-2 text-slate">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-mist bg-white">
          <div className="mx-auto grid max-w-content gap-6 px-6 py-20 md:grid-cols-2 md:px-10">
            <div className="card border-mist">
              <p className="eyebrow">Do nothing</p>
              <h3 className="mt-3 text-[24px] leading-7">Pricing stays inconsistent, and yours alone</h3>
              <ul className="mt-4 space-y-2 text-slate">
                <li>Every bespoke agreement waits on the owner.</li>
                <li>Two customers of the same size pay different prices for the same reason: who quoted it.</li>
                <li>Margin problems surface at renewal, when they are expensive to fix.</li>
              </ul>
            </div>
            <div className="card border-navy bg-navy text-mist">
              <p className="eyebrow">Use the calculator</p>
              <h3 className="mt-3 text-[24px] leading-7 text-white">
                Anyone can quote, and every quote is defensible
              </h3>
              <ul className="mt-4 space-y-2">
                <li>Account managers price a deal in seconds without asking you.</li>
                <li>Off-policy pricing needs a decision, not a guess — and the decision is recorded.</li>
                <li>Any signed agreement can be traced to the costs and approval behind it.</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-content px-6 py-20 md:px-10">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <p className="eyebrow">Pricing</p>
              <h2 className="mt-3 text-[32px] leading-9">One price, whole company</h2>
              <p className="mt-4 text-[17px] text-slate">
                No per-seat maths on a tool whose whole job is per-seat maths. Add every account manager and
                every leader who should be in it.
              </p>
            </div>
            <div className="card">
              <p className="stat text-[48px] leading-none">${PRICE_PER_MONTH}</p>
              <p className="mt-1 font-display text-[13px] font-bold uppercase tracking-eyebrow text-slate">
                per month, per company
              </p>
              <ul className="mt-6 space-y-2 text-[15px] text-slate">
                <li>Unlimited users, all three roles</li>
                <li>Your COGS catalogue, pricing versions and audit log</li>
                <li>Approval workflow and stamped PDF exports</li>
                <li>Your logo, accent colour and tier names on the documents</li>
              </ul>
              <Link href="/signup" className="btn-primary mt-6 w-full">
                Start free trial
              </Link>
              <p className="mt-3 text-[12px] text-slate">
                {TRIAL_DAYS} days free. No card required — the trial simply stops if you do nothing.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className="border-y border-mist bg-white">
          <div className="mx-auto max-w-content px-6 py-20 md:px-10">
            <p className="eyebrow">Questions</p>
            <h2 className="mt-3 text-[32px] leading-9">What owners ask before they move off the spreadsheet</h2>
            <dl className="mt-10 grid gap-6 md:grid-cols-2">
              {FAQ.map((entry) => (
                <div key={entry.question} className="card">
                  <dt className="font-display text-[18px] font-bold leading-6 text-navy">{entry.question}</dt>
                  <dd className="mt-2 text-slate">{entry.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="bg-navy">
          <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-6 px-6 py-16 md:px-10">
            <div>
              <h2 className="max-w-xl text-[30px] leading-9 text-white">
                Price your next agreement with numbers you can stand behind
              </h2>
              <p className="mt-2 text-mist">
                Set up your workspace in a few minutes. Nothing is quotable until you publish your own pricing.
              </p>
            </div>
            <Link href="/signup" className="btn-primary">
              Start your {TRIAL_DAYS}-day free trial
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: landingJsonLd() }} />
    </div>
  );
}
