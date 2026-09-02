---
title: Exporting PDFs
summary: The two documents, when each is allowed, and what the stamp on every page means.
order: 50
---

## Two documents

| Document | Audience | Contents |
| --- | --- | --- |
| **Agreement PDF** | The client | Offering name, per-user rate, monthly total for the environment, bundle applied, your branding and PDF footer, notes |
| **Internal COGS PDF** | Your team only | Every COGS item and its cost for this environment, the labor or markup applied, floor, discount and the achieved gross margin |

Both are generated on the server from the same inputs, so they always agree with each other.

:::warning
The internal COGS PDF exposes your vendor costs and margin. It is titled *Internal COGS worksheet* and should never leave the company.
:::

## When export is allowed

- **From the Calculator** — when the results panel shows no triggers. Both export buttons are live. If anything is flagged both are disabled and the primary button becomes **Submit for leadership review**.
- **From a quote page** — when the quote's status is **Approved**. Open it under **Quotes** and export from there. Pending, changes-requested, denied and withdrawn quotes say *Export stays locked until a leader approves this quote*.

Export also requires the workspace to be in good standing (trial, subscription or complimentary access). If the workspace has lapsed, export is refused and the attempt is logged.

## Choosing the offering

Exports are per offering. Select the offering tab you want in the results panel before pressing export; the PDF prices that offering only.

## The stamp

Every page carries a stamp with:

- an **export ID** you can quote back to the audit log;
- the **timestamp** (UTC);
- the **application build** that generated it;
- the **pricing version** label and cost basis it was priced against;
- the **approval state** — *standard pricing* or the quote reference and who approved it.

The export is also recorded in the **export registry** with a checksum and the inputs needed to reproduce the document, and visible to administrators under **Settings → Audit log → Recent PDF exports**. The registry holds no calculated result, only what is needed to recompute it.

## Troubleshooting

- **Button disabled** — check the results panel for triggers; clear them or submit for review.
- **"Export stays locked"** on a quote — the quote is not approved yet. Ask a leader, or check Reviews if you are one.
- **Nothing downloads** — allow pop-ups and downloads for the site, then try again. The audit log will show whether the export was recorded.
