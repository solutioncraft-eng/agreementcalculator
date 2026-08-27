# Agreement Calculator

Multi-tenant managed services agreement pricing. Each workspace gets its own people, COGS catalogue, immutable
pricing versions, leadership approval loop, audit log, branding, and server-generated PDFs stamped so any
document can be traced back to exactly how and when it was produced.

Next.js (App Router) · TypeScript · Tailwind · PostgreSQL via Prisma.

## Tenancy

One database, one schema, `tenantId` on every workspace-owned table, enforced in a single place: routes get
their Prisma client from `requireTenant()`, and the client extension in `src/lib/db.ts` injects the active
`tenantId` into every filter and every write. Naming a different tenant explicitly throws
`CrossTenantQueryError` rather than being silently rewritten, and a `findUnique` that lands on another
workspace's row returns `null`. `npm test` asserts this, including that no table gains a `tenantId` column
without being registered as scoped.

Unscoped `prisma` is reserved for what is genuinely product-level: sign-in, a user's own identity and
password, and the operator portal.

| Table                                                                                                   | Owner        |
| ------------------------------------------------------------------------------------------------------- | ------------ |
| `Membership`, `PricingVersion`, `CogsItem`, `BundleDiscount`, `QuoteRequest`, `QuoteReview`, `ExportRecord` | a workspace |
| `User`                                                                                                  | the product  |
| `AuditEvent`                                                                                            | either (product-level events have no `tenantId`) |

### Users and workspaces

A person is one global account identified by email, with a `Membership` per workspace, and their role can
differ between them (AM in one, LEADER in another). Signing in with more than one membership lands on
`/workspaces` to pick one, with a switcher in the header afterwards; the chosen workspace is bound to the
signed session, so it cannot be changed by editing a URL. Users whose workspace does not include them get
`/no-workspace`, which deliberately reveals nothing about which workspaces exist.

Workspaces are addressed as subdomains (`acme.agreementcalculator.com`). When the host matches a workspace it
wins over the session's workspace, so a link into a specific workspace behaves as expected.

### Operator portal

`/super` is for `User.isSuperAdmin` only: create a workspace with its first administrator, suspend or
reinstate one, change which pricing model it uses. It reports counts, pricing version labels and timestamps —
**never quote contents or COGS costs**, which are the workspace's confidential pricing.

## Roles

| Role     | Can do                                                                     |
| -------- | -------------------------------------------------------------------------- |
| `AM`     | Build agreements, submit flagged ones for review, export approved PDFs      |
| `LEADER` | Everything an AM can, plus approve / recommend changes / deny               |
| `ADMIN`  | Everything, plus pricing versions, COGS items, people, branding, audit log  |

## What is and is not stored

Ordinary calculations never touch the database — they live in the browser and disappear. A `QuoteRequest` row
is created **only** when a calculation trips an approval threshold and the account manager deliberately submits
it for review; it holds the inputs, the pinned pricing version, the computed rate and the review thread so
leadership reviews the same numbers the AM saw. Those rows carry a `purgeAfter` date (per-workspace
`retentionMonths`, 12 by default) and are removed by `npm run db:purge`.

The audit log and the export registry are append-only and hold no calculated result — only who did what, when,
against which pricing version, plus (for exports) the inputs needed to reproduce the document.

## Pricing models

A workspace adopts one model when it is created; every version it publishes uses that model, and each model
exposes only its own settings, so tuning is a matter of editing a handful of numbers.

| Model             | Settings                                                                    |
| ----------------- | --------------------------------------------------------------------------- |
| `COST_PLUS`       | labor multiplier, default/max service gross margin, per-user floor, add-on multiplier |
| `MARKUP_MULTIPLE` | default markup, minimum markup before review, per-user floor, max discount, add-on markup |

Both share the COGS catalogue, the bundle discounts, the approval thresholds, the audit log and the stamped
PDFs — only the rate build and the admin form differ, which makes a third model one file in
`src/lib/pricing/models` plus one registry entry. Changing a workspace's model is an operator action, since it
changes what a quote means; published versions keep the model they were published with.

A version is a snapshot of the model settings, the COGS items and the bundle discount table. Drafts are
editable; publishing freezes the version permanently and archives the previous one. Creating a draft clones
the current published version.

Every COGS item allocates on a unit basis — `USER`, `DEVICE`, `LOCATION` or `FLAT` (once per agreement) — which
is what it multiplies by. A security tool billed per seat is a `USER` item; a firewall per site is a
`LOCATION` item.

## Approval loop

