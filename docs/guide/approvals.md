---
title: How approvals work
summary: What flags a quote, how leaders decide, and how the account manager gets the PDF afterwards.
order: 40
---

## The principle

The published pricing version is policy. A quote that stays inside it exports straight away. A quote that departs from it **cannot be exported** until a leader has approved those exact numbers. The application enforces this: the export buttons are disabled, and the export API re-checks the approval state even if somebody calls it directly.

## What flags a quote

The calculator lists every reason in the results panel. The full set:

| Trigger | Model | What it means |
| --- | --- | --- |
| Service gross margin off default | Cost-plus | The SGM slider is not at the workspace default |
| Add-on multiplier off default | Cost-plus | The add-on multiplier was changed |
| Markup below default | Markup | The markup is under the workspace default |
| Markup below minimum | Markup | The markup is under the workspace minimum before review |
| Discount over maximum | Markup | The chosen bundle discounts more than the workspace allows |
| Per-user floor changed | Both | The floor was edited from the workspace minimum |
| Tier below floor | Both | An offering's calculated rate is below the floor, so the floor rate is applied |
| Floor overridden | Both | The *show the calculated rate* box is ticked, so a below-floor rate is in use |
| Discount capped at cost | Both | The bundle discount would have sold below cost and was capped |

Raising the price — a higher margin, a higher markup — is never flagged.

## The lifecycle

1. **Submitted** — the account manager submits. A `QuoteRequest` is created holding the inputs, the pinned pricing version, the computed rates and the notes. Leaders are emailed. Status: **Pending**.
2. **Decided** — a leader opens the quote from **Reviews** and chooses an action (below). The account manager is emailed the decision and the note.
3. **Exported** — once **Approved**, the account manager opens the quote under **Quotes** and exports the agreement PDF and internal COGS PDF from there. The PDFs carry the approval on their stamp.

Quotes are pinned to the pricing version they were priced with. Publishing a new version later does not change or invalidate an approved quote.

## Deciding a quote

:::role LEADER ADMIN
Open **Reviews**. Pending quotes are listed first; decided ones follow. Open a quote to see the environment, the pricing lever settings, every trigger, the per-offering breakdown with cost and achieved margin, the account manager's notes and the review thread so far. Then choose:

- **Approve** — unlocks PDF export at exactly these numbers. A note is optional.
- **Recommend changes** — sends the quote back with your note. The AM cannot export; they return to the Calculator, adjust, and submit a fresh quote.
- **Deny** — closes the quote. A note is required so the AM knows why.
- **Comment only** — adds to the thread without changing the status. Useful for a question.

Every decision is emailed to the account manager and written to the audit log.
:::

## Withdrawing a quote

The account manager who submitted a quote — or an administrator — can **withdraw** it while it is pending or has changes requested. Approved quotes cannot be withdrawn; denied quotes are already closed.

## After "changes requested"

There is no in-place edit. Go back to the **Calculator**, make the change the leader asked for and submit again. The new quote gets its own reference; the old one stays in your Quotes list for the record.

## Retention

Submitted quotes are kept for the workspace's retention period (12 months by default) and then purged. The audit log entry that records the submission and decision is kept.
