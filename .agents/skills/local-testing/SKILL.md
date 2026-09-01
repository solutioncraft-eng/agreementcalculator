---
name: local-testing
description: How to stand up Agreement Calculator locally (own Postgres, .env, migrations, seed) and drive end-to-end tests of signup, trials, tenants and exports without touching the production Supabase project.
---

# Local end-to-end testing — Agreement Calculator

Next.js 15 App Router + Prisma + Postgres, multi-tenant (tenant per subdomain).
The repo ships only `.env.example`; there is **no** local database and no committed `.env`.

## Never point local runs at production

Do not put the production Supabase URL in `.env` for testing. Even read-only sessions
risk writes via Prisma migrations, `db:seed`, and the signup/provisioning flow, which
create tenants and users. Always stand up a throwaway local Postgres.

## Bring up a local stack

```bash
# Local Postgres (apt cluster already present on Devin boxes; start it if needed)
sudo pg_ctlcluster <version> main start || true
sudo -u postgres psql -c "DROP DATABASE IF EXISTS agreementcalculator"
sudo -u postgres psql -c "DROP ROLE IF EXISTS calc"
sudo -u postgres psql -c "CREATE ROLE calc LOGIN PASSWORD 'password' SUPERUSER"
sudo -u postgres psql -c "CREATE DATABASE agreementcalculator OWNER calc"
```

`.env` (local only, never commit):

```
DATABASE_URL="postgresql://calc:password@localhost:5432/agreementcalculator?schema=public"
DIRECT_URL="postgresql://calc:password@localhost:5432/agreementcalculator?schema=public"
AUTH_SECRET="any-long-random-string-at-least-32-chars"
APP_BASE_URL="http://localhost:3000"
APP_ROOT_DOMAIN="localhost"
```

`DATABASE_URL` and `DIRECT_URL` can be the same locally — the split only matters for
Supabase's pooled (:6543) vs direct (:5432) endpoints.

```bash
npx prisma migrate deploy      # or: npx prisma db push
npm run db:seed                # optional: demo workspace + admin for login regressions
npm run dev > /tmp/dev.log 2>&1 &
```

`APP_ROOT_DOMAIN=localhost` makes `http://localhost:3000/` the **product/marketing**
host, so `/` and `/signup` are reachable. A workspace host would be
`http://<slug>.localhost:3000`, which redirects to `/login`. If you unexpectedly get
`/login` instead of the marketing page, you are on a workspace host, not the root domain.

Email is unconfigured by default; welcome mail no-ops and does not break signup. Do not
treat a missing SMTP/Resend config as a failure.

## Getting a usable account

Two independent paths — pick based on what you are testing:

- **Self-serve signup** at `/signup` (password must be ≥12 chars). This provisions
  tenant + admin user + ADMIN membership + a DRAFT pricing version with seeded
  COGS/bundles in one transaction, signs you in, and lands on `/admin/pricing`.
- **Seeded/operator workspace** via `npm run db:seed`, then sign in at `/login`. Check
  `prisma/seed.ts` for the current demo credentials rather than assuming them.

To reach the operator portal `/super`, promote yourself in psql:

```sql
UPDATE "User" SET "isSuperAdmin" = true WHERE email = '<your email>';
```

Re-login (or reload) after flipping this; the nav gains a "Super-admin" link.

## Driving tenant/trial state from psql

Trial and status live on `Tenant`. Useful manipulations:

```sql
-- expire a trial (gated routes should redirect to /trial-ended)
UPDATE "Tenant" SET "trialEndsAt" = now() - interval '2 days' WHERE slug = '<slug>';
-- restore a healthy trial (banner shows "Trial N days left")
UPDATE "Tenant" SET status='TRIAL', "trialEndsAt" = now() + interval '14 days' WHERE slug='<slug>';
-- bypass trial entirely
UPDATE "Tenant" SET status = 'ACTIVE' WHERE slug = '<slug>';
```

