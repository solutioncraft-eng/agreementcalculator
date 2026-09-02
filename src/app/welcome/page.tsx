import Link from "next/link";
import { prisma } from "@/lib/db";
import { googleEnabled, googleStartUrl } from "@/lib/google";
import { hashResetToken, resetTokenUsable } from "@/lib/password-reset";
import { GoogleMark } from "@/components/google-mark";
import { LogoMark } from "@/components/logo";
import { ResetForm } from "../reset-password/reset-form";

export const dynamic = "force-dynamic";

/**
 * Where a welcome email lands. The link proves who the person is, so they can
 * pick how they will sign in from now on: continue with Google (the callback
 * links the Google account to theirs by email) or choose a password.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";
  const row = token
    ? await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashResetToken(token) },
        select: {
          expiresAt: true,
          usedAt: true,
          user: { select: { email: true, name: true, active: true } },
        },
      })
    : null;
  const valid = Boolean(row && resetTokenUsable(row) && row.user.active);
  const google = googleEnabled() ? googleStartUrl() : null;

  return (
    <main className="min-h-screen bg-paper px-6 py-16">
      <div className="mx-auto max-w-md">
        <div className="card">
          <p className="eyebrow">Welcome</p>
          <h1 className="mt-2 flex items-center gap-3 text-[26px] leading-8">
            <LogoMark className="h-7 w-7" />
            {valid ? "Set up your sign-in" : "This link no longer works"}
          </h1>
          {valid && row ? (
            <>
              <p className="mt-2 text-[14px] text-slate">
                Your account is {row.user.email}. Choose how you want to sign in from now on.
              </p>
              {google ? (
                <div className="mt-6">
                  <a href={google} className="btn-ghost w-full">
                    <GoogleMark />
                    Continue with Google
                  </a>
                  <p className="mt-2 text-[12px] text-slate">
                    Use the Google account for {row.user.email}. No password needed.
                  </p>
                  <div className="mt-6 flex items-center gap-3 text-[12px] uppercase tracking-eyebrow text-slate">
                    <span className="h-px flex-1 bg-mist" />
                    or set a password
                    <span className="h-px flex-1 bg-mist" />
                  </div>
                </div>
              ) : null}
              <ResetForm token={token} submitLabel="Set password and continue" />
            </>
          ) : (
            <>
              <p className="mt-2 text-[14px] text-slate">
                Welcome links work once and expire after a week. Ask your workspace administrator to
                resend it, or request a password link below.
              </p>
              <Link href="/forgot-password" className="btn-primary mt-6 inline-block">
                Request a password link
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
