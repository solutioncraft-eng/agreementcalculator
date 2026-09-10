---
title: MSP Cadence integration
summary: Connecting a workspace to MSP Cadence so quotes can pull the customer's name, logo, website and contacts.
order: 115
---

## What it does

MSP Cadence holds your client roster — names, logos, websites and the technical and executive contacts you work with. Once a workspace is connected, the Calculator's **Client name** field searches that roster as you type. Picking a customer fills in the name and carries their logo, website and contacts into the agreement PDF, so the proposal arrives with the customer's identity on it rather than a typed name alone.

The integration is **read-only**. Agreement Calculator never writes to MSP Cadence, and nothing about a customer affects pricing: the same inputs produce the same rate whether the client was picked from MSP Cadence or typed by hand. Only active MSP Cadence clients are offered.

:::note
MSP Cadence does not store a postal address for clients, so the PDF shows logo, website, phone and named contacts but no street address.
:::

## Connecting a workspace

Connection is a single key generated in MSP Cadence and pasted here. The key identifies both the MSP Cadence instance and the tenant, so there is nothing else to configure.

:::role ADMIN
1. In **MSP Cadence**, open **Settings → Integrations** and, under *Agreement Calculator*, choose **Generate key**. Copy it — it begins `mspc_` and is shown only once.
2. In **Agreement Calculator**, open **Settings → Integrations** and paste the key into **MSP Cadence API key**, then press **Connect**. The key is checked against MSP Cadence before it is saved; a rejected key is not stored.
3. The page shows **Connected**. The key is stored encrypted and is never displayed again.

**Replace key** overwrites the stored key with a new one. **Disconnect** removes it and returns the Calculator to manual client-name entry. Both are written to the audit log.
:::

Each workspace holds its own key, and a key belongs to exactly one MSP Cadence tenant. A workspace can therefore only ever see its own customers; there is no way to search another tenant's roster.

## Using the picker

With the workspace connected, the **Client name** box on the Calculator doubles as a search:

- Start typing — matching customers appear in a dropdown with their logo and website.
- Use the arrow keys and **Enter**, or click, to choose one. The name is filled in and the customer's details are attached to the quote.
- Keep typing without choosing to enter a name manually. A manually typed name exports exactly as before, with no customer block on the PDF.

When the workspace is not connected the field is a plain text box and nothing else changes.

## What appears on the PDF

The customer-facing agreement PDF uses the selected customer for its header and footer:

| From MSP Cadence | Where it appears |
| --- | --- |
| **Name** | Beside the logo at the top of the proposal |
| **Logo** | Top left, next to the name |
| **Technical contact** and **executive sponsor** | Bottom left, as *Name · role · email* |
| **Phone** | Bottom right, with the pricing version and export reference |

The internal COGS PDF is unchanged. Customer details are presentation only: they are not part of the pricing inputs, the approval check or the export checksum.

## Revoking access

To cut a workspace off, revoke the key in **MSP Cadence → Settings → Integrations**. Searches from Agreement Calculator stop immediately — the Client name field shows a *Customer search failed* message and accepts manual entry until a new key is pasted. Quotes and PDFs already produced are unaffected.

## Troubleshooting

- **"Connect" is disabled with a message about an encryption key** — the deployment is missing its `INTEGRATION_ENCRYPTION_KEY`. This is set by whoever hosts the application, not in Settings.
- **The key is rejected** — check it was copied in full (`mspc_…`) and has not been revoked in MSP Cadence. Generate a fresh key if in doubt.
- **A customer is missing from the picker** — the picker lists active MSP Cadence clients only. Reactivate the client in MSP Cadence, or type the name manually.
- **Logo missing on the PDF** — the logo must be a PNG or JPEG hosted by MSP Cadence and under 2 MB; anything else is skipped and the PDF renders without it.
