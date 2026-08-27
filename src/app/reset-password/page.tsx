import Link from "next/link";
import { prisma } from "@/lib/db";
import { hashResetToken, resetTokenUsable } from "@/lib/password-reset";
import { LogoMark } from "@/components/logo";
import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";
  const row = token
    ? await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashResetToken(token) },
        select: { expiresAt: true, usedAt: true, user: { select: { email: true, active: true } } },
      })
    : null;
  const valid = Boolean(row && resetTokenUsable(row) && row.user.active);

  return (
    <main className="min-h-screen bg-paper px-6 py-16">
      <div className="mx-auto max-w-md">
        <div className="card">
          <p className="eyebrow">Password reset</p>
          <h1 className="mt-2 flex items-center gap-3 text-[26px] leading-8">
            <LogoMark className="h-7 w-7" />
            {valid ? "Choose a new password" : "This link no longer works"}
          </h1>
          {valid && row ? (
            <>
              <p className="mt-2 text-[14px] text-slate">Resetting the password for {row.user.email}.</p>
              <ResetForm token={token} />
            </>
          ) : (
            <>
              <p className="mt-2 text-[14px] text-slate">
                Reset links work once and expire after an hour. Request a fresh one and use the newest
                email.
              </p>
              <Link href="/forgot-password" className="btn-primary mt-6 inline-block">
                Request a new link
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
