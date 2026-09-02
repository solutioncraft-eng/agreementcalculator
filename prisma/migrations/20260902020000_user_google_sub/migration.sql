-- Google sign-in links a Google account to the account that already exists
-- here. Unique, so two people cannot end up sharing one Google identity; null
-- for everyone who has never used it.
ALTER TABLE "User" ADD COLUMN "googleSub" TEXT;
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");
