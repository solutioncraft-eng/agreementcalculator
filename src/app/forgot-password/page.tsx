import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LogoMark } from "@/components/logo";
import { ForgotForm } from "./forgot-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  if (await getCurrentUser()) redirect("/account/password");

  return (
    <main className="min-h-screen bg-paper px-6 py-16">
      <div className="mx-auto max-w-md">
        <div className="card">
          <p className="eyebrow">Password help</p>
          <h1 className="mt-2 flex items-center gap-3 text-[26px] leading-8">
            <LogoMark className="h-7 w-7" />
            Reset your password
          </h1>
          <p className="mt-2 text-[14px] text-slate">
            Enter the email you sign in with and we&apos;ll send you a one-time link to choose a new
            password.
          </p>
          <ForgotForm />
        </div>
      </div>
    </main>
  );
}