`status='ACTIVE'` overrides a past `trialEndsAt`, so to test expiry keep the tenant in
`TRIAL`. Changes take effect on the next request — just reload the page, no restart and
no re-login needed.

## Schema names that are easy to get wrong

Verify with `\d "<Table>"` / `\dt` before writing queries. Known gotchas:

- COGS rows join a pricing version through **`versionId`** (not `pricingVersionId`).
- The bundle table is **`BundleDiscount`** (there is no `Bundle`).

Provisioning integrity check after a signup:

```sql
SELECT t.slug, t.status, t."trialEndsAt", u.email, m.role,
       v.label, v."publishedAt",
       (SELECT count(*) FROM "CogsItem" c WHERE c."versionId" = v.id)      AS cogs,
       (SELECT count(*) FROM "BundleDiscount" b WHERE b."versionId" = v.id) AS bundles
FROM "Tenant" t
JOIN "Membership" m ON m."tenantId" = t.id
JOIN "User" u ON u.id = m."userId"
JOIN "PricingVersion" v ON v."tenantId" = t.id
WHERE t.slug = '<slug>';
```

For "no partial writes" assertions, snapshot `count(*)` of `Tenant`, `User`,
`Membership` and `PricingVersion` before the invalid attempts and re-check after.

## Testing client- vs server-side validation

Some form rules are enforced twice. The password field carries HTML `minLength={12}`, so
a short password never reaches the server — the browser shows a native tooltip and no
`POST /signup` appears in the dev log. To prove the **server** rule too, temporarily
delete the `minLength` attribute from `src/app/signup/signup-form.tsx`, let the dev
server hot-reload, submit, observe the server error text, then revert and confirm with
`git diff` that the tree is clean. Prefer this over devtools so the recording still
shows a normal form submit.

Counting `POST /signup` lines in the dev log distinguishes real server rejections
(`200`, form re-rendered with an error) from a successful signup (`303` redirect) and
from client-blocked attempts (no line at all):

```bash
grep -n "POST /signup" /tmp/dev.log
```

## Operator tooling (`/super`) — billing, comp and the people directory

The operator page keeps its billing controls in a **collapsed `<details>` "Billing & trial"**
panel per workspace row, so expand the row first. Which buttons render depends on state:
End comp/Update comp only when the tenant is `COMPLIMENTARY`, the Stripe cancel buttons only
when `Tenant.stripeSubscriptionId` is set, Activate only on `TRIAL`.

Useful fixtures (all via psql, effective on next request):

```sql
-- expired trial with nothing to fall back on
UPDATE "Tenant" SET status='TRIAL', "trialEndsAt"=now()-interval '2 days',
  "subscriptionStatus"=NULL, "stripeSubscriptionId"=NULL WHERE slug='<slug>';
-- make the cancel buttons render without real Stripe
UPDATE "Tenant" SET "stripeSubscriptionId"='sub_fake_local_123' WHERE slug='<slug>';
-- simulate a live subscription (reset-trial should refuse) / a lapsed one (reset allowed)
UPDATE "Tenant" SET "subscriptionStatus"='active'   WHERE slug='<slug>';
UPDATE "Tenant" SET "subscriptionStatus"='canceled' WHERE slug='<slug>';
-- dunning: blocked until grace is extended
UPDATE "Tenant" SET "subscriptionStatus"='past_due', "graceEndsAt"=now()-interval '1 day'
  WHERE slug='<slug>';
-- expired comp (should yield to a healthy subscription, else block)
UPDATE "Tenant" SET "compExpiresAt"=now()-interval '1 day' WHERE slug='<slug>';
```

An **orphan account** (in the people directory, no workspace) is easy to create with a small
script inside the repo so `bcryptjs` resolves — a script placed in `/tmp` cannot require the
repo's node_modules. Delete it afterwards.

To test the isolation rule, demote a workspace admin with
`UPDATE "User" SET "isSuperAdmin"=false WHERE email='<member>'` — their nav loses the
Super-admin link and a direct visit to `/super` redirects to `/calculator?denied=1`.
Use a separate browser window (e.g. incognito) for the member so the operator session stays
signed in.

