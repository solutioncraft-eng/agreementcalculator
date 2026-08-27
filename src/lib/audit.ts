import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requestContext, type SessionAccount } from "@/lib/auth";

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_DEACTIVATED"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET"
  | "WELCOME_EMAIL_RESENT"
  | "VERSION_DRAFT_CREATED"
  | "VERSION_UPDATED"
  | "VERSION_PUBLISHED"
  | "VERSION_ARCHIVED"
  | "VERSION_DELETED"
  | "SERVICE_TIER_CREATED"
  | "SERVICE_TIER_UPDATED"
  | "SERVICE_TIER_DELETED"
  | "COGS_ITEM_CREATED"
  | "COGS_ITEM_UPDATED"
  | "COGS_ITEM_DELETED"
  | "BUNDLE_UPDATED"
  | "QUOTE_SUBMITTED"
  | "QUOTE_RESUBMITTED"
  | "QUOTE_APPROVED"
  | "QUOTE_CHANGES_REQUESTED"
  | "QUOTE_DENIED"
  | "QUOTE_WITHDRAWN"
  | "QUOTE_COMMENTED"
  | "QUOTE_PURGED"
  | "PDF_EXPORTED"
  | "PDF_EXPORT_BLOCKED"
  | "TENANT_CREATED"
  | "TENANT_UPDATED"
  | "TENANT_SUSPENDED"
  | "TENANT_REACTIVATED"
  | "TENANT_BRANDING_UPDATED"
  | "MEMBERSHIP_CREATED"
  | "MEMBERSHIP_UPDATED"
  | "MEMBERSHIP_REMOVED"
  | "WORKSPACE_SWITCHED";

interface AuditInput {
  action: AuditAction;
  summary: string;
  /**
   * Workspace the event belongs to. Left unset only for product-level events
   * — sign-ins before a workspace is chosen, and super-admin actions — which
   * is why the column is nullable.
   */
  tenantId?: string | null;
  entity?: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  actor?: SessionAccount | null;
  actorEmail?: string;
}

/**
 * Appends an immutable audit event. Never throws into the caller's path — an
 * audit write failure must not silently break the action, but it also must not
 * take the request down; it is logged instead.
 *
 * Writes through the unscoped client on purpose: an audit event is the one
 * thing that must be recordable before a workspace is known.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const ctx = await requestContext();
    await prisma.auditEvent.create({
      data: {
        tenantId: input.tenantId ?? null,
        action: input.action,
        summary: input.summary,
        entity: input.entity,
        entityId: input.entityId,
        before: input.before,
        after: input.after,
        actorId: input.actor?.id,
        actorEmail: input.actor?.email ?? input.actorEmail,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
  } catch (error) {
    console.error("audit write failed", input.action, error);
  }
}
