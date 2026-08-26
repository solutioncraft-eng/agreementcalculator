# infinIT Agreement Calculator

Internal web application that replaces the standalone `infinit_agreement_calculator_v11.html` asset. It keeps
the same pricing maths, and adds authentication with roles, administrator-controlled COGS pricing, immutable
pricing versions, a leadership approval loop, an audit log, and server-generated PDFs that are stamped so any
document can be traced back to exactly how and when it was produced.

Next.js (App Router) · TypeScript · Tailwind · PostgreSQL via Prisma.

## Roles

| Role     | Can do                                                                     |
| -------- | -------------------------------------------------------------------------- |
| `AM`     | Build agreements, submit flagged ones for review, export approved PDFs      |
| `LEADER` | Everything an AM can, plus approve / recommend changes / deny               |
| `ADMIN`  | Everything, plus pricing versions, COGS items, people, and the audit log    |

## What is and is not stored

Ordinary calculations never touch the database — they live in the browser and disappear. A `QuoteRequest` row
is created **only** when a calculation trips an approval threshold and the account manager deliberately submits
it for review; it holds the inputs, the pinned pricing version, the computed rate and the review thread so
leadership reviews the same numbers the AM saw. Those rows carry a `purgeAfter` date (12 months) and are
removed by `npm run db:purge`.

The audit log and the export registry are append-only and hold no calculated result — only who did what, when,
against which pricing version, plus (for exports) the inputs needed to reproduce the document.

## Pricing versions

A version is a snapshot of the pricing model (labor multiplier, default/max SGM, per-user floor, Pinnacle
add-on multiplier), the COGS items, and the bundle discount table. Drafts are editable; publishing freezes the
version permanently and archives the previous one. Creating a draft clones the current published version.

Every COGS item allocates on a unit basis — `USER`, `DEVICE`, `LOCATION` or `FLAT` (once per agreement) — which
is what it multiplies by. A security tool billed to InfinIT per seat is a `USER` item; a firewall per site is a
`LOCATION` item.

## Approval loop

A calculation is flagged when any of these hold: SGM differs from the version default, the per-user floor
differs from the default, either tier lands below the floor, the floor override is on, the bundle discount had
to be capped at cost, or the Pinnacle add-on multiplier differs from the default. Flagged calculations
**cannot be exported** — the AM submits for review, and a leader approves, recommends changes, or denies. Only
after approval does the export unlock.

Notifications are emailed when email is configured; without it the in-app review queue and badge counts are
the fallback (nothing is lost either way).

### Email

Set `RESEND_API_KEY` (from resend.com → API Keys) and `EMAIL_FROM`. The from-address must use a domain
verified in Resend — production sends as `noreply@apps.solutioncraft.ai`; Resend's shared
`onboarding@resend.dev` only delivers to the address that owns the Resend account, so it is test-only.
`APP_BASE_URL` must be set too, since it builds the links in the emails.

SMTP (`SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_FROM`) still works and is used when
`RESEND_API_KEY` is unset.

## PDF stamping

PDFs are rendered server-side. Every page footer carries the export ID (`EX-YYYYMMDD-XXXXXXXX`), the UTC
timestamp, who exported it, the app version and build sha, the pricing version and cost basis, the approval
state, and a SHA-256 prefix of the exact bytes. Each export writes an `ExportRecord` and an audit event, so a
PDF in the wild can be resolved against the registry at **Admin → Audit log**.

Two document types: the client-facing agreement summary, and an internal COGS worksheet (confidential — shows
tool costs, unit basis, quantities, labor and the rate build).

## Local development

Requires Node 20+ and PostgreSQL 14+.

```bash
createdb infinit_calc                     # or use an existing Postgres
cp .env.example .env                      # then fill in DATABASE_URL and AUTH_SECRET
openssl rand -base64 48                   # value for AUTH_SECRET

npm install
npm run db:generate
npm run db:migrate:dev                    # creates the schema
npm run db:seed                           # bootstrap admin + publishes pricing version 2026.3
npm run dev
```