### Stale-tab technique for server-side guards

To exercise server-side refusals (published-version immutability, foreign offering keys,
"is not complimentary") without curl or devtools: open the same page in two tabs, change the
state in tab A, then click the now-invalid button in the stale tab B. The action refuses with
the real server message and the recording still shows normal UI clicks.

### Email must be unconfigured on purpose

`emailConfigured` is derived from `RESEND_API_KEY` / `SMTP_HOST` in the **process**
environment, not just `.env` — a Devin box may already export `RESEND_API_KEY`, in which case
operator "Reset password"/"Resend welcome" will attempt a **real outbound email** to your
fixture address. Start the dev server with them stripped:

```bash
env -u RESEND_API_KEY -u SMTP_HOST -u SMTP_USER -u SMTP_PASSWORD npm run dev > /tmp/dev.log 2>&1 &
```

Then the UI shows the intended handover path: `Email is not configured — hand this temporary
password to <email> securely.` plus a one-time `Temporary password:` value. Prefer
`@example.com`-style fixture addresses regardless.

After a reset the account has `mustReset=true` and any `(app)` route bounces to
`/account/password` ("First sign-in"); audit rows (`PASSWORD_CHANGED`,
`WELCOME_EMAIL_RESENT`) should carry the **operator** as `actorId`, which is worth checking in
psql since the UI does not show the actor.

## Marketing pages and SEO surfaces

`APP_BASE_URL` and `APP_ROOT_DOMAIN` are not optional for this: every canonical, Open
Graph URL, sitemap entry and JSON-LD `@id` is built from `siteUrl()` in `src/lib/seo.ts`,
so without them they resolve against a guessed localhost origin and comparisons are
meaningless. Surfaces worth checking, all plain HTTP fetches:

- `/robots.txt` — on the root host: `Allow: /`, `/signup`, the private paths disallowed,
  plus `Sitemap:` and `Host:`. On a workspace host (`demo.localhost:3000`) it must be
  exactly `User-Agent: *` + `Disallow: /`.
- `/sitemap.xml` — `/` and `/signup` with absolute URLs on the root host, an empty
  `<urlset>` on a workspace host.
- `/opengraph-image` — a generated 1200×630 PNG; open it in the browser to check for
  clipped text or missing-glyph boxes (the copy uses `·` middots).
- The landing `<head>` — one `application/ld+json` script whose `@graph` parses, and
  `robots: index, follow`. Authenticated routes must still emit `noindex, nofollow`:
  that boundary is the thing worth regression-testing, not the copy.

The landing FAQ is rendered from the same exported `FAQ` array that feeds the `FAQPage`
schema, so assert the visible `<dt>` strings are string-equal to
`FAQPage.mainEntity[].name` — schema describing text a visitor cannot see is a Google
guideline violation.

## Reaching a real mobile CSS viewport

Chrome on these boxes will not resize below ~532 px, so a true 390 px viewport comes from
zoom rather than device emulation: size the window to `target_width * 1.5 + ~32` px with
`wmctrl -r :ACTIVE: -e 0,<x>,<y>,<W>,<H>`, press `ctrl+equal` three times (150 %), and
confirm with `window.innerWidth === 390`. Height is then shorter than a real phone
(~647 CSS px), which over-constrains vertical layout rather than under-testing it. Assert
no horizontal overflow with `document.documentElement.scrollWidth === clientWidth`.

## Pricing drafts: offerings, COGS membership and the cost readout

The draft editor lives at `/admin/pricing/<versionId>`. Offerings are per-version rows with
an optional `parentKey`; COGS items are joined to offerings many-to-many through
`CogsItemTier.tierKey`, so an item can be carried by several offerings at once. When
checking the editor's per-offering cost figures, the reference quantities are fixed
(**25 users / 30 devices / 2 locations**), so `Own cost` is
`Σ unitCost × {USER:25, DEVICE:30, LOCATION:2, FLAT:1}` over the items the offering carries
itself, and `Included` adds the same over everything inherited through the parent chain.
`Per user` is `Included / 25`. Cross-check chips against durable state in psql:

