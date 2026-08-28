import Link from "next/link";
import { Logo, LogoMark } from "@/components/logo";
import { PRICE_PER_MONTH, TRIAL_DAYS } from "@/lib/trial";

/** Header and footer shared by the landing page and the signup form. */
export function MarketingHeader({ cta = true }: { cta?: boolean }) {
  return (
    <header className="border-b border-mist bg-white">
      <div className="mx-auto flex max-w-content items-center justify-between gap-6 px-6 py-4 md:px-10">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="flex items-center gap-6 text-[14px]">
          <Link href="#how" className="hidden text-slate hover:text-navy sm:block">
            How it works
          </Link>
          <Link href="#pricing" className="hidden text-slate hover:text-navy sm:block">
            Pricing
          </Link>
          <Link href="/#faq" className="hidden text-slate hover:text-navy md:block">
            FAQ
          </Link>
          <Link href="/login" className="font-medium text-navy hover:text-orange">
            Sign in
          </Link>
          {cta ? (
            <Link href="/signup" className="btn-primary btn-sm">
              Start free trial
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-mist bg-white">
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-6 py-8 text-[13px] text-slate md:px-10">
        <p className="flex items-center gap-2">
          <LogoMark variant="navy" className="h-4 w-4" />
          Agreement Calculator · ${PRICE_PER_MONTH}/month per company · {TRIAL_DAYS}-day free trial, no card
          required
        </p>
        <p className="font-mono text-[12px]">agreementcalculator.com</p>
      </div>
    </footer>
  );
}
