import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { googleEnabled, googleStartUrl } from "@/lib/google";
import { slugFromHost } from "@/lib/tenant";
import { TRIAL_DAYS } from "@/lib/trial";
import { Logo, LogoMark } from "@/components/logo";
import { LoginForm } from "./login-form";

/** What went wrong on the way back from Google, in the person's own terms. */
const GOOGLE_PROBLEMS: Record<string, string | undefined> = {
  off: "Google sign-in is not switched on for this deployment.",
  denied: "Google sign-in was cancelled.",
  failed: "Google sign-in could not be completed. Try again, or use your password.",
  domain: "That Google account is not on an email domain allowed to sign in here.",
  nouser: "That account has been deactivated. Ask your workspace administrator to restore it.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; google?: string }>;
}) {
  if (await getCurrentUser()) redirect("/calculator");
  const params = await searchParams;
  const justReset = params.reset === "1";
  const googleProblem = GOOGLE_PROBLEMS[params.google ?? ""];
  // Signing up creates a workspace, so it is offered on the product's own
  // hostname only — a workspace subdomain already belongs to one.
  const onWorkspaceHost = Boolean(await slugFromHost());

  return (
    <main className="flex min-h-screen">
      <section className="hidden flex-1 flex-col justify-between bg-navy p-12 text-white lg:flex">
        <Logo
          variant="current"
          markClassName="h-7 w-7"
          wordmarkClassName="text-white text-[20px] uppercase tracking-eyebrow"
        />
        <div>
          <p className="eyebrow">Managed services pricing</p>
          <h1 className="mt-3 max-w-md text-[40px] leading-[44px] text-white">
            Price an agreement, prove the margin
          </h1>
          <p className="mt-4 max-w-md text-[17px] text-mist">
            Your COGS, your pricing model, your tiers — with leadership review on anything that falls
            outside standard pricing.
          </p>
        </div>
        <p className="font-mono text-[12px] text-slate">agreementcalculator.com</p>
      </section>

      <section className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-[380px]">
          <p className="eyebrow">Sign in</p>
          <h2 className="mt-2 flex items-center gap-3 text-[30px] leading-9">
            <LogoMark className="h-8 w-8" />
            Agreement Calculator
          </h2>
          <p className="mt-2 text-slate">Accounts are provisioned by your workspace administrator.</p>
          {justReset ? (
            <p role="status" className="mt-4 rounded-brand bg-navy/5 px-3 py-2 text-[13px] text-navy">
              Your password has been updated. Sign in with it now.
            </p>
          ) : null}
          {googleProblem ? (
            <p role="alert" className="mt-4 rounded-brand bg-orange/10 px-3 py-2 text-[13px] font-medium text-orange-dark">
              {googleProblem}
            </p>
          ) : null}
          <LoginForm googleStartUrl={googleEnabled() ? googleStartUrl() : undefined} />
          {onWorkspaceHost ? null : (
            <p className="mt-6 border-t border-mist pt-4 text-[13px] text-slate">
              No workspace yet?{" "}
              <Link href="/signup" className="font-medium text-orange">
                Start a {TRIAL_DAYS}-day free trial
              </Link>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