```sql
SELECT c.key, array_agg(t."tierKey" ORDER BY t."tierKey")
FROM "CogsItem" c LEFT JOIN "CogsItemTier" t ON t."itemId" = c.id
WHERE c."versionId" = '<versionId>' GROUP BY c.key;
```

After switching branches, kill and clear the dev server before restarting, or stale chunks
surface as bogus runtime errors (`X is not defined`, `Cannot find module './vendor-chunks/zod.js'`):

```bash
pkill -f "next dev"; rm -rf .next
env -u RESEND_API_KEY -u SMTP_HOST -u SMTP_USER -u SMTP_PASSWORD npm run dev > /tmp/dev.log 2>&1 &
```

`Publish` on a draft is a single click with **no confirmation** and is irreversible — publish
only when the assertions that need a draft are done.

## Calculator, quote review and the stamped-export gate

The full customer path is: `/signup` → `/admin/pricing/<id>` (draft) → Publish →
`/calculator` → **Submit for leadership review** → `/reviews/<id>` as a LEADER →
`/quotes/<id>` → **Export agreement PDF**. `/calculator` is unusable until a version is
published, so publish before testing quoting.

Pricing arithmetic is driven by `src/lib/pricing/models/cost-plus.ts` and is worth
computing by hand to check displayed values:

```
tool(u,d,l) = Σ unitCost × qty for the offering's own + inherited items
hard cost floor = tool × (1 + laborMultiplier)
standard rate   = tool × (1 + laborMultiplier) / (1 - SGM)
```

Add-on (inherited-through-parent) items are instead priced at `addonMultiplier` with no
imputed labor, which is why a child offering is not simply `parent + own × standard`.
Two clamps stack, in order, and both are visible as cost-build lines:

- a bundle discount is **capped at the hard cost floor** (`(capped at cost)` line +
  `DISCOUNT_CAPPED_AT_COST` trigger). Force it with a low SGM (e.g. 10 %) plus the largest
  discount — at low SGM the standard multiplier approaches the floor multiplier.
- the **per-user floor** then replaces the rate with `perUserFloor × users` unless
  `Override the per-user floor` is ticked. Raising users while holding devices/locations
  flat (e.g. 100 users / 30 devices / 2 locations) drops every offering below the floor at
  once, which is the cheapest way to trip approval and to land two offerings on an
  *equal* rate.

Any non-default lever (SGM, floor, add-on multiplier, override) or a below-floor/capped
result sets `needsApproval`, which swaps `Export agreement PDF` for
`Submit for leadership review` and disables the COGS export. Because the buttons are
`disabled`, the server-side 403 in `src/app/api/export/route.ts` is not reachable by
normal clicks — assert the UI gate plus durable state instead, and say so.

To get a LEADER without mail: `/admin/users` → add with role `Leader (approver)`; the
temporary password is shown **once, in-app**. Sign the leader in from a separate incognito
window (the admin session stays live), complete the forced first-login password change,
then approve at `/reviews/<id>`. Approval flips `/quotes/<id>` copy from
`Export stays locked until a leader approves this quote.` to
`Approved — exports are unlocked…` and enables both buttons.

Durable cross-checks after exporting (note the column names, they are easy to guess wrong:
`QuoteRequest.ref`, `requestedTierKey`, `tierRates`; `ExportRecord.quoteId`;
`QuoteReview.actorId`/`action`; `AuditEvent.summary`, no `metadata` column):

```sql
SELECT ref, status, triggers::text, "tierRates"::text FROM "QuoteRequest" WHERE ref='QR-…';
SELECT er."exportId", er."approvalState", left(er.checksum,16)
FROM "ExportRecord" er JOIN "QuoteRequest" q ON q.id=er."quoteId" WHERE q.ref='QR-…';
SELECT action, summary, "entityId" FROM "AuditEvent" WHERE action='PDF_EXPORTED';
```

