-- A comped workspace is not a paying one, so it gets its own status rather than
-- borrowing ACTIVE. Adding an enum value cannot run inside an implicit
-- transaction block on older PostgreSQL, but Prisma runs each statement
-- separately, so ALTER TYPE ... ADD VALUE is safe here.
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'COMPLIMENTARY';

-- Why the comp was granted and when it lapses. Columns on an existing table, so
-- the revoke of anon/authenticated privileges on "Tenant" still covers them.
ALTER TABLE "Tenant" ADD COLUMN "compReason" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "compExpiresAt" TIMESTAMP(3);
