---
title: COGS catalogue and offerings
summary: The tools you pay for, how they are allocated to the offerings you sell, and how parent and child offerings work.
order: 80
---

## The two lists

A pricing version has two connected lists:

- **COGS items** — cost of goods sold: every tool, licence or service you pay a vendor for, with a unit cost and a unit basis.
- **Offerings** — the agreements you sell to clients (for example *Parent Agreement*, *Co-Managed Agreement*). Each offering carries a set of COGS items; its tool cost is the sum of those items for the environment being quoted.

Both live inside a pricing version, so changing either means a new draft — see [Changing the pricing schedule](/help/guide/pricing-versions).

## COGS items

Each item has:

| Field | Meaning |
| --- | --- |
| **Item** | Its name as shown in the internal COGS PDF and the version editor |
| **Vendor** | Who you pay |
| **Unit cost $** | Monthly cost per unit |
| **Unit basis** | *Per user*, *Per device*, *Per location* or *Flat per agreement* — what the unit cost is multiplied by |
| **Active** | Inactive items stay in the version for the record but contribute nothing to price |

The Calculator multiplies each item by the matching environment figure: a $4 per-device item in a 120-device environment costs $480 a month; a flat item costs the same regardless of size. Everything is then expressed per user for the headline rate.

## Offerings

Each offering has an **Offering name**, a **One-line description** shown in the Calculator, an ordering, and either:

- **Standalone** — it carries only the items you tick under *Which COGS items does it carry?*; or
- **Builds on** another offering — it inherits every item its parent carries and adds the items you tick. Inherited items appear in the checklist greyed out and marked *Inherited from …*; only the items the parent does not already carry can be ticked. The inherited items are priced with the main lever; the added items are priced with the add-on multiplier or add-on markup.

An offering with no items of its own is allowed: it sells its parent's stack under another name and price point. The editor shows each offering's *own* and *inherited* item counts, and each item shows which offerings carry it.

## Offering names matter

A new workspace starts with generic names (Parent Agreement, Add-On Agreement, Co-Managed Agreement). They appear everywhere — the Calculator, quotes, both PDFs — so rename them to your own product names while the first draft is still editable.

## Maintaining the catalogue

:::role ADMIN
Under **Settings → Pricing**, open a draft:

1. In **COGS items**, add a new item with its vendor, unit cost and unit basis, or open an existing one to change the cost. Deactivate rather than delete an item you have stopped paying for if older documents should still be explainable.
2. In **Offerings**, add or edit an offering, choose whether it stands alone or builds on another, and tick the items it carries. Use the arrows to set the order the Calculator shows them in.
3. Publish. Publishing checks that every active item is carried by at least one offering and that every parent exists.
:::

## Reading the internal COGS PDF

The internal COGS worksheet lists every item an offering carries, marks which are inherited from a parent and which are add-ons, shows the monthly cost of each for the environment, the labor or markup applied, the floor, the discount and the achieved margin. It is the document to use when a leader asks how a rate was built.
