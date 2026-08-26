/**
 * Bootstraps an administrator and publishes the v11-derived pricing version so
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
  SEED_PRICING_MODEL,
  SEED_VERSION_LABEL,
} from "../src/lib/pricing/defaults";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@infinit.us").toLowerCase();
  const name = process.env.SEED_ADMIN_NAME ?? "InfinIT Administrator";
  const provided = process.env.SEED_ADMIN_PASSWORD;
  const password = provided || randomBytes(9).toString("base64url");

  let admin = await prisma.user.findUnique({ where: { email } });
  if (admin) {
    console.log(`Administrator ${email} already exists — leaving it untouched.`);
  } else {
    admin = await prisma.user.create({
      data: {
        email,
        name,
        role: "ADMIN",
        passwordHash: await bcrypt.hash(password, 12),
        mustReset: !provided,
      },
    });
    console.log(`Created administrator ${email}`);
    if (!provided) console.log(`Temporary password: ${password}`);
  }

  const existing = await prisma.pricingVersion.findFirst({ where: { status: "PUBLISHED" } });
  if (existing) {
    console.log(`Pricing version ${existing.label} is already published — skipping.`);
    return;
  }

  const version = await prisma.pricingVersion.create({
    data: {
      label: SEED_VERSION_LABEL,
      costBasis: SEED_COST_BASIS,
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedById: admin.id,
      createdById: admin.id,
      notes: "Seeded from the standalone calculator v11.",
      ...SEED_PRICING_MODEL,
      cogsItems: {
        create: SEED_COGS_ITEMS.map((item, index) => ({
          key: item.key,
          label: item.label,
          vendor: item.vendor,
          unit: item.unit,
          tier: item.tier,
          unitCost: item.unitCost,
          sortOrder: index * 10,
        })),
      },
      bundles: {
        create: SEED_BUNDLES.map((bundle, index) => ({
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
      action: "VERSION_PUBLISHED",
      entity: "PricingVersion",
      entityId: version.id,
      summary: `Pricing version ${version.label} seeded and published`,
      actorId: admin.id,
      actorEmail: admin.email,
    },
  });

  console.log(`Published pricing version ${version.label}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
