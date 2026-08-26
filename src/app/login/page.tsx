import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/calculator");

  return (
    <main className="flex min-h-screen">
      <section className="hidden flex-1 flex-col justify-between bg-navy p-12 text-white lg:flex">
        <p className="font-display text-[20px] font-bold uppercase tracking-eyebrow">Agreement Calculator</p>
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
          <h2 className="mt-2 text-[30px] leading-9">Agreement Calculator</h2>
          <p className="mt-2 text-slate">Accounts are provisioned by your workspace administrator.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
