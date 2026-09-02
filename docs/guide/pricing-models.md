---
title: Pricing models
summary: How cost-plus and markup-multiple turn tool cost into an agreement rate, and which settings drive each.
order: 60
---

## One model per workspace

Every workspace prices with one of two models. The model is chosen when the workspace is created and can only be changed by an operator (through **Help → Support & requests**). It decides which pricing lever the Calculator shows, which settings a pricing version carries and which choices trigger review. Both are documented below; the one this workspace uses is highlighted.

## What the models share

Whichever model you use:

- **Tool cost** is the only real dollar figure. It is the sum of the active COGS items an offering carries, each multiplied by the environment (users, devices, locations, or flat).
- **Offerings** can build on one another. A child offering includes everything its parent carries; the items it *adds* are priced with the add-on setting rather than the main lever.
- A standalone offering can be marked **co-managed** — delivered alongside the client's own IT staff. Its tools, and those of every offering built on it, are priced with the version's co-managed lever instead of the main one, because the imputed labor (or markup) a fully managed agreement carries is too high when the client's team does most of the work.
- Any offering can carry an optional **flat rate**: a price per user, per device, per location and/or a flat amount per month. When set, the sum replaces the model's formula as the offering's standard rate. The cost floor, per-user floor and bundle discounts still apply underneath, and a flat rate below the cost floor is flagged for review with the floor charged.
- The **per-user floor** is the lowest per-user rate the workspace will sell. If a calculated rate lands below it, the floor is charged and the quote is flagged. An offering can carry a **per-user floor of its own** — lower than the version's, or 0 for no floor at all — which is typical for a co-managed offering whose seats cost far less to support. The COGS cost floor still applies to it.
- **Bundle discounts** come off the sell rate, but never below cost. A discount that would breach cost is capped and the quote is flagged.
- The Calculator reports the **achieved gross margin** for each offering so you can see the outcome of any lever setting.

:::model COST_PLUS
## Cost-plus

Labor is imputed as a fixed multiple of tool cost, so **tool + labor** is the hard cost floor. The single pricing lever is the **service gross margin (SGM)**:

`agreementRate = (tool + labor) / (1 − SGM)`

Add-on tools above the base offering are low-touch, so they carry no imputed labor; they are priced with a separate, smaller **add-on multiplier**.

### Version settings

| Setting | Meaning |
| --- | --- |
| **Labor multiplier** (×) | Imputed labor as a multiple of tool cost. `1.0` means labor equals tool cost. |
| **Default service gross margin** (%) | Where the SGM slider starts. Any other value triggers review. |
| **Maximum service gross margin** (%) | The slider cannot go higher than this. |
| **Minimum per-user floor** ($) | Where the per-user floor starts. |
| **Add-on multiplier** (×) | Applied to the tool cost of items an offering adds on top of its parent. |
| **Co-managed labor multiplier** (×) | Imputed labor on the base tools of a co-managed offering. Lower than the labor multiplier, since the client's staff carry part of the work. |

### Worked example

Tool cost $40/user, labor multiplier 1.0 → cost floor $80/user. At the default 30% SGM, `80 / (1 − 0.30)` = **$114.29/user**. Sliding the SGM to 25% gives $106.67 and flags the quote because the margin is off default.

### What triggers review

SGM off default, add-on multiplier off default, per-user floor changed, an offering below the floor, the floor override, a bundle discount capped at cost, or a flat rate below the cost floor.
:::

:::model MARKUP_MULTIPLE
## Markup multiple

The simplest thing an MSP can price on: sell at a multiple of tool cost.

`agreementRate = tool × markup`

There is no imputed labor and no margin to solve for, so the cost floor is raw tool cost. Review is driven by how far the account manager dials the multiple below the default, and by discounting past the maximum.

### Version settings

| Setting | Meaning |
| --- | --- |
| **Default markup** (×) | Where the markup field starts. Anything lower triggers review; higher does not. |
| **Minimum markup before review** (×) | Below this the quote is flagged as under the minimum. |
| **Minimum per-user floor** ($) | Where the per-user floor starts. |
| **Maximum discount** (%) | A bundle that discounts more than this is flagged. |
| **Add-on markup** (×) | Applied to the tool cost of items an offering adds on top of its parent. Fixed per version; not editable in the Calculator. |
| **Co-managed markup** (×) | Applied to the base tools of a co-managed offering instead of the Calculator's markup. Fixed per version. |

### Worked example

Tool cost $40/user, default markup 2.5× → **$100/user**, of which 40% is tool cost and 60% margin. Dropping the markup to 2.2× gives $88 and flags the quote as below default; dropping to 1.8× when the minimum is 2.0× flags it as below minimum.

### What triggers review

Markup below default, markup below minimum, discount over maximum, per-user floor changed, an offering below the floor, the floor override, a bundle discount capped at cost, or a flat rate below the cost floor.
:::

## Changing the settings

:::role ADMIN
Settings belong to a pricing version. Create a draft under **Settings → Pricing**, change the numbers in the **pricing settings** form, save, and publish. See [Changing the pricing schedule](/help/guide/pricing-versions).
:::