A calculation is flagged when it departs from the published version's policy: margin or markup off default,
per-user floor changed, either tier landing below the floor, the floor override on, the bundle discount capped
at cost, or the add-on multiple off default. Flagged calculations **cannot be exported** — the AM submits for
review, and a leader approves, recommends changes, or denies. Only after approval does the export unlock.

Notifications are emailed when email is configured; without it the in-app review queue and badge counts are
the fallback (nothing is lost either way).

### Email

Set `RESEND_API_KEY` (from resend.com → API Keys) and `EMAIL_FROM`. The from-address must use a domain
verified in Resend; Resend's shared `onboarding@resend.dev` only delivers to the address that owns the Resend
account, so it is test-only. `APP_BASE_URL` must be set too, since it builds the links in the emails. All
workspaces send from the same address with their name in the subject and body.

SMTP (`SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_FROM`) still works and is used when
`RESEND_API_KEY` is unset.

## Branding

One house style guide; each workspace adds its own logo, accent colour, PDF footer and tier labels at
**Admin → Branding**. Tier labels matter because "Advantage / Pinnacle" are one MSP's product names — they are
per-workspace strings everywhere in the UI and in PDFs.

Logo uploads need object storage, since the filesystem is read-only on Vercel: set `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_LOGO_BUCKET` (a public bucket). Without them administrators can
still point branding at an image URL they host. Workspaces with no logo fall back to their own name.

## Trials and billing

A self-serve signup starts a 14-day trial with no card. After that a workspace needs one of three things to
keep working: a healthy Stripe subscription ($69/month per company, unlimited people), a failed payment still
inside its 7-day grace window, or `ACTIVE` status set by an operator in `/super` (the comp override). Anything
else lands at `/trial-ended`, which offers Checkout to administrators. `src/lib/billing.ts` decides this and
is the only place that judgement lives; `/api/export` re-checks it, because a direct API call never passes
through a page.

Stripe hosts both the card form (Checkout) and everything afterwards (billing portal: card changes, invoices,
cancellation), so no card data reaches this application. `/api/stripe/webhook` is the **only** writer of
subscription state — the return from Checkout records nothing, so an abandoned payment or a card that fails
after the redirect cannot leave a workspace looking paid. It verifies Stripe's signature over the raw body and
handles `checkout.session.completed`, `customer.subscription.created/updated/deleted` and
`invoice.payment_failed`; the grace deadline is set from the first failure and only Stripe reporting the
subscription healthy clears it.

Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` and `STRIPE_WEBHOOK_SECRET`. With any of them unset the paywall is
inert — trials and operator activation keep working and the Subscribe button says card payment is not switched
on — so a local or preview deployment needs no Stripe account. Locally:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook   # prints the whsec_… to use
```

## PDF stamping

PDFs are rendered server-side. Every page footer carries the export ID (`EX-YYYYMMDD-XXXXXX`), the UTC
timestamp, who exported it, the app version and build sha, the pricing version and cost basis, the approval
state, and a SHA-256 prefix of the exact bytes. Each export writes an `ExportRecord` and an audit event, so a
PDF in the wild can be resolved against the registry at **Admin → Audit log**.

Two document types: the client-facing agreement summary, and an internal COGS worksheet (confidential — shows
tool costs, unit basis, quantities, labor and the rate build).

## Local development

Requires Node 20+ and PostgreSQL 14+.

```bash
createdb agreementcalculator              # or use an existing Postgres
cp .env.example .env                      # then fill in DATABASE_URL and AUTH_SECRET
openssl rand -base64 48                   # value for AUTH_SECRET

npm install
npm run db:migrate:dev                    # creates the schema
npm run db:seed                           # a workspace, its admin, and a published pricing version
npm run dev
```

The seed creates the workspace named by `SEED_TENANT_SLUG` / `SEED_TENANT_NAME` and prints a temporary
administrator password unless `SEED_ADMIN_PASSWORD` is set. Sign in at `/login`.

### Creating an administrator

Run this from the deploy shell (or locally) rather than putting a password in config:

```bash
npm run admin:create -- someone@example.com "Their Name" demo
```

It creates the account (or adds it to the workspace), prints a one-time temporary password, and forces a
change at first sign-in. The workspace slug may be omitted when only one workspace exists; prefix with
`SUPER_ADMIN=1` to also grant the operator portal. To choose the password yourself, pipe it in:
`printf '%s' 'the-password' | npm run admin:create -- someone@example.com "Their Name" demo`.

Everyone else is added from **Admin → People**, which emails a temporary password when email is configured and
otherwise shows it once for you to hand over. Anyone can change their own password at `/account/password`;
accounts carrying a temporary password are sent there until they do.

