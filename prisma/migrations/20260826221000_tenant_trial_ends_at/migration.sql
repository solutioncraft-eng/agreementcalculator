-- Self-serve signup gives a workspace a trial deadline. Null for workspaces an
-- operator created and for every workspace that has been converted to ACTIVE,
-- so an absent value means "no deadline" rather than "already expired".
ALTER TABLE "Tenant" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
