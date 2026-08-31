-- Offerings gain a parent, and COGS membership becomes a set.
--
-- Until now the offerings of a version were a strict ladder: each one implicitly
-- built on the one below it, and a COGS item belonged to exactly one offering.
-- An offering now names the offering it builds on (or none, making it a
-- standalone offering priced as a base), and an item can be assigned to several
-- offerings, so two standalone offerings can both carry the same tool without a
-- duplicate cost row.
--
-- Existing versions are migrated to the equivalent chain — each offering's
-- parent is the offering below it, and each item keeps the single membership its
-- `tierKey` expressed — so published pricing reproduces unchanged.

-- AlterTable
ALTER TABLE "ServiceTier" ADD COLUMN "parentKey" TEXT;

UPDATE "ServiceTier" t
SET "parentKey" = (
    SELECT p."key"
    FROM "ServiceTier" p
    WHERE p."versionId" = t."versionId"
      AND p."sortOrder" < t."sortOrder"
    ORDER BY p."sortOrder" DESC
    LIMIT 1
);

-- CreateTable
CREATE TABLE "CogsItemTier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tierKey" TEXT NOT NULL,

    CONSTRAINT "CogsItemTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CogsItemTier_itemId_tierKey_key" ON "CogsItemTier"("itemId", "tierKey");
CREATE INDEX "CogsItemTier_tierKey_idx" ON "CogsItemTier"("tierKey");
CREATE INDEX "CogsItemTier_tenantId_idx" ON "CogsItemTier"("tenantId");

-- AddForeignKey
ALTER TABLE "CogsItemTier" ADD CONSTRAINT "CogsItemTier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CogsItemTier" ADD CONSTRAINT "CogsItemTier_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CogsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 20260825190100_revoke_api_role_grants stopped Supabase's default privileges
-- from reaching tables added later, but revoke explicitly as well rather than
-- rely on that, and keep RLS on for every table in the schema.
ALTER TABLE "CogsItemTier" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public."CogsItemTier" FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;

-- CogsItem.tierKey → one CogsItemTier row per item.
INSERT INTO "CogsItemTier" ("id", "tenantId", "itemId", "tierKey")
SELECT gen_random_uuid()::text, i."tenantId", i."id", i."tierKey"
FROM "CogsItem" i;

ALTER TABLE "CogsItem" DROP COLUMN "tierKey";
