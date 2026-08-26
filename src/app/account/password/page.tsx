import Image from "next/image";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await requireUser();
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mustReset: true },
  });

  return (
    <div className="min-h-screen bg-paper px-6 py-16">
      <div className="mx-auto max-w-md">
        <Image src="/infinit-logo.png" alt="infinIT" width={112} height={77} priority />
        <div className="card mt-8">
          <p className="eyebrow">{account?.mustReset ? "First sign-in" : "Your account"}</p>
          <h1 className="mt-2 text-[26px] leading-8">Change your password</h1>
          <p className="mt-2 text-[14px] text-slate">
            {account?.mustReset
              ? "This account was created with a temporary password. Choose your own to continue."
              : `Signed in as ${user.email}.`}
          </p>
          <PasswordForm forced={Boolean(account?.mustReset)} />
        </div>
      </div>
    </div>
  );
}
