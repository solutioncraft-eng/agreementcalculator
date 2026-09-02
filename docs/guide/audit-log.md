---
title: Audit log
summary: The append-only record of who did what, and the registry of every PDF exported.
order: 130
---

## Two registers

:::role ADMIN
**Settings → Audit log** shows two tables. Both are append-only: nothing can be edited or removed from them from within the application.
:::

### Audit log

Every significant action, newest first, with **When**, **Action** and **Detail** — who did it, what changed (before and after where relevant) and which record it concerned. Actions include:

| Area | Examples |
| --- | --- |
| Sign-in | Sign-in, failed sign-in, sign-out, password change and reset, workspace switch |
| People | Member added, role changed, removed; password reset; welcome email resent |
| Pricing | Draft created, settings saved, offering / COGS item / bundle changed, version published, archived or deleted |
| Quotes | Submitted, approved, changes requested, denied, withdrawn, commented, purged |
| Exports | PDF exported; PDF export blocked |
| Workspace | Branding updated; billing checkout, portal, subscription and complimentary changes |
| Help | Support and enhancement requests sent |

### Recent PDF exports

The **export registry**: one row per generated document with its **Export ID**, **Type** (agreement or internal COGS), **Client**, **Pricing** version, **Approval** state, **Checksum** and **When**. The registry stores the inputs needed to regenerate the document but not the calculated result — the number is always reproducible from the immutable pricing version.

## Using it

- **A client questions a quote** — find the export ID on the PDF stamp, look it up in Recent PDF exports, and you have who exported it, when, against which pricing version and under which approval.
- **A price looks wrong** — filter the audit log for version and item changes to see when and by whom the schedule changed.
- **A quote was approved that should not have been** — the quote's decisions are in the log with the reviewer's note.

## What is not stored

Ordinary calculations never touch the database and leave no trace. Only submissions for review, decisions and exports are recorded. Submitted quotes are purged after the workspace's retention period (12 months by default); their audit entries remain.
