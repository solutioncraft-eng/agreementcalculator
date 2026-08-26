import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/calculator");

  return (
    <main className="flex min-h-screen">
      <section className="hidden flex-1 flex-col justify-between bg-navy p-12 text-white lg:flex">
        <Image src="/infinit-logo.png" alt="infinIT" width={160} height={109} className="bg-white p-3" priority />
        <div>
          <p className="eyebrow">Internal tool</p>
          <h1 className="mt-3 max-w-md text-[40px] leading-[44px] text-white">Agreement Calculator</h1>
          <p className="mt-4 max-w-md text-[17px] text-mist">
            Managed services pricing for InfinIT Advantage and InfinIT Pinnacle, with leadership review on
            anything that falls outside standard pricing.
          </p>
        </div>
        <p className="font-mono text-[12px] text-slate">Cleveland · Warren, Ohio</p>
      </section>

      <section className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-[380px]">
          <Image src="/infinit-logo.png" alt="infinIT" width={120} height={82} className="mb-8 lg:hidden" />
          <p className="eyebrow">Sign in</p>
          <h2 className="mt-2 text-[30px] leading-9">Agreement Calculator</h2>
          <p className="mt-2 text-slate">Accounts are provisioned by an administrator.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
