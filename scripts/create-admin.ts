/**
 * Creates (or promotes) an administrator from the deploy shell, so the first
 * real account never needs a password committed to config.
 *
 *   npm run admin:create -- someone@example.com "Their Name" [workspace-slug]
 *
 * The workspace slug may be omitted when exactly one workspace exists. Set
 * SUPER_ADMIN=1 to also give the account the product-level super-admin flag.
 *
 * Prints a one-time temporary password and forces a change at first sign-in.
 * Pass a password on stdin (`echo -n 'secret' | npm run admin:create -- ...`)
 * to choose it yourself.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function onlyTenant() {
  const tenants = await prisma.tenant.findMany({ take: 2 });
  return tenants.length === 1 ? tenants[0] : null;
}

async function main() {
  const [emailArg, nameArg, slugArg] = process.argv.slice(2);
  if (!emailArg) {
    console.error('Usage: npm run admin:create -- email@example.com "Full Name" [workspace-slug]');
    process.exitCode = 1;
    return;
  }

  const tenant = slugArg
    ? await prisma.tenant.findUnique({ where: { slug: slugArg.trim().toLowerCase() } })
    : await onlyTenant();
  if (!tenant) {
    console.error(
      slugArg
        ? `No workspace with slug "${slugArg}". Create it first.`
        : "Pass the workspace slug — there is not exactly one workspace to default to.",
    );
    process.exitCode = 1;
    return;
  }

  const email = emailArg.trim().toLowerCase();
  const name = nameArg?.trim() || email.split("@")[0];
  const supplied = await readStdin();
  const password = supplied || randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);

  const superAdmin = process.env.SUPER_ADMIN === "1";
  const existing = await prisma.user.findUnique({ where: { email } });
  const user = existing
    ? await prisma.user.update({
        where: { email },
        data: {
          active: true,
          passwordHash,
          mustReset: !supplied,
          ...(superAdmin ? { isSuperAdmin: true } : {}),
        },
      })
    : await prisma.user.create({
        data: { email, name, passwordHash, mustReset: !supplied, isSuperAdmin: superAdmin },
      });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { role: "ADMIN" },
    create: { tenantId: tenant.id, userId: user.id, role: "ADMIN" },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      action: existing ? "USER_UPDATED" : "USER_CREATED",
      entity: "User",
      entityId: user.id,
      summary: `${email} ${existing ? "promoted to" : "created as"} ADMIN of ${tenant.slug} from the command line`,
      actorEmail: "cli",
    },
  });

  console.log(`${existing ? "Updated" : "Created"} administrator ${email} in ${tenant.slug}`);
  if (superAdmin) console.log("Super-admin flag set.");
  if (supplied) {
    console.log("Password set from stdin.");
  } else {
    console.log(`Temporary password: ${password}`);
    console.log("It must be changed at first sign-in.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
