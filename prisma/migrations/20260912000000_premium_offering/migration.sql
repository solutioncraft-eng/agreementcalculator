-- Co-managed pricing measured against a premium offering.
--
-- One offering per version is the premium agreement. A co-managed offering is
-- expected to hold a share of the premium offering's rate — 65% for a helpdesk
-- level agreement, 53% for a higher-tier one — and a rate under that share
-- needs leadership review. That share replaces the per-user floor on co-managed
-- offerings; a quote can hold them to a different share, which is stamped on
-- the request so the review reads the number the account manager used.
--
-- A co-managed offering also carries the fewest users it sells to, so a quote
-- under that seat count cannot select it at all.
--
-- Existing offerings get no premium, no share and no minimum, so published
-- pricing keeps reproducing exactly as before until an admin picks a premium in
-- a new draft.

-- AlterTable
ALTER TABLE "ServiceTier"
  ADD COLUMN "premium" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "premiumPct" DECIMAL(5,2),
  ADD COLUMN "minUsers" INTEGER;

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN "premiumPct" DECIMAL(5,2);
