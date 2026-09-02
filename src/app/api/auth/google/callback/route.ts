import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { completeSignIn } from "@/lib/sign-in";
import {
  GOOGLE_HANDSHAKE_COOKIE,
  domainAllowed,
  exchangeCode,
  googleConfig,
  openHandshake,
  statesMatch,
} from "@/lib/google";

/** Why sign-in stopped. Turned into a sentence by the login page. */
type Failure = "off" | "denied" | "failed" | "domain" | "nouser";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const store = await cookies();
  const handshakeCookie = store.get(GOOGLE_HANDSHAKE_COOKIE)?.value;
  store.delete({ name: GOOGLE_HANDSHAKE_COOKIE, path: "/api/auth/google" });

  // The session cookie is host-only, so everything after this stays on the
  // hostname Google was told to come back to.
  const origin = request.nextUrl.origin;
  const back = (reason: Failure) => NextResponse.redirect(new URL(`/login?google=${reason}`, origin));

  const config = googleConfig();
  if (!config) return back("off");

  const params = request.nextUrl.searchParams;
  // The person cancelled at Google's screen, or Google refused the request.
  if (params.get("error")) return back(params.get("error") === "access_denied" ? "denied" : "failed");

  const code = params.get("code");
  const state = params.get("state");
  const handshake = handshakeCookie ? await openHandshake(handshakeCookie) : null;
  if (!code || !state || !handshake || !statesMatch(state, handshake.state)) return back("failed");

  const identity = await exchangeCode(config, code, handshake);
  if (!identity) return back("failed");

  if (!domainAllowed(identity.email)) {
    await audit({
      action: "LOGIN_FAILED",
      summary: `Google sign-in refused for ${identity.email} — domain not allowed`,
      actorEmail: identity.email,
    });
    return back("domain");
  }

  // Google's account id is the identity that lasts; the address is how an
  // account that has never used Google before is recognised the first time.
  const bySub = await prisma.user.findUnique({ where: { googleSub: identity.sub } });
  const user = bySub ?? (await prisma.user.findUnique({ where: { email: identity.email } }));

  // Accounts are provisioned by an administrator or by signing a workspace up,
  // so Google is a way in to an existing account, never a way to create one.
  // A deactivated account is turned away with the same message as an unknown
  // one, matching how password sign-in refuses to say which it was.
  if (!user || !user.active) {
    await audit({
      action: "LOGIN_FAILED",
      summary: `Google sign-in for ${identity.email} has no usable account`,
      actorEmail: identity.email,
    });
    return back("nouser");
  }

  // An account already tied to a different Google account is not signed in to:
  // whoever is at the keyboard has not proved they hold the linked one.
  if (user.googleSub && user.googleSub !== identity.sub) {
    await audit({
      action: "LOGIN_FAILED",
      summary: `Google sign-in for ${identity.email} presented an unrecognised Google account`,
      actorEmail: identity.email,
    });
    return back("failed");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      googleSub: identity.sub,
      // A temporary password is beside the point once Google vouches for the
      // person, so the forced change at first sign-in is satisfied here.
      mustReset: false,
    },
  });

  const account = {
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
  };
  const destination = await completeSignIn(account, "google");
  return NextResponse.redirect(new URL(destination, origin));
}
