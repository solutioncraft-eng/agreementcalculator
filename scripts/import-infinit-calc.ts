/**
 * Imports a single-tenant InfinIT Calculator database into one workspace.
 *
 *   npm run import:infinit-calc -- <dump.json> <workspace-slug> [--apply]
 *
 * `dump.json` comes from scripts/dump-infinit-calc.mjs. Without `--apply` the
 * script only prints what it would do. With it, everything is written in one
 * transaction, so a failure part-way leaves the workspace untouched.
 *
 * What comes across, and how:
 *   - Users, matched by email. Unknown emails become accounts with their old
 *     password hash (bcrypt on both sides), so people keep their password.
 *     Every old user gets a membership in the workspace with their old role;
 *     an existing membership keeps whatever role it already has.
 *   - Pricing versions, all as ARCHIVED (the workspace already has its own
 *     published ladder). The two fixed tiers become offerings "ADVANTAGE" and
 *     "PINNACLE" (Pinnacle builds on Advantage), and each COGS item is carried
 *     by the tier it was assigned to. Labels that clash get " (imported)".
 *   - Quotes, reviews and PDF export records, pinned to the imported version
 *     they were produced with, so every old document still reproduces.
 *   - Audit events, scoped to the workspace.
 *
 * Refuses to run if any quote ref, export id or (unsuffixed) version label
 * from the dump already exists, which also makes an accidental second run a
 * no-op.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient, type ExportDocType, type QuoteStatus, type ReviewAction, type Role, type Unit } from "@prisma/client";
import { costPlusModel } from "../src/lib/pricing/models/cost-plus";

const prisma = new PrismaClient();

type OldTier = "ADVANTAGE" | "PINNACLE";

interface Dump {
  source: string;
  User: {
    id: string;
    email: string;
    name: string;
    role: Role;
    passwordHash: string;
    active: boolean;
    mustReset: boolean;
    lastLoginAt: string | null;
    createdAt: string;
  }[];
  PricingVersion: {
    id: string;
    label: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    costBasis: string;
    notes: string | null;
    laborMultiplier: number;
    defaultSgmPct: number;
    maxSgmPct: number;
    minPerUserFloor: number;
    addonMultiplier: number;
    createdAt: string;
    publishedAt: string | null;
    createdById: string;
    publishedById: string | null;
  }[];
  CogsItem: {
    versionId: string;
    key: string;
    label: string;
    vendor: string | null;
    unit: Unit;
    tier: OldTier;
    unitCost: number;
    active: boolean;
    sortOrder: number;
  }[];
  BundleDiscount: {
    versionId: string;
    key: string;
    label: string;
    description: string | null;
    discountPct: number;
    highlight: boolean;
    sortOrder: number;
  }[];
  QuoteRequest: {
    id: string;
    ref: string;
    status: QuoteStatus;
    clientName: string;
    notes: string | null;
    users: number;
    devices: number;
    locations: number;
    sgmPct: number;
    perUserFloor: number;
    floorOverride: boolean;
    addonMultiplier: number;
    bundleKey: string;
    requestedTier: OldTier;
    advantageRate: number;
    advantagePerUser: number;
    pinnacleRate: number;
    pinnaclePerUser: number;
    triggers: string[];
    pricingVersionId: string;
    submittedById: string;
    createdAt: string;
    updatedAt: string;
    decidedAt: string | null;
    purgeAfter: string;
  }[];
  QuoteReview: {
    quoteId: string;
    action: ReviewAction;
    comment: string | null;
    actorId: string;
    createdAt: string;
  }[];
  ExportRecord: {
    exportId: string;
    docType: ExportDocType;
    exportedById: string;
    pricingVersionId: string;
    appVersion: string;
    quoteId: string | null;
    clientName: string | null;
    approvalState: string;
    inputs: unknown;
    checksum: string | null;
    createdAt: string;
  }[];
  AuditEvent: {
    action: string;
    entity: string | null;
    entityId: string | null;
    summary: string;
    before: unknown;
    after: unknown;
    actorId: string | null;
    actorEmail: string | null;
    ip: string | null;
    userAgent: string | null;
    createdAt: string;
  }[];
}

/** The old tiers as offerings; labels match what the old app printed. */
const TIERS: { key: OldTier; label: string; description: string; parentKey: OldTier | null }[] = [
  {
    key: "ADVANTAGE",
    label: "InfinIT Advantage",
    description: "Fully managed core service stack.",
    parentKey: null,
  },
  {
    key: "PINNACLE",
    label: "InfinIT Pinnacle",
    description: "Advantage plus the security add-on stack.",
    parentKey: "ADVANTAGE",
  },
];

/** The old database stored timestamps without a zone; they are UTC. */
function utc(value: string): Date;
function utc(value: string | null): Date | null;
function utc(value: string | null): Date | null {
  if (value === null) return null;
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
}

