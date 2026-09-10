import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getTenantSession } from "@/lib/auth";
import { forTier, type CalcInputs } from "@/lib/pricing/engine";
import { calculate } from "@/lib/pricing/models";
import { getActiveConfig, getConfigForVersion } from "@/lib/pricing/config";
import {
  approvalLabel,
  buildDocument,
  type ApprovalRecord,
  type ApprovalState,
  type DocCustomer,
  type DocWorkspace,
  type StampInfo,
} from "@/lib/pdf/documents";
import { customerLogo, newExportId, renderPdf, workspaceLogo } from "@/lib/pdf/render";
import { exportPayloadSchema } from "@/lib/schemas";
import { newQuoteRef, purgeDate } from "@/lib/quote-records";
import { EXPORTABLE, tierRatesFrom } from "@/lib/quotes";
import { APP_VERSION_STAMP } from "@/lib/version";
import { workspaceAccess } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "quote";
}

export async function POST(request: Request) {
  const session = await getTenantSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { user, role, tenant, db } = session;
  // Pages go through requireTenant, which redirects a workspace with no
  // entitlement left; this route reads the session directly, so it has to say
  // no for itself.
  if (!workspaceAccess(tenant).allowed) {
    return NextResponse.json({ error: "This workspace is not active" }, { status: 403 });
  }

  const form = await request.formData();
  const raw = form.get("payload");
  let parsed;
  try {
    parsed = exportPayloadSchema.safeParse(JSON.parse(typeof raw === "string" ? raw : "{}"));
  } catch {
    return NextResponse.json({ error: "Malformed export payload" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Invalid export payload" }, { status: 400 });

  const payload = parsed.data;
  const quoteId = payload.quoteId || undefined;

  let inputs: CalcInputs;
  let versionId: string | undefined;
  let approvalState: ApprovalState;
  let quoteRef: string | null = null;
  let clientName = payload.clientName;
  let notes = payload.notes || null;
  let approval: ApprovalRecord | null = null;

  if (quoteId) {
    const quote = await db.quoteRequest.findUnique({
      where: { id: quoteId },
      include: {
        reviews: {
          where: { action: "APPROVED" },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { actor: { select: { name: true } } },
        },
      },
    });
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    if (quote.submittedById !== user.id && role === "AM") {
      return NextResponse.json({ error: "Not your quote" }, { status: 403 });
    }
    if (!EXPORTABLE.includes(quote.status)) {
      await audit({
        action: "PDF_EXPORT_BLOCKED",
        entity: "QuoteRequest",
        entityId: quote.id,
        summary: `Export of ${quote.ref} blocked — status ${quote.status}`,
        tenantId: tenant.id,
        actor: user,
      });
      return NextResponse.json(
        { error: "This quote is awaiting leadership approval and cannot be exported yet." },
        { status: 403 },
      );
    }
    inputs = {
      users: quote.users,
      devices: quote.devices,
      locations: quote.locations,
      sgmPct: quote.sgmPct.toNumber(),
      perUserFloor: quote.perUserFloor.toNumber(),
      premiumPct: quote.premiumPct?.toNumber() ?? null,
      floorOverride: quote.floorOverride,
      addonMultiplier: quote.addonMultiplier.toNumber(),
      markupMultiple: quote.markupMultiple.toNumber(),
      bundleKey: quote.bundleKey,
    };
    versionId = quote.pricingVersionId;
    approvalState = "APPROVED";
    quoteRef = quote.ref;
    clientName = quote.clientName;
    notes = quote.notes;
    const decision = quote.reviews[0];
    if (decision) {
      const decider = await db.membership.findFirst({
        where: { userId: decision.actorId },
        select: { role: true },
      });
      approval = {
        by: decision.actor.name,
        role: decider?.role ?? "LEADER",
        at: decision.createdAt,
      };
    }
  } else {
    if (!payload.inputs) return NextResponse.json({ error: "Missing calculator inputs" }, { status: 400 });
    inputs = payload.inputs;
    approvalState = "STANDARD";
  }

  const config = versionId
    ? await getConfigForVersion(db, versionId)
    : await getActiveConfig(db);
  if (!config) return NextResponse.json({ error: "No published pricing version" }, { status: 409 });

  const priced = calculate(config, inputs);

  // The requested offering has to exist in the version being priced against.
  if (!priced.tiers.some((tier) => tier.key === payload.tierKey)) {
    return NextResponse.json(
      { error: "That offering is not part of this pricing version." },
      { status: 400 },
    );
  }

  const result = forTier(priced, payload.tierKey);

  // A quote already approved keeps whatever it was approved at; a fresh export
  // cannot go out for a client the offering does not sell to.
  const requested = priced.tiers.find((tier) => tier.key === payload.tierKey);
  if (!quoteId && requested && !requested.available) {
    return NextResponse.json(
      { error: `${requested.label} sells to ${requested.minUsers} users or more.` },
      { status: 400 },
    );
  }

  // Non-standard pricing can only leave the building once leadership has signed off.
  if (!quoteId && result.needsApproval) {
    await audit({
      action: "PDF_EXPORT_BLOCKED",
      summary: `Export blocked for ${clientName} — ${result.triggers.length} approval trigger(s)`,
      after: { triggers: result.triggers.map((t) => t.code) },
      tenantId: tenant.id,
      actor: user,
    });
    return NextResponse.json(
      { error: "This configuration needs leadership approval before it can be exported." },
      { status: 403 },
    );
  }

  const exportId = newExportId();
  const stamp: StampInfo = {
    exportId,
    exportedAt: new Date(),
    exportedBy: `${user.name} <${user.email}>`,
    appVersion: APP_VERSION_STAMP,
    pricingVersion: config.versionLabel,
    costBasis: config.costBasis,
    approvalState,
    quoteRef,
    approval,
    timeZone: payload.timeZone ?? null,
  };

  const workspace: DocWorkspace = {
    name: tenant.name,
    footer: tenant.pdfFooter,
    accentColor: tenant.accentColor,
  };
  const logo = await workspaceLogo(tenant.logoUrl);

  // A customer-facing quote is the same document with a richer header; nothing
  // below this point (approval state, stamp, checksum, export record) knows or
  // cares that the customer came from MSP Cadence.
  const customer: DocCustomer = {
    website: payload.customerWebsite || null,
    contactPhone: payload.customerContactPhone || null,
    technicalContactName: payload.customerTechnicalContactName || null,
    technicalContactEmail: payload.customerTechnicalContactEmail || null,
    executiveContactName: payload.customerExecutiveContactName || null,
    executiveContactEmail: payload.customerExecutiveContactEmail || null,
  };
  const props = {
    result,
    tierKey: payload.tierKey,
    clientName,
    notes,
    stamp,
    workspace,
    logo,
    customer,
    customerLogo: await customerLogo(payload.customerLogoUrl, tenant.mspCadenceUrl),
  };

  let bytes: Buffer;
  let checksum: string;
  try {
    ({ bytes, checksum } = await renderPdf(buildDocument(payload.docType, props)));
  } catch (error) {
    console.error("PDF render failed", error);
    const detail = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: `The PDF could not be rendered: ${detail}` }, { status: 500 });
  }

  // A customer-facing export is a completed quote. Approved quotes move to
  // COMPLETED on their first export; standard quotes (never submitted for
  // review) are saved now so the Quotes tab keeps a record of what went out.
  let savedQuoteId = quoteId ?? null;
  if (payload.docType === "QUOTE") {
    if (quoteId) {
      await db.quoteRequest.updateMany({
        where: { id: quoteId, status: "APPROVED" },
        data: { status: "COMPLETED" },
      });
    } else {
      const saved = await db.quoteRequest.create({
        data: {
          tenantId: tenant.id,
          ref: newQuoteRef(),
          status: "COMPLETED",
          clientName,
          notes,
          users: inputs.users,
          devices: inputs.devices,
          locations: inputs.locations,
          sgmPct: inputs.sgmPct,
          perUserFloor: inputs.perUserFloor,
          premiumPct: inputs.premiumPct,
          floorOverride: inputs.floorOverride,
          addonMultiplier: inputs.addonMultiplier,
          markupMultiple: inputs.markupMultiple,
          bundleKey: inputs.bundleKey,
          requestedTierKey: payload.tierKey,
          tierRates: tierRatesFrom(result.tiers),
          triggers: [],
          pricingVersionId: config.versionId,
          submittedById: user.id,
          decidedAt: stamp.exportedAt,
          purgeAfter: purgeDate(tenant.retentionMonths),
        },
        select: { id: true },
      });
      savedQuoteId = saved.id;
    }
  }

  await db.exportRecord.create({
    data: {
      tenantId: tenant.id,
      exportId,
      docType: payload.docType,
      exportedById: user.id,
      pricingVersionId: config.versionId,
      appVersion: APP_VERSION_STAMP,
      quoteId: savedQuoteId,
      clientName,
      approvalState: approvalLabel(stamp),
      inputs: { ...inputs, tierKey: payload.tierKey },
      checksum,
    },
  });

  await audit({
    action: "PDF_EXPORTED",
    entity: "ExportRecord",
    entityId: exportId,
    summary: `${payload.docType === "COGS" ? "COGS worksheet" : "Agreement summary"} exported for ${clientName} (${approvalLabel(stamp)})`,
    after: { exportId, checksum, pricingVersion: config.versionLabel, tierKey: payload.tierKey },
    tenantId: tenant.id,
    actor: user,
  });

  const name = `${slug(tenant.slug)}-${payload.docType === "COGS" ? "COGS" : "agreement"}-${slug(clientName)}-${exportId}.pdf`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Export-Id": exportId,
    },
  });
}