The `sha256` prefix in the on-page **Export log** should equal the `ExportRecord.checksum`
prefix, and the PDF's page-2 `APPROVAL` block should name the approver and role.

### Rate-presentation defects to re-check in this area

These were all live on `main` at some point; some are fixed, some may regress. Verify each
by observation rather than trusting the changelog.

- `QuoteRequest.triggers` is a plain `text[]` that can contain the **same code repeated**
  (three `TIER_BELOW_FLOOR` when three offerings are below floor). Anything keying React
  list items on the trigger code alone gets duplicate keys, and the live approval panel
  then shows **stale rows from the previous inputs and silently omits new ones**. Keys of
  the form `${code}-${index}` fix it. To exercise it you must drive the row **count** up
  and down live without reloading — e.g. 100 → 25 → 60 users at 30 devices / 2 locations
  gives 3 → 1 → 2 below-floor rows. Then reload and re-enter the final inputs: the two
  panels must be identical.
- When checking for `Encountered two children with the same key` note that the CDP console
  buffer **persists across navigations**, so warnings from pages you visited earlier in the
  session look like current failures. Call `console.clear()`, redo the live sequence, then
  read the console — otherwise you will report a fixed bug as broken.
- The "never advertise a `+$0` upgrade delta when two offerings land on the same rate"
  rule lives in `calculator-client.tsx`; the **PDF export path renders the delta
  independently** (`src/lib/pdf/documents.tsx`), so the two can disagree. Always check the
  exported PDF's *Alternative offerings* block, not only the on-screen cards. A shared
  `ratesDiffer(a,b)` helper in `engine.ts` is the intended single source of truth.
- In `documents.tsx` the sign of an alternative offering's delta may be chosen from the
  **tier index** (`other.index > t.index`) rather than from the actual rate comparison.
  When that is the case a *cheaper* offering that merely sorts later still prints `+$…`.
  Test it deliberately: pick a version where the last-sorted offering is the cheapest
  (e.g. a standalone "Co-Managed" offering) and read every alternative row. Extract with
  `pdftotext -layout` — the intended minus sign is U+2212, which is easy to misread from a
  screenshot but unambiguous in extracted text.

### The hard-cost-floor "lift" is hard to reach through the UI

`applyBundle` in `engine.ts` clamps the discount at zero and `costFloorLift()` reports what
the floor added back when the levers put the standard rate *under* cost; a
`Lifted to the hard cost floor` line then appears in the calculator breakdown and in
**`CogsDocument` only** (so the proof needs *Export internal COGS PDF*, not the agreement
PDF).

Reaching it is the problem. With `devices = 0`, `locations = 0` and an add-on-heavy child
offering the lift needs roughly `addonMultiplier < 0.35`, but every server-side schema
caps it at a minimum of `1`:

- `calcInputsSchema.addonMultiplier` in `src/lib/schemas.ts` — `z.coerce.number().min(1)`
- `costPlusSettingsSchema.addonMultiplier` and `markupSettingsSchema.addonMarkup` in
  `src/lib/pricing/models/index.ts` — also `.min(1)`

The calculator's `onChange` handler accepts a typed `0.20` and renders the lift live, so
the **client shows the feature while the server rejects it**: pressing
*Submit for leadership review* returns a bare `Invalid input` with no field highlighted.
If you need to test the lift end to end (durable quote → approval → COGS PDF), say so and
ask for either a schema change or a seeded fixture; do not conclude the lift renders in the
PDF just because the calculator showed it. A quick way to demonstrate the ceiling: set the
add-on multiplier to exactly `1` and confirm the lift line **disappears** because the
standard rate now clears the floor.

## Known unrelated noise

If `GET /favicon.ico` returns 500 with "A conflicting public file and page file was found
for path /favicon.ico", both `public/favicon.ico` and `src/app/favicon.ico` exist — a
pre-existing packaging issue, not the change under test. It returns 200 on current `main`.

