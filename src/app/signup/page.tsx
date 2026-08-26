import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PRICING_MODELS } from "@/lib/pricing/models";
import { rootDomain, slugFromHost } from "@/lib/tenant";
import { PRICE_PER_MONTH, TRIAL_DAYS } from "@/lib/trial";
import { MarketingHeader } from "@/components/marketing-chrome";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Start a ${TRIAL_DAYS}-day trial · Agreement Calculator`,
  description: `Price managed services agreements with your own costs and margin policy. $${PRICE_PER_MONTH} a month per company, ${TRIAL_DAYS}-day free trial, no card required.`,
  robots: { index: true, follow: true },
};

export default async function SignupPage() {
  // A workspace hostname belongs to a workspace that already exists; signing up
  // is something you do on the product's own hostname.
  if (await slugFromHost()) redirect("/login");
  if (await getCurrentUser()) redirect("/calculator");

  const models = Object.entries(PRICING_MODELS).map(([key, model]) => ({
    key,
    label: model.label,
    summary: model.summary,
  }));

  return (
    <div className="min-h-screen bg-paper">
      <MarketingHeader cta={false} />

      <main className="mx-auto grid max-w-content gap-10 px-6 py-12 md:px-10 lg:grid-cols-[1fr_460px]">
        <section className="max-w-xl">
          <p className="eyebrow">Free for {TRIAL_DAYS} days</p>
          <h1 className="mt-2 text-[36px] leading-10">Set up your workspace</h1>
          <p className="mt-3 text-[17px] text-slate">
            You are the administrator. Load your costs, set your margin policy, publish a pricing version —
            then your account managers quote inside it.
          </p>

          <ul className="mt-8 space-y-4 text-[15px]">
            {[
              [
                "Your numbers, not ours",
                "The reference COGS catalogue is copied in as a starting point. Edit every line — nothing is published until you say so.",
              ],
              [
                "Nobody can quote off-policy quietly",
                "A quote that leaves your margin, floor or discount policy is flagged, and cannot be exported until a leader approves it.",
              ],
              [
                "Every PDF is traceable",
                "Export id, timestamp, who exported it, and the exact pricing version are stamped on the document and recorded in your audit log.",
              ],
              [
                `$${PRICE_PER_MONTH} a month, per company`,
                "Unlimited users. No card for the trial; if it is not for you, do nothing and it stops.",
              ],
            ].map(([title, body]) => (
              <li key={title} className="border-l-2 border-orange pl-4">
                <p className="font-display text-[15px] font-bold text-navy">{title}</p>
                <p className="mt-1 text-slate">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="card h-fit">
          <SignupForm models={models} rootDomain={rootDomain()} />
          <p className="mt-5 border-t border-mist pt-4 text-[13px] text-slate">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-orange">
              Sign in
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
