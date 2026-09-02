-- Co-managed offerings and flat-rate overrides.
--
-- A co-managed agreement is delivered alongside the client's own IT staff, so
-- the imputed labor (or markup) the model puts on its base tools is too high.
-- An offering can now be flagged co-managed, which prices the base of its chain
-- with the version's co-managed lever, and can carry an optional flat rate per
-- user / device / location / agreement that replaces the formula entirely while
-- the COGS cost floor keeps applying underneath.
--
-- Existing offerings are fully managed with no override, so published pricing
-- reproduces unchanged. The version settings gain their co-managed lever with a
-- default when read, so stored settings need no migration.

-- AlterTable
ALTER TABLE "ServiceTier"
  ADD COLUMN "coManaged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "overridePerUser" DECIMAL(10,4),
  ADD COLUMN "overridePerDevice" DECIMAL(10,4),
  ADD COLUMN "overridePerLocation" DECIMAL(10,4),
  ADD COLUMN "overrideFlat" DECIMAL(10,4);
