import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requestContext, type SessionUser } from "@/lib/auth";

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_DEACTIVATED"
  | "PASSWORD_CHANGED"
  | "WELCOME_EMAIL_RESENT"
  | "VERSION_DRAFT_CREATED"
  | "VERSION_UPDATED"
  | "VERSION_PUBLISHED"
  | "VERSION_ARCHIVED"
  | "VERSION_DELETED"
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
  | "PDF_EXPORT_BLOCKED";

interface AuditInput {
  action: AuditAction;
  summary: string;
  entity?: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  actor?: SessionUser | null;
  actorEmail?: string;
}

/**
 * Appends an immutable audit event. Never throws into the caller's path — an
 * audit write failure must not silently break the action, but it also must not
 * take the request down; it is logged instead.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const ctx = await requestContext();
    await prisma.auditEvent.create({
      data: {
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
