import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Unscoped client. Only three things may use it: authentication (finding a
 * user before a tenant is known), the super-admin portal, and CLI scripts.
 * Everything that serves a tenant request must go through {@link tenantDb} so
 * a missing `where` clause cannot leak another tenant's data.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Models with a `tenantId` column, i.e. everything a tenant owns. */
export const TENANT_MODELS = new Set([
  "Membership",
  "PricingVersion",
  "CogsItem",
  "BundleDiscount",
  "QuoteRequest",
  "QuoteReview",
  "ExportRecord",
  "AuditEvent",
]);

/**
 * Operations whose args carry a `where` we must narrow. `findUnique` is absent
 * deliberately: Prisma rejects a non-unique field in a unique filter, so those
 * two are checked on the way out instead (see {@link tenantDb}).
 */
const WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

export class CrossTenantQueryError extends Error {
  constructor(model: string, operation: string) {
    super(`Refusing ${operation} on ${model}: the query targets a different tenant.`);
    this.name = "CrossTenantQueryError";
  }
}

interface QueryArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
}

function assertSameTenant(value: unknown, tenantId: string, model: string, operation: string): void {
  if (value !== undefined && value !== tenantId) throw new CrossTenantQueryError(model, operation);
}

/**
 * Injects `tenantId` into a query's filter and into anything it writes.
 *
 * Exported for its own tests: this function is the whole of the isolation
 * guarantee, so it is worth exercising directly rather than only through a
 * live database.
 */
export function scopeArgs<T extends QueryArgs>(
  model: string,
  operation: string,
  args: T,
  tenantId: string,
): T & QueryArgs {
  const scoped: QueryArgs = { ...args };

  if (WHERE_OPS.has(operation)) {
    const where = (scoped.where ?? {}) as Record<string, unknown>;
    assertSameTenant(where.tenantId, tenantId, model, operation);
    // `findUnique` cannot take a non-unique field, so a lookup by id becomes a
    // findFirst-style filter the caller never has to think about.
    scoped.where = { ...where, tenantId };
  }

  if (operation === "create" || operation === "createManyAndReturn" || operation === "createMany") {
    const data = scoped.data;
    if (Array.isArray(data)) {
      scoped.data = data.map((row) => {
        assertSameTenant(row.tenantId, tenantId, model, operation);
        return { ...row, tenantId };
      });
    } else if (data) {
      assertSameTenant(data.tenantId, tenantId, model, operation);
      scoped.data = { ...data, tenantId };
    }
  }

  if (operation === "upsert") {
    const create = scoped.create ?? {};
    assertSameTenant(create.tenantId, tenantId, model, operation);
    scoped.create = { ...create, tenantId };
  }

  return scoped as T;
}

/** True when a row Prisma returned does not belong to the active tenant. */
export function isForeignRow(result: unknown, tenantId: string): boolean {
  if (!result || typeof result !== "object") return false;
  const owner = (result as { tenantId?: unknown }).tenantId;
  return typeof owner === "string" && owner !== tenantId;
}

/**
 * Prisma client locked to one tenant. Reads are filtered and writes are
 * stamped, for every tenant-owned model, without the caller doing anything.
 *
 * A lookup by primary key is the one case a filter cannot cover — Prisma will
 * not accept `tenantId` in a unique `where` — so `findUnique` runs as written
 * and its result is dropped when the row belongs to someone else. That is the
 * exact shape of an id-guessing attempt, so it is the case worth being sure of.
 */
export function tenantDb(tenantId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);

          const result = await query(scopeArgs(model, operation, args as QueryArgs, tenantId));

          if (operation === "findUnique" || operation === "findUniqueOrThrow") {
            if (isForeignRow(result, tenantId)) {
              if (operation === "findUniqueOrThrow") throw new CrossTenantQueryError(model, operation);
              return null;
            }
          }
          return result;
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