function pick<T>(map: Map<string, T>, id: string, what: string): T {
  const found = map.get(id);
  if (found === undefined) throw new Error(`${what} ${id} is referenced but not in the dump`);
  return found;
}

async function main() {
  const [file, slug, flag] = process.argv.slice(2);
  if (!file || !slug) {
    console.error("usage: npm run import:infinit-calc -- <dump.json> <workspace-slug> [--apply]");
    process.exit(1);
  }
  const apply = flag === "--apply";
  const dump = JSON.parse(readFileSync(file, "utf8")) as Dump;

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`No workspace with slug "${slug}"`);
  if (tenant.pricingModel !== "COST_PLUS") {
    throw new Error(`Workspace ${slug} prices with ${tenant.pricingModel}; the old app was cost-plus`);
  }
  const tenantId = tenant.id;

  // ── Collisions ───────────────────────────────────────────────────────────
  const existingQuotes = await prisma.quoteRequest.findMany({
    where: { tenantId, ref: { in: dump.QuoteRequest.map((q) => q.ref) } },
    select: { ref: true },
  });
  if (existingQuotes.length) {
    throw new Error(`Already in ${slug}: quotes ${existingQuotes.map((q) => q.ref).join(", ")}`);
  }
  const existingExports = await prisma.exportRecord.findMany({
    where: { exportId: { in: dump.ExportRecord.map((e) => e.exportId) } },
    select: { exportId: true },
  });
  if (existingExports.length) {
    throw new Error(`Already imported: exports ${existingExports.map((e) => e.exportId).join(", ")}`);
  }
  const takenLabels = new Set(
    (await prisma.pricingVersion.findMany({ where: { tenantId }, select: { label: true } })).map((v) => v.label),
  );
  const versionLabel = (label: string) => (takenLabels.has(label) ? `${label} (imported)` : label);
  for (const v of dump.PricingVersion) {
    if (takenLabels.has(versionLabel(v.label))) {
      throw new Error(`Version "${versionLabel(v.label)}" already exists in ${slug}; was this dump imported before?`);
    }
  }

  // ── Users ────────────────────────────────────────────────────────────────
  const emails = dump.User.map((u) => u.email.toLowerCase());
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, memberships: { where: { tenantId }, select: { role: true } } },
  });
  const byEmail = new Map(existingUsers.map((u) => [u.email, u]));

  console.log(`${apply ? "Importing" : "Would import"} from ${dump.source} into ${tenant.name} (${slug})\n`);
  console.log("Users");
  for (const u of dump.User) {
    const found = byEmail.get(u.email.toLowerCase());
    const note = !found
      ? `create account, ${u.role} membership`
      : found.memberships.length
        ? `already a member (${found.memberships[0].role}, kept)`
        : `existing account, add ${u.role} membership`;
    console.log(`  ${u.email.padEnd(44)} ${note}`);
  }
  console.log("\nPricing versions");
  for (const v of dump.PricingVersion) {
    const items = dump.CogsItem.filter((i) => i.versionId === v.id).length;
    const bundles = dump.BundleDiscount.filter((b) => b.versionId === v.id).length;
    console.log(`  ${versionLabel(v.label).padEnd(24)} ${v.status} → ARCHIVED, ${items} COGS items, ${bundles} bundles`);
  }
  console.log("\nQuotes");
  for (const q of dump.QuoteRequest) {
    const reviews = dump.QuoteReview.filter((r) => r.quoteId === q.id).length;
    console.log(`  ${q.ref}  ${q.status.padEnd(18)} ${q.clientName} (${q.requestedTier}, ${reviews} reviews)`);
  }
  console.log(`\nExports: ${dump.ExportRecord.length}   Audit events: ${dump.AuditEvent.length}`);

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write.");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const userIds = new Map<string, string>();
      for (const u of dump.User) {
        const email = u.email.toLowerCase();
        const found = byEmail.get(email);
        let id = found?.id;
        if (!id) {
          id = (
            await tx.user.create({
              data: {
                email,
                name: u.name,
                passwordHash: u.passwordHash,
                active: u.active,
                mustReset: u.mustReset,
                lastLoginAt: utc(u.lastLoginAt),
                createdAt: utc(u.createdAt),
              },
              select: { id: true },
            })
          ).id;
        }
        if (!found?.memberships.length) {
          await tx.membership.create({ data: { tenantId, userId: id, role: u.role } });
        }
        userIds.set(u.id, id);
      }
      const user = (oldId: string) => pick(userIds, oldId, "user");

      const versionIds = new Map<string, string>();
      for (const v of dump.PricingVersion) {
        const created = await tx.pricingVersion.create({
          data: {
            tenantId,
            label: versionLabel(v.label),
            status: "ARCHIVED",
            costBasis: v.costBasis,
            notes: [v.notes, `Imported from InfinIT Calculator (${v.status.toLowerCase()} there).`]
              .filter(Boolean)
              .join("\n"),
            model: "COST_PLUS",
            settings: {
              ...costPlusModel.defaults,
              laborMultiplier: v.laborMultiplier,
              defaultSgmPct: v.defaultSgmPct,
              maxSgmPct: v.maxSgmPct,
              minPerUserFloor: v.minPerUserFloor,
              addonMultiplier: v.addonMultiplier,
            },
            createdAt: utc(v.createdAt),
            publishedAt: utc(v.publishedAt),
            createdById: user(v.createdById),
            publishedById: v.publishedById ? user(v.publishedById) : null,
            serviceTiers: {
              create: TIERS.map((t, sortOrder) => ({ tenantId, ...t, sortOrder })),
            },
            bundles: {
              create: dump.BundleDiscount.filter((b) => b.versionId === v.id).map((b) => ({
                tenantId,
                key: b.key,
                label: b.label,
                description: b.description,
                discountPct: b.discountPct,
                highlight: b.highlight,
                sortOrder: b.sortOrder,
              })),
            },
            cogsItems: {
              create: dump.CogsItem.filter((i) => i.versionId === v.id).map((i) => ({
                tenantId,
                key: i.key,
                label: i.label,
                vendor: i.vendor,
                unit: i.unit,
                unitCost: i.unitCost,
                active: i.active,
                sortOrder: i.sortOrder,
                tiers: { create: [{ tenantId, tierKey: i.tier }] },
              })),
            },
          },
          select: { id: true },
        });
        versionIds.set(v.id, created.id);
      }
      const version = (oldId: string) => pick(versionIds, oldId, "pricing version");

      const quoteIds = new Map<string, string>();
      for (const q of dump.QuoteRequest) {
        const created = await tx.quoteRequest.create({
          data: {
            tenantId,
            ref: q.ref,
            status: q.status,
            clientName: q.clientName,
            notes: q.notes,
            users: q.users,
            devices: q.devices,
            locations: q.locations,
            sgmPct: q.sgmPct,
            perUserFloor: q.perUserFloor,
            floorOverride: q.floorOverride,
            addonMultiplier: q.addonMultiplier,
            markupMultiple: costPlusModel.startingInputs(costPlusModel.defaults).markupMultiple,
            bundleKey: q.bundleKey,
            requestedTierKey: q.requestedTier,
            tierRates: [
              { key: "ADVANTAGE", label: TIERS[0].label, rate: q.advantageRate, perUser: q.advantagePerUser },
              { key: "PINNACLE", label: TIERS[1].label, rate: q.pinnacleRate, perUser: q.pinnaclePerUser },
            ],
            triggers: q.triggers,
            pricingVersionId: version(q.pricingVersionId),
            submittedById: user(q.submittedById),
            createdAt: utc(q.createdAt),
            updatedAt: utc(q.updatedAt),
            decidedAt: utc(q.decidedAt),
            purgeAfter: utc(q.purgeAfter),
            reviews: {
              create: dump.QuoteReview.filter((r) => r.quoteId === q.id).map((r) => ({
                tenantId,
                action: r.action,
                comment: r.comment,
                actorId: user(r.actorId),
                createdAt: utc(r.createdAt),
              })),
            },
          },
          select: { id: true },
        });
        quoteIds.set(q.id, created.id);
      }

      for (const e of dump.ExportRecord) {
        await tx.exportRecord.create({
          data: {
            tenantId,
            exportId: e.exportId,
            docType: e.docType,
            exportedById: user(e.exportedById),
            pricingVersionId: version(e.pricingVersionId),
            appVersion: e.appVersion,
            quoteId: e.quoteId ? pick(quoteIds, e.quoteId, "quote") : null,
            clientName: e.clientName,
            approvalState: e.approvalState,
            inputs: e.inputs === null ? undefined : (e.inputs as object),
            checksum: e.checksum,
            createdAt: utc(e.createdAt),
          },
        });
      }

      await tx.auditEvent.createMany({
        data: dump.AuditEvent.map((a) => ({
          tenantId,
          action: a.action,
          entity: a.entity,
          entityId: a.entityId,
          summary: a.summary,
          before: a.before === null ? undefined : (a.before as object),
          after: a.after === null ? undefined : (a.after as object),
          actorId: a.actorId ? userIds.get(a.actorId) ?? null : null,
          actorEmail: a.actorEmail,
          ip: a.ip,
          userAgent: a.userAgent,
          createdAt: utc(a.createdAt),
        })),
      });

      await tx.auditEvent.create({
        data: {
          tenantId,
          action: "DATA_IMPORTED",
          entity: "Tenant",
          entityId: tenantId,
          summary: `Imported InfinIT Calculator (${dump.source}): ${dump.User.length} users, ${dump.PricingVersion.length} versions, ${dump.QuoteRequest.length} quotes, ${dump.ExportRecord.length} exports`,
        },
      });
    },
    { timeout: 60_000 },
  );

  console.log("\nDone.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
