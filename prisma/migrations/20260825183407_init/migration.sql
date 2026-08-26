-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'LEADER', 'AM');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('USER', 'DEVICE', 'LOCATION', 'FLAT');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('ADVANTAGE', 'PINNACLE');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'DENIED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'DENIED', 'WITHDRAWN', 'COMMENTED', 'RESUBMITTED');

-- CreateEnum
CREATE TYPE "ExportDocType" AS ENUM ('QUOTE', 'COGS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AM',
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustReset" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingVersion" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "costBasis" TEXT NOT NULL,
    "notes" TEXT,
    "laborMultiplier" DECIMAL(6,4) NOT NULL,
    "defaultSgmPct" DECIMAL(5,2) NOT NULL,
    "maxSgmPct" DECIMAL(5,2) NOT NULL,
    "minPerUserFloor" DECIMAL(10,2) NOT NULL,
    "addonMultiplier" DECIMAL(6,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,

    CONSTRAINT "PricingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CogsItem" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "vendor" TEXT,
    "unit" "Unit" NOT NULL,
    "tier" "Tier" NOT NULL,
    "unitCost" DECIMAL(10,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CogsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleDiscount" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "discountPct" DECIMAL(5,2) NOT NULL,
    "highlight" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BundleDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "clientName" TEXT NOT NULL,
    "notes" TEXT,
    "users" INTEGER NOT NULL,
    "devices" INTEGER NOT NULL,
    "locations" INTEGER NOT NULL,
    "sgmPct" DECIMAL(5,2) NOT NULL,
    "perUserFloor" DECIMAL(10,2) NOT NULL,
    "floorOverride" BOOLEAN NOT NULL DEFAULT false,
    "addonMultiplier" DECIMAL(6,2) NOT NULL,
    "bundleKey" TEXT NOT NULL,
    "requestedTier" "Tier" NOT NULL,
    "advantageRate" DECIMAL(12,2) NOT NULL,
    "advantagePerUser" DECIMAL(12,2) NOT NULL,
    "pinnacleRate" DECIMAL(12,2) NOT NULL,
    "pinnaclePerUser" DECIMAL(12,2) NOT NULL,
    "triggers" TEXT[],
    "pricingVersionId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteReview" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "comment" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportRecord" (
    "id" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "docType" "ExportDocType" NOT NULL,
    "exportedById" TEXT NOT NULL,
    "pricingVersionId" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "quoteId" TEXT,
    "clientName" TEXT,
    "approvalState" TEXT NOT NULL,
    "inputs" JSONB,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PricingVersion_label_key" ON "PricingVersion"("label");

-- CreateIndex
CREATE INDEX "CogsItem_versionId_idx" ON "CogsItem"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "CogsItem_versionId_key_key" ON "CogsItem"("versionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "BundleDiscount_versionId_key_key" ON "BundleDiscount"("versionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_ref_key" ON "QuoteRequest"("ref");

-- CreateIndex
CREATE INDEX "QuoteRequest_status_idx" ON "QuoteRequest"("status");

-- CreateIndex
CREATE INDEX "QuoteRequest_submittedById_idx" ON "QuoteRequest"("submittedById");

-- CreateIndex
CREATE INDEX "QuoteReview_quoteId_idx" ON "QuoteReview"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "ExportRecord_exportId_key" ON "ExportRecord"("exportId");

-- CreateIndex
CREATE INDEX "ExportRecord_exportedById_idx" ON "ExportRecord"("exportedById");

-- CreateIndex
CREATE INDEX "ExportRecord_createdAt_idx" ON "ExportRecord"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entity_entityId_idx" ON "AuditEvent"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "PricingVersion" ADD CONSTRAINT "PricingVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingVersion" ADD CONSTRAINT "PricingVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CogsItem" ADD CONSTRAINT "CogsItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PricingVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleDiscount" ADD CONSTRAINT "BundleDiscount_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PricingVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_pricingVersionId_fkey" FOREIGN KEY ("pricingVersionId") REFERENCES "PricingVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteReview" ADD CONSTRAINT "QuoteReview_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteReview" ADD CONSTRAINT "QuoteReview_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportRecord" ADD CONSTRAINT "ExportRecord_exportedById_fkey" FOREIGN KEY ("exportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportRecord" ADD CONSTRAINT "ExportRecord_pricingVersionId_fkey" FOREIGN KEY ("pricingVersionId") REFERENCES "PricingVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportRecord" ADD CONSTRAINT "ExportRecord_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "QuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