### Environment variables

| Variable                              | Required | Purpose                                                     |
| ------------------------------------- | -------- | ----------------------------------------------------------- |
| `DATABASE_URL`                        | yes      | PostgreSQL connection string used at runtime (pooled)        |
| `DIRECT_URL`                          | yes      | Unpooled connection used for migrations; same value locally  |
| `AUTH_SECRET`                         | yes      | Session JWT signing key, 32+ random characters               |
| `APP_BASE_URL`                        | no       | Absolute base URL used in notification emails                |
| `APP_ROOT_DOMAIN`                     | no       | Root domain workspaces are subdomains of; defaults to the `APP_BASE_URL` host |
| `APP_BUILD`                           | no       | Build stamp on PDFs; set to the deployed commit sha          |
| `SEED_TENANT_SLUG` / `SEED_TENANT_NAME` | no     | Workspace created by `npm run db:seed`                       |
| `SEED_ADMIN_*`                        | no       | Bootstrap administrator, used by `npm run db:seed` only      |
| `RESEND_API_KEY`                      | no       | Enables email notifications through Resend                   |
| `EMAIL_FROM`                          | no       | From-address for notifications                               |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_LOGO_BUCKET` | no | Logo uploads; without them, hosted image URLs still work |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_FROM` | no | SMTP fallback, used only when `RESEND_API_KEY` is unset |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | no | Subscription billing; without all three the paywall is inert |

### Scripts

```bash
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # tenant isolation and slug rules (node:test)
npm run build        # production build
npm run db:migrate   # prisma migrate deploy (production)
npm run db:purge     # delete quote requests past their retention date
npm run sim:pricing  # Monte Carlo sweep of the pricing engine -> PDF report
```

### Pricing engine simulation

`npm run sim:pricing` prices tens of thousands of randomised quotes through the same engine the calculator
uses, asserts the model's invariants on every trial (never below cost, floor honoured unless overridden,
upper tier never cheaper than base, every off-policy lever raises a review trigger, monotonic in users and
margin) and writes a PDF report with the pass/fail table, trigger frequencies and rate distributions. It exits
non-zero if any invariant is violated, so it also works as a regression gate. Nothing is written to the
database, and it runs against the cost-plus seed settings rather than any workspace's pricing. Environment
overrides: `MC_TRIALS` (default 25000), `MC_SEED` (default 20260825, sampling is seeded so a report reproduces
exactly), `MC_OUT` (default `monte-carlo-report.pdf`).

## Deployment notes

### Supabase + Vercel

1. Create a Supabase project, then open **Connect → ORMs → Prisma** and copy both connection strings.
2. In Vercel → Settings → Environment Variables set:
   - `DATABASE_URL` = transaction pooler, port `6543`, with `?pgbouncer=true&connection_limit=1` (serverless functions must use the pooler)
   - `DIRECT_URL` = direct/session connection, port `5432` (pgbouncer cannot run DDL, so migrations need this)
   - `AUTH_SECRET`, `APP_BASE_URL`, `APP_ROOT_DOMAIN`, and `APP_BUILD=$VERCEL_GIT_COMMIT_SHA`
3. Point a wildcard domain (`*.agreementcalculator.com`) at the project so workspace subdomains resolve.
4. Apply the schema and create the first operator from your own machine, with both variables exported:

```bash
npm run db:migrate
npm run db:seed
SUPER_ADMIN=1 npm run admin:create -- you@example.com "Your Name" demo
```

Supabase's `anon`/`authenticated` roles are not used — the app connects as the project's Postgres user and
enforces access in the application layer. Supabase's default privileges would nonetheless leave every new
table readable and writable by both roles, so `20260825190100_revoke_api_role_grants` revokes them at table
level (a column grant is a floor, never a ceiling), removes the default for tables added later, and turns RLS
on as a backstop. After any migration that adds a table, confirm it stayed shut:

```sql
SELECT has_table_privilege('anon', 'public."CogsItem"', 'SELECT');  -- must be false
```

### General

- On Vercel, `vercel-build` runs `prisma migrate deploy` before `next build`, so a release applies its own
  migrations. It is a no-op unless `VERCEL_ENV=production` and both connection strings are set, so preview
  builds never touch the production database. Elsewhere, run `npm run db:migrate` on release.
- Set `APP_BUILD` to the commit sha so PDF stamps identify the build.
- Schedule `npm run db:purge` (daily is plenty) to honour quote retention.
- Sessions are httpOnly cookies, `Secure` in production, and expire after 10 hours.
- The app is `noindex, nofollow` until the marketing site exists.
