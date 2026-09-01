/**
 * Bootstraps a workspace, its administrator, and a published pricing version so
 * the calculator is usable immediately after a deploy. Safe to re-run: it skips
 * anything that already exists.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  SEED_BUNDLES,
  SEED_COGS_ITEMS,
  SEED_COST_BASIS,
  SEED_COST_PLUS_SETTINGS,
  SEED_SERVICE_TIERS,
  SEED_VERSION_LABEL,
} from "../src/lib/pricing/defaults";

const prisma = new PrismaClient();

async function main() {
  const slug = (process.env.SEED_TENANT_SLUG ?? "demo").toLowerCase();
  const tenantName = process.env.SEED_TENANT_NAME ?? "Demo Workspace";
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const name = process.env.SEED_ADMIN_NAME ?? "Workspace Administrator";
  const provided = process.env.SEED_ADMIN_PASSWORD;
  const password = provided || randomBytes(9).toString("base64url");

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: { slug, name: tenantName, status: "ACTIVE", pricingModel: "COST_PLUS" },
  });

  let admin = await prisma.user.findUnique({ where: { email } });
  if (admin) {
    console.log(`Account ${email} already exists — leaving it untouched.`);
  } else {
    admin = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await bcrypt.hash(password, 12),
        mustReset: !provided,
      },
    });
    console.log(`Created account ${email}`);
    if (!provided) console.log(`Temporary password: ${password}`);
  }

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } },
    update: { role: "ADMIN" },
    create: { tenantId: tenant.id, userId: admin.id, role: "ADMIN" },
  });

  const existing = await prisma.pricingVersion.findFirst({
    where: { tenantId: tenant.id, status: "PUBLISHED" },
  });
  if (existing) {
    console.log(`Pricing version ${existing.label} is already published — skipping.`);
    return;
  }

  const version = await prisma.pricingVersion.create({
    data: {
      tenantId: tenant.id,
      label: SEED_VERSION_LABEL,
      costBasis: SEED_COST_BASIS,
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedById: admin.id,
      createdById: admin.id,
      notes: "Seeded starting pricing content.",
      model: "COST_PLUS",
      settings: SEED_COST_PLUS_SETTINGS,
      serviceTiers: {
        create: SEED_SERVICE_TIERS.map((tier, index) => ({
          tenantId: tenant.id,
          key: tier.key,
          label: tier.label,
          description: tier.description,
          parentKey: tier.parentKey,
          sortOrder: index,
        })),
      },
      cogsItems: {
        create: SEED_COGS_ITEMS.map((item, index) => ({
          tenantId: tenant.id,
          key: item.key,
          label: item.label,
          unit: item.unit,
          tiers: {
            create: item.tierKeys.map((tierKey) => ({ tenantId: tenant.id, tierKey })),
          },
          unitCost: item.unitCost,
          sortOrder: index * 10,
        })),
      },
      bundles: {
        create: SEED_BUNDLES.map((bundle, index) => ({
          tenantId: tenant.id,
          key: bundle.key,
          label: bundle.label,
          description: bundle.description,
          discountPct: bundle.discountPct,
          highlight: bundle.highlight,
          sortOrder: (index + 1) * 10,
        })),
      },
    },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      action: "VERSION_PUBLISHED",
      entity: "PricingVersion",
      entityId: version.id,
      summary: `Pricing version ${version.label} seeded and published`,
      actorId: admin.id,
      actorEmail: admin.email,
    },
  });

  console.log(`Published pricing version ${version.label} for ${tenant.slug}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
