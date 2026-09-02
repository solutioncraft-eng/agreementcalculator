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
- A standalone offering can be marked **co-managed** — delivered alongside the client's own IT staff. Its tools, and those of every offering built on it, are priced with the version's co-managed lever instead of the main one. See [Co-managed offerings](#co-managed-offerings) below.
- Any offering can carry an optional **flat rate**: a price per user, per device, per location and/or a flat amount per month. When set, the sum replaces the model's formula as the offering's standard rate. The cost floor, per-user floor and bundle discounts still apply underneath, and a flat rate below the cost floor is flagged for review with the floor charged.
- The **per-user floor** is the lowest per-user rate the workspace will sell. If a calculated rate lands below it, the floor is charged and the quote is flagged. An offering can carry a **per-user floor of its own** — see [Per-offering floor](#per-offering-floor) below.
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

SGM off default, add-on multiplier off default, per-user floor changed, an offering below the floor, the floor override, a bundle discount capped at cost, or a flat rate below the cost floor. The last three are judged on the offering being quoted only — another offering in the version sitting under its floor does not hold up the quote.
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

## Co-managed offerings

A **fully managed** agreement assumes your team does all the work: on cost-plus every dollar of tool cost carries the full imputed labor multiple; on markup the Calculator's markup covers your labor and margin. A **co-managed** agreement is delivered alongside the client's own IT staff, who handle most of the day-to-day. Pricing its tool stack the fully managed way overstates the labor you will actually supply and produces a rate the client will not pay.

Marking a standalone offering **Co-managed** (in its offering form under **Settings → Pricing**) changes three things:

| What | Fully managed | Co-managed |
| --- | --- | --- |
| **Base tools — cost-plus** | tool × (1 + *labor multiplier*), then ÷ (1 − SGM) | tool × (1 + *co-managed labor multiplier*), then ÷ (1 − SGM) |
| **Base tools — markup** | tool × the Calculator's markup | tool × *co-managed markup* (fixed per version) |
| **Cost floor** | tool + full imputed labor (cost-plus) or raw tool (markup) | tool + co-managed labor (cost-plus) or raw tool (markup) |

Everything else is shared. Add-on items still use the add-on multiplier or add-on markup, the SGM slider still applies on cost-plus, bundle discounts still cap at cost, and the same review triggers apply. Offerings that **build on** a co-managed offering are co-managed too: the whole chain follows its root, so you cannot mix delivery types inside one chain. The Calculator, quotes and both PDFs label a co-managed offering as such.

**Setting the co-managed lever.** Start from how much of the work the client's team actually takes. On cost-plus, if a fully managed seat carries 3.1× tool cost in labor and the client covers roughly two-thirds of that effort, a co-managed labor multiplier around 1.0× is reasonable; the default is 1.0×. On markup, set the co-managed markup to the multiple you sell co-managed at — it is fixed per version and the account manager cannot move it in the Calculator.

**Combining with a flat rate.** Where your co-managed price is set by the market rather than by cost, put a flat rate on the offering (per user, device, location and/or per month). The co-managed lever then only determines the cost floor the flat rate is checked against.

### Per-offering floor

The version's **Minimum per-user floor** is written for a fully managed seat, so a co-managed offering that correctly prices at $40/user would be lifted to a $100 floor and flagged on every quote. Each offering therefore has its own **Per-user floor** field in the offering form:

| Value | Effect |
| --- | --- |
| *blank* | The offering follows the quote's per-user floor (the version minimum, or whatever the account manager sets in the Calculator). |
| a number | The offering is held to this floor instead — typically lower than the version's. The Calculator's floor field does not affect it. |
| `0` | No per-user floor for this offering. |

Whatever the per-user floor, the **COGS cost floor** still applies: a bundle discount never takes the rate below tool (+ co-managed labor) cost, and a flat rate below it is charged at cost and flagged. An offering held to its own floor is only flagged *below floor* against that floor, and only when it is the offering being quoted.

Although the field is aimed at co-managed offerings, any offering can use it — for example a lightweight add-on agreement whose seats cost little to support.

## Changing the settings

:::role ADMIN
Settings belong to a pricing version. Create a draft under **Settings → Pricing**, change the numbers in the **pricing settings** form, save, and publish. See [Changing the pricing schedule](/help/guide/pricing-versions).
:::