Typing `localhost:3000/` in the omnibox can silently autocomplete to a previously visited
`/login`; if you land on sign-in unexpectedly, check the URL bar before calling it a
redirect bug.

## Verifying signs and special characters in generated PDFs

`src/lib/pdf/theme.ts` sets `fontFamily: "Helvetica"` and the repo calls **`Font.register`
nowhere**. react-pdf's built-in Helvetica is a standard PDF font with **WinAnsi** encoding,
which has **no glyph for U+2212 MINUS SIGN (`−`)**. Any `−` in PDF text therefore renders as
*nothing* — the surrounding text closes up, e.g. an intended `−$937 per month against X.`
prints as `$937per month against X.` (note the missing space, a reliable tell).

Consequences when testing money/delta signs:

- **`pdftotext` silently drops U+2212** (with and without `-enc UTF-8`). An extracted
  `'$937 per month'` does **not** prove the sign is missing, and it does not prove it is
  present either. Never conclude either way from extraction alone.
- Extraction *is* a valid **negative** check: `+` is ASCII and survives, so "no `+` before a
  cheaper offering's amount" is a trustworthy assertion.
- A `−` must be asserted **from pixels**: open the PDF in Chrome, zoom the block, and use the
  `zoom` action. Look for the closed-up space as well as the absent dash.
- ASCII hyphen-minus `-` renders fine in the same font (bundle discount lines like
  `-$279.30` display correctly), so the fix for a missing minus is to use ASCII `-` or to
  `Font.register` a Unicode TTF.

`tests/pdf-glyphs.test.ts` now fails on any character in `src/lib/pdf/` that WinAnsi cannot
draw, so a regression here shows up in `npm test` rather than in a rendered PDF.

To find every at-risk site: `grep -rn $'\u2212' src`. Sites under `src/lib/pdf/` are broken;
the same character in browser-rendered components (e.g. `calculator-client.tsx`) is fine
because the browser has the glyph. Distinguish these two clearly — a shared sign helper can
be simultaneously correct in the UI and invisible in the PDF.

## Defeating a client-side clamp to test a server-side validation message

Inputs like the calculator's add-on multiplier are clamped in `onChange`
(`clampMultiplier` → `[1, 20]`), so out-of-range values cannot be typed. The value reaches
the server through a **hidden input** whose `value` is React-controlled
(`value={inputs.addonMultiplier}`).

Setting `el.value = '0.2'` from the console and then **clicking** the submit button does
**not** work: React re-renders on the click and restores the controlled value, so the action
receives the clamped number and the submit succeeds. (Easy to misread as "the guard is
missing".)

What works is tampering and submitting **synchronously in one console call**, leaving React
no chance to re-render:

```js
const el = document.querySelector('input[name="addonMultiplier"]');
const form = el.closest('form');
el.value = '0.2';
console.log(new FormData(form).get('addonMultiplier')); // confirm it reads 0.2
form.requestSubmit();
```

Always confirm the FormData value before submitting, and afterwards confirm the rejection was
real by checking nothing persisted:

```sql
select ref, "clientName", status from "QuoteRequest" where "clientName" ilike 'Your Label%';
```

Readable messages come from `schemas.ts` (e.g. `.min(1, "Add-on multiplier must be at least
1× cost.")`) and are surfaced verbatim by `actions.ts` via
`parsed.error.issues[0]?.message` into the `state.error` banner. A bare `Invalid input`
means a schema field has no custom message.

Note the clamp is applied **per keystroke**, so typing `0.2` ends at `1.2` (the `0` clamps to
`1`, then `.2` is appended) rather than `1`. Typing `0` alone gives exactly `1` and `25`
gives `20` — use those for clean bound assertions.

## Browser-driving gotcha: reload keeps scroll position

`F5` on `/calculator` restores the previous scroll offset, so coordinate-based clicks aimed at
the Environment inputs can land on the Bundle radios instead (silently selecting a discount
and changing every rate). After any reload, scroll to top first and re-read the rendered
values before typing.
