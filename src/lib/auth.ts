import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role, Tenant } from "@prisma/client";
import { prisma, tenantDb, type TenantDb } from "@/lib/db";
import { slugFromHost } from "@/lib/tenant";
import { workspaceAccess } from "@/lib/billing";

const COOKIE = "ac_session";
const MAX_AGE_SECONDS = 60 * 60 * 10; // a working day

/**
 * An account is global and identified by email; a role is not. The signed
 * cookie therefore carries only the account and which workspace the person is
 * currently looking at — the role is re-read from that workspace's membership
 * on every request, so revoking access takes effect immediately and a stale
 * cookie can never carry a role the person no longer holds.
 */
export interface SessionAccount {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

export interface TenantSession {
  user: SessionAccount;
  tenant: Tenant;
  role: Role;
  /** Prisma locked to this tenant. Use it for every tenant-owned query. */
  db: TenantDb;
}

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET must be set to a random string of at least 32 characters");
  }
  return new TextEncoder().encode(value);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string, tenantId: string | null): Promise<void> {
  const token = await new SignJWT({ tid: tenantId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

interface RawSession {
  userId: string;
  tenantId: string | null;
}

async function readCookie(): Promise<RawSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return { userId: payload.sub, tenantId: typeof payload.tid === "string" ? payload.tid : null };
  } catch {
    return null;
  }
}

/** The signed-in account, or null. Says nothing about workspace access. */
export async function getCurrentUser(): Promise<SessionAccount | null> {
  const session = await readCookie();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, isSuperAdmin: true, active: true },
  });
  if (!user || !user.active) return null;
  return { id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin };
}

export async function requireUser(): Promise<SessionAccount> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export interface MembershipSummary {
  tenantId: string;
  slug: string;
  name: string;
  role: Role;
}

/** Workspaces the account can open, in display order. */
export async function membershipsFor(userId: string): Promise<MembershipSummary[]> {
  const rows = await prisma.membership.findMany({
    where: { userId, tenant: { status: { not: "SUSPENDED" } } },
    select: { tenantId: true, role: true, tenant: { select: { slug: true, name: true } } },
    orderBy: { tenant: { name: "asc" } },
  });
  return rows.map((m) => ({
    tenantId: m.tenantId,
    slug: m.tenant.slug,
    name: m.tenant.name,
    role: m.role,
  }));
}

/**
 * Resolves the workspace for this request.
 *
 * The hostname wins when the request arrives on a tenant subdomain, so a link
 * into `acme.agreementcalculator.com` always lands in Acme regardless of which
 * workspace the cookie last selected; otherwise the cookie decides. Either way
 * the membership is looked up before anything is served, so an account without
 * one gets nothing.
 */
export async function getTenantSession(): Promise<TenantSession | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const hostSlug = await slugFromHost();
  const session = await readCookie();

  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      tenant: hostSlug
        ? { slug: hostSlug, status: { not: "SUSPENDED" } }
        : { id: session?.tenantId ?? undefined, status: { not: "SUSPENDED" } },
    },
    include: { tenant: true },
  });
  if (!membership) return null;

  return {
    user,
    tenant: membership.tenant,
    role: membership.role,
    db: tenantDb(membership.tenantId),
  };
}

/**
 * Sends the caller somewhere sensible when they have no workspace open: the
 * picker if they belong to any, otherwise a dead end explaining as much.
 *
 * A workspace that has run out of trial, subscription or grace is stopped here
 * rather than in the layout, so a server action cannot keep working after the
 * pages stop being served. {@link getTenantSession} stays ungated on purpose —
 * the page that explains the lockout needs to read the workspace it is talking
 * about, and so does checkout.
 */
export async function requireTenant(): Promise<TenantSession> {
  const session = await getTenantSession();
  if (session) {
    if (!workspaceAccess(session.tenant).allowed) redirect("/trial-ended");
    return session;
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const memberships = await membershipsFor(user.id);
  redirect(memberships.length > 0 ? "/workspaces" : "/no-workspace");
}

export async function requireRole(...roles: Role[]): Promise<TenantSession> {
  const session = await requireTenant();
  if (!roles.includes(session.role)) redirect("/calculator?denied=1");
  return session;
}

/** The product-level portal. Deliberately separate from tenant sessions. */
export async function requireSuperAdmin(): Promise<SessionAccount> {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/calculator?denied=1");
  return user;
}

export function canReview(role: Role): boolean {
  return role === "LEADER" || role === "ADMIN";
}

export function canAdminister(role: Role): boolean {
  return role === "ADMIN";
}

/** Client IP and user agent, recorded on audit events. */
export async function requestContext(): Promise<{ ip?: string; userAgent?: string }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}