The seed prints a temporary administrator password unless `SEED_ADMIN_PASSWORD` is set. Sign in at
`/login`.

### Creating an administrator

Run this from the deploy shell (or locally) rather than putting a password in config:

```bash
npm run admin:create -- someone@infinit.us "Their Name"
```

It creates the account (or promotes an existing one), prints a one-time temporary password, and forces a
change at first sign-in. To choose the password yourself, pipe it in:
`printf '%s' 'the-password' | npm run admin:create -- someone@infinit.us "Their Name"`.

Everyone else is added from **Admin → Users**, which emails a temporary password when SMTP is configured and
otherwise shows it once for you to hand over. Anyone can change their own password at `/account/password`;
accounts carrying a temporary password are sent there until they do.

### Environment variables

| Variable                              | Required | Purpose                                                     |
| ------------------------------------- | -------- | ----------------------------------------------------------- |
| `DATABASE_URL`                        | yes      | PostgreSQL connection string used at runtime (pooled)        |
| `DIRECT_URL`                          | yes      | Unpooled connection used for migrations; same value locally  |
| `AUTH_SECRET`                         | yes      | Session JWT signing key, 32+ random characters               |
| `APP_BASE_URL`                        | no       | Absolute base URL used in notification emails                |
| `APP_BUILD`                           | no       | Build stamp on PDFs; set to the deployed commit sha          |
| `SEED_ADMIN_*`                        | no       | Bootstrap administrator, used by `npm run db:seed` only      |
| `RESEND_API_KEY`                      | no       | Enables email notifications through Resend                   |
| `EMAIL_FROM`                          | no       | From-address for notifications                               |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_FROM` | no | SMTP fallback, used only when `RESEND_API_KEY` is unset |

### Scripts

```bash
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run build        # production build
npm run db:migrate   # prisma migrate deploy (production)
npm run db:purge     # delete quote requests past their retention date
npm run sim:pricing  # Monte Carlo sweep of the pricing engine -> PDF report
```

### Pricing engine simulation

`npm run sim:pricing` prices tens of thousands of randomised quotes through the same engine the calculator
uses, asserts the model's invariants on every trial (never below cost, floor honoured unless overridden,
Pinnacle never cheaper than Advantage, every off-policy lever raises a review trigger, monotonic in users and
margin) and writes a branded PDF report with the pass/fail table, trigger frequencies and rate distributions.
It exits non-zero if any invariant is violated, so it also works as a regression gate. Nothing is written to
the database. Environment overrides: `MC_TRIALS` (default 25000), `MC_SEED` (default 20260825, sampling is
seeded so a report reproduces exactly), `MC_OUT` (default `monte-carlo-report.pdf`). The active published
pricing version is used when a database is reachable, otherwise the seed version.

## Deployment notes

### Supabase + Vercel

1. Create a Supabase project, then open **Connect → ORMs → Prisma** and copy both connection strings.
2. In Vercel → Settings → Environment Variables set:
   - `DATABASE_URL` = transaction pooler, port `6543`, with `?pgbouncer=true&connection_limit=1` (serverless functions must use the pooler)
   - `DIRECT_URL` = direct/session connection, port `5432` (pgbouncer cannot run DDL, so migrations need this)
   - `AUTH_SECRET`, `APP_BASE_URL`, and `APP_BUILD=$VERCEL_GIT_COMMIT_SHA`
3. Apply the schema and create the first administrator from your own machine, with both variables exported:

```bash
npm run db:migrate
npm run db:seed        # pricing version 2026.3 and its COGS items
npm run admin:create -- you@infinit.us "Your Name"
```

Supabase's `anon`/`authenticated` roles and RLS are not used — the app connects as the project's Postgres user and enforces access in the application layer.

### General

- Run `npm run db:migrate` on release and set `APP_BUILD` to the commit sha so PDF stamps identify the build.
- Schedule `npm run db:purge` (daily is plenty) to honour quote retention.
- Sessions are httpOnly cookies, `Secure` in production, and expire after 10 hours.
- The app is `noindex, nofollow`; it is intended to sit behind your own network or identity perimeter.
