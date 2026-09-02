---
title: Roles and permissions
summary: What account managers, leaders and administrators can each do, and how roles are assigned.
order: 20
---

## The three roles

Every member of a workspace has exactly one role in that workspace. Roles build on each other: a leader can do everything an account manager can, and an administrator can do everything a leader can.

| Role | Shown in People as | Can do |
| --- | --- | --- |
| `AM` | Account manager | Price agreements, export in-policy PDFs, submit flagged quotes for review, withdraw their own quotes |
| `LEADER` | Leader (approver) | Everything an AM can, plus approve, recommend changes on, deny and comment on quotes in the Reviews queue |
| `ADMIN` | Administrator | Everything a leader can, plus pricing versions, offerings, COGS items, bundle discounts, people, branding, billing and the audit log |

## What each role sees

- **Everyone** sees Calculator, Quotes and Help.
- **Leaders and administrators** also see Reviews.
- **Administrators** also see the Settings menu (Pricing, People, Branding, Billing, Audit log).

This guide shows every topic to every role. Anything that needs more than an AM is marked with a label like the one below so you know whether you can do it yourself or need to ask.

:::role LEADER ADMIN
Content in a box like this describes something only leaders and administrators can do.
:::

## Roles are per workspace

A person is one account, identified by email, that can belong to several workspaces. Their role can differ between them — an administrator in one company's workspace may be an account manager in another. Changing a role in one workspace never affects the others.

## Changing a role

:::role ADMIN
Open **Settings → People**, find the person and change their role. The change takes effect on their next page load and is written to the audit log as a membership update. You cannot remove the last administrator from a workspace.
:::

## Operators

The people who run the Agreement Calculator service have a separate operator portal used to create workspaces, choose a workspace's pricing model, suspend or reinstate workspaces and run billing actions such as complimentary access. Nothing in the operator portal is reachable from inside a workspace; if you need one of those actions, use **Help → Support & requests**.
