/**
 * Dumps the single-tenant InfinIT Calculator database to JSON, for
 * scripts/import-infinit-calc.ts. Reads through the Supabase management API
 * so no database password is needed — only a management access token.
 *
 *   SUPABASE_ACCESS_TOKEN=... node scripts/dump-infinit-calc.mjs <project-ref> > dump.json
 *
 * The dump contains password hashes; keep it out of git and delete it after
 * the import.
 */
import { writeFileSync } from "node:fs";

const [ref, out] = process.argv.slice(2);
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error("usage: SUPABASE_ACCESS_TOKEN=... node scripts/dump-infinit-calc.mjs <project-ref> [out.json]");
  process.exit(1);
}

/** Table → column to order by, so the dump (and the import) is deterministic. */
const TABLES = {
  User: "createdAt",
  PricingVersion: "createdAt",
  CogsItem: "sortOrder",
  BundleDiscount: "sortOrder",
  QuoteRequest: "createdAt",
  QuoteReview: "createdAt",
  ExportRecord: "createdAt",
  AuditEvent: "createdAt",
};

async function rows(table, orderBy) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    // row_to_json keeps numerics as numbers and timestamps as ISO strings.
    body: JSON.stringify({ query: `select row_to_json(t) as row from "${table}" t order by "${orderBy}", id` }),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.map((r) => r.row);
}

const dump = { exportedAt: new Date().toISOString(), source: ref };
for (const [table, orderBy] of Object.entries(TABLES)) {
  dump[table] = await rows(table, orderBy);
  console.error(`${table}: ${dump[table].length}`);
}
const json = JSON.stringify(dump, null, 2);
if (out) writeFileSync(out, json);
else process.stdout.write(json);
