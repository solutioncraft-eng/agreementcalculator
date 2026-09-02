import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  GOOGLE_HANDSHAKE_COOKIE,
  GOOGLE_HANDSHAKE_TTL_SECONDS,
  authorizationUrl,
  googleConfig,
  newHandshake,
  sealHandshake,
} from "@/lib/google";

/**
 * Starts Google sign-in. The state, PKCE verifier and nonce are kept in an
 * http-only cookie scoped to this route, so the callback can prove the response
 * belongs to a request this browser actually made.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = googleConfig();
  if (!config) return NextResponse.redirect(new URL("/login?google=off", request.nextUrl.origin));

  const handshake = newHandshake();
  const store = await cookies();
  store.set(GOOGLE_HANDSHAKE_COOKIE, await sealHandshake(handshake), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: GOOGLE_HANDSHAKE_TTL_SECONDS,
  });

  return NextResponse.redirect(authorizationUrl(config, handshake));
}
