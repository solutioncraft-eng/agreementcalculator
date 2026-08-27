-- Offerings become data. The two hardcoded tiers (the `Tier` enum, the tenant's
-- two label columns and the four rate columns on QuoteRequest) are replaced by
-- an ordered ServiceTier row set per pricing version, so a workspace can sell
-- any number of service levels and publishing freezes the ladder with the
-- numbers. Existing versions keep exactly the two tiers they had, named as the
-- tenant named them, so already-published pricing reproduces unchanged.

-- CreateTable
CREATE TABLE "ServiceTier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceTier_versionId_idx" ON "ServiceTier"("versionId");
CREATE INDEX "ServiceTier_tenantId_idx" ON "ServiceTier"("tenantId");
CREATE UNIQUE INDEX "ServiceTier_versionId_key_key" ON "ServiceTier"("versionId", "key");

-- AddForeignKey
ALTER TABLE "ServiceTier" ADD CONSTRAINT "ServiceTier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceTier" ADD CONSTRAINT "ServiceTier_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PricingVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 20260825190100_revoke_api_role_grants stopped Supabase's default privileges
-- from reaching tables added later, but revoke explicitly as well rather than
-- rely on that, and keep RLS on for every table in the schema.
ALTER TABLE "ServiceTier" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public."ServiceTier" FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;

-- Every existing version had the enum's two tiers, labelled by the tenant.
INSERT INTO "ServiceTier" ("id", "tenantId", "versionId", "key", "label", "description", "sortOrder")
SELECT gen_random_uuid()::text, v."tenantId", v."id", 'ADVANTAGE', t."advantageLabel", 'Core managed services', 0
FROM "PricingVersion" v
JOIN "Tenant" t ON t."id" = v."tenantId";

INSERT INTO "ServiceTier" ("id", "tenantId", "versionId", "key", "label", "description", "sortOrder")
SELECT gen_random_uuid()::text, v."tenantId", v."id", 'PINNACLE', t."pinnacleLabel", 'Adds the security stack', 1
FROM "PricingVersion" v
JOIN "Tenant" t ON t."id" = v."tenantId";

-- CogsItem.tier (enum) → CogsItem.tierKey (ServiceTier.key)
ALTER TABLE "CogsItem" ADD COLUMN "tierKey" TEXT;
UPDATE "CogsItem" SET "tierKey" = "tier"::text;
ALTER TABLE "CogsItem" ALTER COLUMN "tierKey" SET NOT NULL;
ALTER TABLE "CogsItem" DROP COLUMN "tier";

-- QuoteRequest: the requested tier becomes a key, and the four rate columns
-- become one row-per-tier snapshot.
ALTER TABLE "QuoteRequest" ADD COLUMN "requestedTierKey" TEXT;
UPDATE "QuoteRequest" SET "requestedTierKey" = "requestedTier"::text;
ALTER TABLE "QuoteRequest" ALTER COLUMN "requestedTierKey" SET NOT NULL;
ALTER TABLE "QuoteRequest" DROP COLUMN "requestedTier";

ALTER TABLE "QuoteRequest" ADD COLUMN "tierRates" JSONB;
UPDATE "QuoteRequest" q
SET "tierRates" = jsonb_build_array(
    jsonb_build_object(
        'key', 'ADVANTAGE',
        'label', t."advantageLabel",
        'rate', q."advantageRate",
        'perUser', q."advantagePerUser"
    ),
    jsonb_build_object(
        'key', 'PINNACLE',
        'label', t."pinnacleLabel",
        'rate', q."pinnacleRate",
        'perUser', q."pinnaclePerUser"
    )
)
FROM "Tenant" t
WHERE t."id" = q."tenantId";
ALTER TABLE "QuoteRequest" ALTER COLUMN "tierRates" SET NOT NULL;
ALTER TABLE "QuoteRequest"
    DROP COLUMN "advantageRate",
    DROP COLUMN "advantagePerUser",
    DROP COLUMN "pinnacleRate",
    DROP COLUMN "pinnaclePerUser";

-- Tier names now live on the version's offerings.
ALTER TABLE "Tenant" DROP COLUMN "advantageLabel", DROP COLUMN "pinnacleLabel";

-- DropEnum
DROP TYPE "Tier";
