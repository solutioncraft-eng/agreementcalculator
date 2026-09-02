---
title: Changing the pricing schedule
summary: Pricing versions — why they are immutable, how to create a draft, what to change and how to publish.
order: 70
---

## Why versions

A **pricing version** is a snapshot of everything that determines a price: the model settings, the offerings, the COGS items and their costs, and the bundle discount table. Published versions are **immutable**. Every quote and every exported PDF records the version it was priced against, so a document from last year can always be explained by the schedule that was in force.

That is why you never edit prices in place. To change anything you create a new **draft**, edit the draft, and **publish** it. The previous published version is archived automatically.

| Status | Editable | Used by the Calculator |
| --- | --- | --- |
| **Draft** | Yes | No |
| **Published** | No | Yes — exactly one at a time |
| **Archived** | No | No, but still referenced by old quotes and exports |

## Who can do this

:::role ADMIN
Everything on this page is done under **Settings → Pricing** by an administrator. Account managers and leaders can see which version is published from the Calculator and from any quote, but cannot change it.
:::

## Step 1 — create a draft

On **Settings → Pricing**, press **Create a new draft**. The new draft is a full copy of the current published version — settings, offerings, items and bundles — so you only need to change what is different. There is one working draft at a time: if a draft already exists the button reads **Open the working draft** instead.

Open the draft to reach the version editor. The editor has four sections, described below.

## Step 2 — label the version

At the top, set a **Version label** (for example `2026-Q4`) and a **Cost basis** — a short description of where the costs came from, such as `Vendor price lists, September 2026`. Both are printed on the PDF stamp, so make them meaningful to somebody reading the document later. **Notes** are for your own record.

## Step 3 — adjust the pricing settings

The same form holds the model settings — labor multiplier, default and maximum service gross margin, minimum per-user floor and add-on multiplier on a cost-plus workspace; default markup, minimum markup, minimum per-user floor, maximum discount and add-on markup on a markup workspace. See [Pricing models](/help/guide/pricing-models) for what each does. Press **Save pricing settings**.

## Step 4 — update offerings and COGS items

In **Offerings**, rename, reorder, add or remove the products you sell and choose which COGS items each carries. In **COGS items**, add new tools, change unit costs, switch an item's unit basis or deactivate items you no longer pay for. The full detail is in [COGS catalogue and offerings](/help/guide/cogs-and-offerings).

## Step 5 — update bundle discounts

In **Bundle discounts**, add, edit or remove the bundles the Calculator offers. See [Bundle discounts](/help/guide/bundle-discounts).

## Step 6 — publish

Press **Publish** at the top of the editor (the button carries the version label). Publishing is refused, with a message telling you why, if:

- the version has no offerings;
- the version has no active COGS item;
- an active item is not carried by any offering in this version;
- an offering builds on a parent that this version does not define, or a chain of parents loops.

On success the draft becomes **Published**, the previous published version becomes **Archived**, and the Calculator switches to the new numbers for every account manager immediately. Quotes already submitted stay pinned to the version they were priced with.

:::warning
Publishing is permanent. Review the version editor from top to bottom first — once published, the only way to correct a mistake is another draft and another publish.
:::

## Everything is audited

Creating, saving, publishing and archiving versions, and every offering, item and bundle change, is written to the audit log with who did it and what changed.
