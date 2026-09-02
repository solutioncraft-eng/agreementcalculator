---
title: Bundle discounts
summary: Offering a percentage off when a client takes more than one service, and why a discount can never sell below cost.
order: 90
---

## What a bundle is

A **bundle discount** is a named percentage the account manager can apply when a client buys the agreement alongside another service — VoIP, a project, hardware. Bundles are part of the pricing version, so the discounts available in the Calculator are exactly the ones your administrator published.

Each bundle has a **Key** (short identifier such as `voip`), a **Label** shown in the Calculator, an optional **Description** and a **Discount %**. A workspace always has a *None* option at 0%.

## How the discount is applied

The discount comes off the agreement rate after the pricing lever has been applied. It is never allowed to sell below cost:

- On a **cost-plus** workspace, cost is tool + imputed labor.
- On a **markup** workspace, cost is raw tool cost.

If the discount would take the rate under that cost, the rate is capped at cost and the quote is flagged *Discount capped at cost*. On a markup workspace a bundle whose percentage exceeds the version's **Maximum discount** is flagged *Discount over maximum* whenever it is selected.

## In the Calculator

Choose one bundle under **Bundle**. The right-hand panel shows the discounted rate and the achieved margin so you can see what the bundle costs you before committing.

## Managing bundles

:::role ADMIN
Under **Settings → Pricing**, open a draft and go to **Bundle discounts**. Add a bundle with its key, label, description and percentage, edit an existing one or remove it, then publish. Published bundles cannot be edited — see [Changing the pricing schedule](/help/guide/pricing-versions).
:::
