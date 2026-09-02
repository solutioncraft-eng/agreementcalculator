import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Google sign-in, spoken directly rather than through an auth library: the
 * product already owns its own sessions (see src/lib/auth.ts), and Google is
 * only ever asked one question — which verified email address is at the
 * keyboard. Everything after that is this app's own account lookup.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Lives only between the redirect out and the redirect back. */
const HANDSHAKE_COOKIE = "ac_oauth";
const HANDSHAKE_TTL_SECONDS = 10 * 60;

/**
 * Carries the Google identity from the callback into the signup form, for
 * somebody Google vouches for who has no account here yet. Signed rather than
 * held in a URL or a form field: the workspace it creates is administered by
 * whichever address this says, so the form cannot be allowed to change it.
 */
const SIGNUP_COOKIE = "ac_google_signup";
const SIGNUP_TTL_SECONDS = 30 * 60;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** Must match a redirect URI registered on the Google client, exactly. */
  redirectUri: string;
}

/**
 * The callback lands on the product's own hostname even when sign-in started
 * on a workspace subdomain: Google matches redirect URIs literally, and a URI
 * per workspace is not a thing that can be registered ahead of time.
 */
export function googleRedirectUri(): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return new URL("/api/auth/google/callback", base).toString();
}

/**
 * Where the "Continue with Google" button points. Absolute and on the product's
 * own hostname, because that is where the single registered callback lands and
 * therefore where the session cookie can be set — a workspace subdomain sends
 * people through the product host and back to the workspace their session
 * selects.
 */
export function googleStartUrl(): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return new URL("/api/auth/google/start", base).toString();
}

/** Null when the credentials are unset, which leaves Google sign-in hidden. */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: googleRedirectUri() };
}

export function googleEnabled(): boolean {
  return googleConfig() !== null;
}

/**
 * Workspaces whose people may use Google, as email domains. Unset means any
 * Google account with a verified address that already has an account here.
 */
export function allowedGoogleDomains(): string[] {
  return (process.env.GOOGLE_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function domainAllowed(email: string, domains = allowedGoogleDomains()): boolean {
  if (domains.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return Boolean(domain && domains.includes(domain));
}

export interface Handshake {
  state: string;
  /** PKCE verifier, so an intercepted code cannot be redeemed elsewhere. */
  verifier: string;
  nonce: string;
}

export function newHandshake(): Handshake {
  return {
    state: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    nonce: randomBytes(16).toString("base64url"),
  };
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function authorizationUrl(config: GoogleConfig, handshake: Handshake): string {
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: handshake.state,
    nonce: handshake.nonce,
    code_challenge: codeChallenge(handshake.verifier),
    code_challenge_method: "S256",
    // Always ask which account, rather than silently reusing whichever one the
    // browser happens to be signed in to.
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export function statesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const GOOGLE_HANDSHAKE_COOKIE = HANDSHAKE_COOKIE;
export const GOOGLE_HANDSHAKE_TTL_SECONDS = HANDSHAKE_TTL_SECONDS;
export const GOOGLE_SIGNUP_COOKIE = SIGNUP_COOKIE;
export const GOOGLE_SIGNUP_TTL_SECONDS = SIGNUP_TTL_SECONDS;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET must be set to a random string of at least 32 characters");
  }
  return new TextEncoder().encode(value);
}

/** The handshake travels back as a signed, http-only cookie, not in the URL. */
export async function sealHandshake(handshake: Handshake): Promise<string> {
  return new SignJWT({ ...handshake })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${HANDSHAKE_TTL_SECONDS}s`)
    .sign(secret());
}

export async function openHandshake(token: string): Promise<Handshake | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const { state, verifier, nonce } = payload;
    if (typeof state !== "string" || typeof verifier !== "string" || typeof nonce !== "string") {
      return null;
    }
    return { state, verifier, nonce };
  } catch {
    return null;
  }
}

/**
 * The Google identity behind an unfinished signup, sealed for the form. `use`
 * keeps it from being presented as the handshake token, which the same key
 * signs.
 */
export async function sealSignup(identity: GoogleIdentity): Promise<string> {
  return new SignJWT({ use: "signup", sub: identity.sub, email: identity.email, name: identity.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SIGNUP_TTL_SECONDS}s`)
    .sign(secret());
}

export async function openSignup(token: string): Promise<GoogleIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const { use, sub, email, name } = payload;
    if (use !== "signup" || typeof sub !== "string" || typeof email !== "string") return null;
    return { sub, email, name: typeof name === "string" ? name : null };
  } catch {
    return null;
  }
}

export interface GoogleIdentity {
  /** Google's stable account id. Survives the person changing their address. */
  sub: string;
  email: string;
  name: string | null;
}

interface TokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

/**
 * Redeems the code and returns the identity Google vouches for.
 *
 * The id token is verified against Google's published keys — issuer, audience,
 * signature and nonce — so the only thing trusted here is a token this app
 * asked for. An unverified email is refused: it would otherwise be enough to
 * claim someone else's address on a Google Workspace-less account.
 */
export async function exchangeCode(
  config: GoogleConfig,
  code: string,
  handshake: Handshake,
): Promise<GoogleIdentity | null> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: handshake.verifier,
    }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as TokenResponse | null;
  if (!response.ok || !body?.id_token) return null;

  try {
    const { payload } = await jwtVerify(body.id_token, jwks, {
      issuer: ISSUERS,
      audience: config.clientId,
    });
    if (payload.nonce !== handshake.nonce) return null;
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    if (payload.email_verified !== true) return null;
    return {
      sub: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null,
    };
  } catch {
    return null;
  }
}
