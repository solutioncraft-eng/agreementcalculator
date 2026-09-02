---
title: Creating a quote
summary: The Calculator screen, field by field, and what happens when you export or submit.
order: 30
---

## Before you start

The calculator prices against the workspace's **current published pricing version**. If there is none yet you will see *No published pricing version* and an administrator needs to publish one first — see [Changing the pricing schedule](/help/guide/pricing-versions).

Nothing you type on the Calculator screen is stored unless you submit it for review. You can experiment freely.

## Step 1 — describe the environment

Under **Environment**, enter the prospect's size:

- **Users** — people who will be covered by the agreement. Most tool costs and the agreement rate are expressed per user.
- **Devices** — endpoints under management. Per-device COGS items scale with this number.
- **Locations** — sites. Per-location items scale with this number.

Each COGS item in the catalogue is priced per user, per device, per location or flat per agreement, so all three numbers matter even though the headline rate is per user.

## Step 2 — set the pricing lever

The middle section depends on which pricing model your workspace uses. Both are described here; the one this workspace uses is highlighted.

:::model COST_PLUS
The section is titled **Service gross margin**. The rate is solved from cost: `agreementRate = (tool + labor) / (1 − SGM)`, where labor is a fixed multiple of tool cost set by your administrator. The slider starts at the workspace default. Moving it off the default — in either direction — flags the quote for review. It cannot exceed the workspace maximum.
:::

:::model MARKUP_MULTIPLE
The section is titled **Markup on tool cost**. The rate is `agreementRate = tool × markup`. The field starts at the workspace default markup. Setting it *below* the default flags the quote for review; setting it below the workspace minimum is flagged more strongly. Raising it above the default does not require review.
:::

## Step 3 — check the pricing floors

Under **Pricing floors**:

- **Per-user floor** — the lowest per-user rate the workspace will sell at. It starts at the workspace minimum. If a tier's calculated rate falls below the floor, the floor is charged instead and the quote is flagged. Changing the floor itself is also flagged.
- **Add-on multiplier** (cost-plus) or **Add-on markup** (markup) — how tools that an offering *adds* on top of its parent are priced. Only editable on cost-plus workspaces; changing it is flagged.
- **Show the calculated rate even when it falls below the floor** — a checkbox that turns the floor off so the true below-floor rate is used. This is always flagged.

Any field that differs from policy is outlined in amber so you can see at a glance why a quote will need review.

## Step 4 — choose a bundle

Under **Bundle**, pick one of the bundle discounts defined by your administrator — for example *None* or *VoIP + managed services −5%*. The discount is applied to the rate but never below cost; if the discount would take the rate under cost it is capped there and the quote is flagged.

## Step 5 — read the result

The right-hand panel shows every offering in the published version with its per-user rate, the monthly total for this environment and the underlying cost. Use the offering tabs to compare, and note the actual gross margin each achieves.

If the panel says **This configuration falls outside standard pricing**, it lists exactly which choices tripped a review. You can adjust the inputs to clear them, or submit for review.

## Step 6 — client and output

Under **Client and output**:

- **Client name** — printed on the PDF and used as the quote's name in Quotes and Reviews. Required.
- **Notes for the PDF / reviewer** — optional. On an exported agreement these appear on the document; on a submitted quote the reviewer reads them.

Then either:

- **Export agreement PDF** — available when nothing is flagged. Downloads the client-facing document immediately.
- **Export internal COGS PDF** — the confidential cost breakdown. Also blocked while anything is flagged.
- **Submit for leadership review** — replaces the export button when the quote is flagged. Creates a quote request, emails the leaders, and takes you to the quote's page.

:::tip
The internal COGS PDF shows your tool costs and margin. Never send it to a client — use the agreement PDF for that.
:::

## After you submit

Your submitted quote appears under **Quotes** with a reference like `QR-2026-09-3F2A`, its status and the review thread. See [How approvals work](/help/guide/approvals) for what happens next.
