import { randomBytes } from "node:crypto";
import type { PricingModel, Tenant, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { PRICING_MODELS, settingsRecord } from "@/lib/pricing/models";
import {
  SEED_BUNDLES,
  SEED_COGS_ITEMS,
  SEED_COST_BASIS,
  SEED_SERVICE_TIERS,
} from "@/lib/pricing/defaults";

export interface ProvisionInput {
  name: string;
  slug: string;
  pricingModel: PricingModel;
  /** Copy the reference COGS catalogue in as a starting point to edit. */
  seedCatalog: boolean;
  admin: {
    email: string;
    name: string;
    /** Chosen at signup. Absent when an operator invites the administrator. */
    password?: string;
  };
  /** Trial deadline, or null for a workspace with no deadline. */
  trialEndsAt: Date | null;
  /**
   * Who the starting draft is attributed to. Defaults to the administrator,
   * which is right for a signup; an operator creating a workspace passes their
   * own id, since they are the one who set it up.
   */
  draftCreatedById?: string;
}

export interface Provisioned {
  tenant: Tenant;
  admin: User;
  /** Set only when an account was created without a chosen password. */
  temporaryPassword: string | null;
  /** The email already had an account, which was granted the membership. */
  reusedAccount: boolean;
}

/**
 * Creates a workspace with its first administrator, whether that comes from
 * self-serve signup or from an operator in `/super`.
 *
 * The workspace opens with a *draft* pricing version and nothing published, so
 * it is deliberately not quotable until its own administrator has reviewed the
 * costs. Both entry points must behave identically here, which is why it is one
 * function: a signup that skipped the draft, or an operator-created workspace
 * that seeded a published version, would be a different product.
 *
 * Written as one transaction so a failure part-way cannot leave behind an
 * account with no workspace, or a workspace with no pricing draft to open.
 */
export async function provisionWorkspace(input: ProvisionInput): Promise<Provisioned> {
  const existing = await prisma.user.findUnique({ where: { email: input.admin.email } });
  const temporaryPassword = existing || input.admin.password ? null : randomBytes(9).toString("base64url");
  // Hashing is deliberately slow, so it happens before the transaction opens.
  const passwordHash = existing
    ? null
    : await hashPassword(input.admin.password ?? (temporaryPassword as string));

  const model: PricingModel = input.pricingModel;
  const { tenant, admin } = await prisma.$transaction(async (tx) => {
    const admin =
      existing ??
      (await tx.user.create({
        data: {
          email: input.admin.email,
          name: input.admin.name,
          passwordHash: passwordHash as string,
          mustReset: !input.admin.password,
        },
      }));

    const tenant = await tx.tenant.create({
      data: {
        slug: input.slug,
        name: input.name,
        pricingModel: model,
        status: "TRIAL",
        trialEndsAt: input.trialEndsAt,
        memberships: { create: { userId: admin.id, role: "ADMIN" } },
      },
    });

    await tx.pricingVersion.create({
      data: {
        tenantId: tenant.id,
        label: `${new Date().getFullYear()}.1`,
        costBasis: SEED_COST_BASIS,
        model,
        settings: settingsRecord(model, PRICING_MODELS[model].defaults),
        notes: "Starting draft — review the costs, then publish.",
        createdById: input.draftCreatedById ?? admin.id,
        // Offerings belong to the version, so the first draft carries the
        // starting ladder even when the COGS catalogue is left empty.
        serviceTiers: {
          create: SEED_SERVICE_TIERS.map((tier, index) => ({
            ...tier,
            tenantId: tenant.id,
            sortOrder: index,
          })),
        },
        cogsItems: input.seedCatalog
          ? {
              create: SEED_COGS_ITEMS.map(({ tierKeys, ...item }, index) => ({
                ...item,
                tenantId: tenant.id,
                sortOrder: index,
                tiers: {
                  create: tierKeys.map((tierKey) => ({ tenantId: tenant.id, tierKey })),
                },
              })),
            }
          : undefined,
        bundles: {
          create: SEED_BUNDLES.map((bundle, index) => ({
            ...bundle,
            tenantId: tenant.id,
            sortOrder: index,
          })),
        },
      },
    });

    return { tenant, admin };
  });

  return { tenant, admin, temporaryPassword, reusedAccount: Boolean(existing) };
}
