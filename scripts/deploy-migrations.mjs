/**
 * Applies pending migrations during a Vercel production build, so a schema
 * change ships with the code that needs it instead of waiting for someone to
 * run `npm run db:migrate` by hand.
 *
 * Skipped unless this is a production build with a database configured:
 * preview and development builds must never touch the production database, and
 * a build without DIRECT_URL cannot run DDL at all.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const env = process.env.VERCEL_ENV;
const target = env ?? "local";

if (env && env !== "production") {
  console.log(`Skipping prisma migrate deploy — ${target} build.`);
  process.exit(0);
}

if (!process.env.DIRECT_URL || !process.env.DATABASE_URL) {
  console.log(`Skipping prisma migrate deploy — DATABASE_URL/DIRECT_URL not set in this ${target} build.`);
  process.exit(0);
}

console.log(`Applying pending migrations to the ${target} database.`);
const prisma = path.join(fileURLToPath(new URL("../node_modules/.bin/", import.meta.url)), "prisma");
const result = spawnSync(prisma, ["migrate", "deploy"], { stdio: "inherit", shell: false });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
