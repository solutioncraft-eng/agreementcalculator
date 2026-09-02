---
title: People and workspaces
summary: Inviting members, changing roles, deactivating accounts, and how one account spans several workspaces.
order: 100
---

## Accounts and memberships

A **workspace** is one company's private copy of Agreement Calculator: its own people, pricing versions, quotes and audit log. Nothing is shared between workspaces.

A **person** is one account identified by their email address. Access to a workspace is a **membership** with a role. The same person can be a member of several workspaces with a different role in each.

## Switching workspaces

If you belong to more than one workspace you choose one at sign-in and can switch from the header at any time. The chosen workspace is bound to your signed-in session, so it cannot be changed by editing a URL. Each workspace also has its own subdomain (for example `acme.agreementcalculator.com`); opening a workspace's address takes you straight into it.

## Managing people

:::role ADMIN
Everything below is under **Settings → People**.

### Add a person

Enter their name, work email and role and press **Add to workspace**.

- If the email is new to Agreement Calculator, an account is created with a temporary password and a welcome email is sent. The temporary password is also shown to you once, in case the email does not arrive. They must change it at first sign-in.
- If the email already has an account (from another workspace), they are simply given a membership here and emailed that they now have access. No new password is issued.

### Change a role

Pick a new role beside the person. You cannot downgrade your own administrator access, and at least one administrator must remain in the workspace.

### Remove from workspace

**Remove from workspace** takes away this workspace's membership only; the person's account and any other memberships remain. You cannot remove yourself, and at least one administrator must remain. A person whose account has been deactivated by an operator is shown as *inactive*.

### Help with sign-in

**Resend welcome email** sends the welcome email again. **Reset password** issues a new temporary password and emails it. Both are audited.
:::

## Google sign-in

If the workspace has Google sign-in enabled, members can use **Continue with Google** with the email address on their membership. Google only proves the address; it never grants access to a workspace that has not invited that address, and a deactivated account stays deactivated.

## Creating a new workspace

A new company signs up on the main sign-in page, naming the company and choosing its pricing model. Whoever signs up becomes the first administrator and the workspace starts a 14-day trial — see [Billing and trials](/help/guide/billing).
