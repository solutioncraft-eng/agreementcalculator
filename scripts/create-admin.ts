/**
 * Creates (or promotes) an administrator from the deploy shell, so the first
 * real account never needs a password committed to config.
 *
 *   npm run admin:create -- someone@example.com "Their Name"
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

async function main() {
  const [emailArg, nameArg] = process.argv.slice(2);
  if (!emailArg) {
    console.error('Usage: npm run admin:create -- email@example.com "Full Name"');
    process.exitCode = 1;
    return;
  }

  const email = emailArg.trim().toLowerCase();
  const name = nameArg?.trim() || email.split("@")[0];
  const supplied = await readStdin();
  const password = supplied || randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email } });
  const user = existing
    ? await prisma.user.update({
        where: { email },
        data: { role: "ADMIN", active: true, passwordHash, mustReset: !supplied },
      })
    : await prisma.user.create({
        data: { email, name, role: "ADMIN", passwordHash, mustReset: !supplied },
      });

  await prisma.auditEvent.create({
    data: {
      action: existing ? "USER_UPDATED" : "USER_CREATED",
      entity: "User",
      entityId: user.id,
      summary: `${email} ${existing ? "promoted to" : "created as"} ADMIN from the command line`,
      actorEmail: "cli",
    },
  });

  console.log(`${existing ? "Updated" : "Created"} administrator ${email}`);
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
