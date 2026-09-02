---
title: Billing and trials
summary: The 14-day trial, the subscription, what happens when it lapses, and how to manage invoices and cards.
order: 120
---

## The trial

A self-serve workspace starts with a **14-day trial** and no card. Everything works during the trial. The days remaining are shown in the header for administrators.

## After the trial

To keep working, a workspace needs one of:

- an active **subscription** — one flat monthly price per company, unlimited people;
- **complimentary** access granted by an operator;
- a recently failed payment still inside its **7-day grace window**.

Otherwise every member lands on a *trial ended* page. Administrators are offered **Subscribe** there; other members are asked to contact their administrator. PDF export is also refused while the workspace has lapsed, and the refusal is logged.

## Subscribing and managing billing

:::role ADMIN
Open **Settings → Billing**. The page shows the workspace's status, trial or renewal date and, where relevant, the complimentary end date.

- **Subscribe** opens a secure checkout page to enter a card. You are returned to the application when done; the subscription is recorded when the payment provider confirms it.
- **Manage billing** opens the billing portal: change the card, download invoices and receipts, or cancel. Cancellation takes effect at the end of the paid period.

Billing is handled entirely by the payment provider; Agreement Calculator never sees card numbers. If the Subscribe button says card payment is not switched on, your deployment is not connected to a payment provider — contact support.
:::

## Failed payments

If a renewal fails you have 7 days from the first failure to fix the card in the billing portal. During that window the workspace keeps working. Once a payment succeeds the grace period clears.

## Complimentary access

Operators can make a workspace complimentary, with an optional end date. Billing shows *Complimentary until* in that case. Ask through **Help → Support & requests** if you believe your workspace should be complimentary.

## What is audited

Checkout starts, billing portal visits, subscription changes, cancellations, failed payments, complimentary grants and trial resets are all written to the audit log.
