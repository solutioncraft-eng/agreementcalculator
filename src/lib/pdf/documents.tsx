import type { ReactElement } from "react";
import { Document, Image, Page, Text, View, type DocumentProps } from "@react-pdf/renderer";
import type { CalcResult } from "@/lib/pricing/engine";
import {
  achievedSgmPct,
  costFloorLift,
  includedLines,
  money,
  moneyRounded,
  standardRateLabel,
  tierChain,
  tierResultFor,
} from "@/lib/pricing/engine";
import { approvalLabel, type StampInfo } from "./stamp";
import { displayPhone } from "./format";
import { groupInclusions } from "./included";
import { brand, styles } from "./theme";

export { approvalLabel, type ApprovalRecord, type ApprovalState, type StampInfo } from "./stamp";

export type DocType = "QUOTE" | "COGS";

/** Everything a workspace controls about how its documents read. */
export interface DocWorkspace {
  name: string;
  footer?: string | null;
  /** Workspace accent colour; falls back to the product orange. */
  accentColor?: string | null;
}

/**
 * The customer a customer-facing quote is addressed to, from MSP Cadence.
 * Presentation only, and every field optional: with none of it the header reads
 * exactly as it always has.
 */
export interface DocCustomer {
  website?: string | null;
  contactPhone?: string | null;
  technicalContactName?: string | null;
  technicalContactEmail?: string | null;
  executiveContactName?: string | null;
  executiveContactEmail?: string | null;
}

export interface DocProps {
  result: CalcResult;
  /** ServiceTier.key of the offering the document is written for. */
  tierKey: string;
  clientName: string;
  notes?: string | null;
  stamp: StampInfo;
  workspace: DocWorkspace;
  logo?: Buffer;
  customer?: DocCustomer;
  /** The customer's own logo, shown beside the workspace's. */
  customerLogo?: Buffer;
}

const UNIT_LABEL: Record<string, string> = {
  USER: "per user",
  DEVICE: "per device",
  LOCATION: "per location",
  FLAT: "per agreement",
};

function utc(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** "September 9, 2026" — the customer-facing date; the audit stamp keeps UTC. */
function longDate(d: Date): string {
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
}

interface ContactRow {
  name: string;
  role: string;
  email?: string | null;
}

function contactRows(customer?: DocCustomer): ContactRow[] {
  const rows: ContactRow[] = [];
  if (customer?.technicalContactName) {
    rows.push({
      name: customer.technicalContactName,
      role: "technical contact",
      email: customer.technicalContactEmail,
    });
  }
  if (customer?.executiveContactName) {
    rows.push({
      name: customer.executiveContactName,
      role: "executive sponsor",
      email: customer.executiveContactEmail,
    });
  }
  return rows;
}

/** Internal documents: workspace logo, document title, plain client name, export stamp. */
function Header({
  stamp,
  clientName,
  title,
  workspaceName,
  logo,
  accentColor,
}: {
  stamp: StampInfo;
  clientName: string;
  title: string;
  workspaceName: string;
  logo?: Buffer;
  accentColor?: string | null;
}) {
  return (
    <View style={styles.headerRow}>
      <View>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
        {logo ? <Image style={styles.logo} src={logo} /> : <Text style={styles.title}>{workspaceName}</Text>}
        <Text style={[styles.eyebrow, accentColor ? { color: accentColor } : {}]}>{title.toUpperCase()}</Text>
        <Text style={styles.title}>{clientName}</Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.metaLine}>Prepared {utc(stamp.exportedAt)}</Text>
        <Text style={styles.metaLine}>By {stamp.exportedBy}</Text>
        <Text style={styles.metaLine}>Pricing version {stamp.pricingVersion}</Text>
        {stamp.quoteRef ? <Text style={styles.metaLine}>Quote {stamp.quoteRef}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Customer-facing header: the customer leads (logo + name), the provider sits
 * small on the right with who prepared the document and when.
 */
function ClientHeader({
  stamp,
  clientName,
  workspaceName,
  logo,
  accentColor,
  customerLogo,
}: {
  stamp: StampInfo;
  clientName: string;
  workspaceName: string;
  logo?: Buffer;
  accentColor?: string | null;
  customerLogo?: Buffer;
}) {
  return (
    <View>
      <Text style={[styles.eyebrow, accentColor ? { color: accentColor } : {}]}>
        MANAGED SERVICES PROPOSAL
      </Text>
      <View style={styles.clientHeaderRow}>
        <View style={styles.clientIdentity}>
          {customerLogo ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
            <Image style={styles.clientLogo} src={customerLogo} />
          ) : null}
          <Text style={styles.clientName}>{clientName}</Text>
        </View>
        <View style={styles.providerBlock}>
          {logo ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
            <Image style={styles.providerLogo} src={logo} />
          ) : (
            <Text style={styles.providerName}>{workspaceName}</Text>
          )}
          <Text style={styles.metaLine}>Prepared {longDate(stamp.exportedAt)}</Text>
          <Text style={styles.metaLine}>by {stamp.exportedBy}</Text>
        </View>
      </View>
      <View style={styles.rule} />
    </View>
  );
}

/** Customer-facing footer: their contacts on the left, terms and the document reference on the right. */
function ClientFooter({
  stamp,
  workspace,
  customer,
}: {
  stamp: StampInfo;
  workspace: DocWorkspace;
  customer?: DocCustomer;
}) {
  const contacts = contactRows(customer);
  const reference = [
    `Pricing version ${stamp.pricingVersion} (${stamp.costBasis})`,
    `Ref ${stamp.exportId}`,
    displayPhone(customer?.contactPhone),
  ].filter(Boolean);
  return (
    <View style={styles.clientFooter} fixed>
      <View style={styles.clientFooterLeft}>
        {contacts.map((row) => (
          <Text key={row.role} style={styles.footerContact}>
            <Text style={styles.footerContactName}>{row.name}</Text>
            {`  \u00b7  ${row.role}`}
            {row.email ? `  \u00b7  ${row.email}` : ""}
          </Text>
        ))}
      </View>
      <View style={styles.clientFooterRight}>
        <Text>
          Rates assume the environment counts shown and are subject to quarterly true-up. Mailbox count
          assumed equal to user count. This document is a proposal, not an invoice, and does not constitute a
          contract until countersigned.
        </Text>
        {workspace.footer ? <Text>{workspace.footer}</Text> : null}
        <Text style={{ marginTop: 3 }}>{reference.join("  \u00b7  ")}</Text>
      </View>
    </View>
  );
}

function Stamp({
  stamp,
  workspace,
  checksum,
}: {
  stamp: StampInfo;
  workspace: DocWorkspace;
  checksum?: string;
}) {
  return (
    <View style={styles.stamp} fixed>
      <Text>
        Export {stamp.exportId} · generated {utc(stamp.exportedAt)} by {stamp.exportedBy} · app{" "}
        {stamp.appVersion} · pricing version {stamp.pricingVersion} ({stamp.costBasis}) · approval:{" "}
        {approvalLabel(stamp)}
        {checksum ? ` · sha256 ${checksum.slice(0, 16)}` : ""}
      </Text>
      <Text>
        {workspace.footer ??
          `Verify this document against the ${workspace.name} Agreement Calculator export log. Rates are valid for the pricing version shown; quarterly true-up recommended.`}
      </Text>
    </View>
  );
}

/** A date in the exporting user's zone, e.g. "31 Aug 2026, 09:12 PDT". */
function local(d: Date, timeZone?: string | null): string {
  return d.toLocaleString("en-US", {
    timeZone: timeZone ?? "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function ApprovalTimeline({ stamp }: { stamp: StampInfo }) {
  if (!stamp.approval) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>APPROVAL</Text>
      <View style={styles.timelineRow}>
        <Text>
          Approved by {stamp.approval.by} · {stamp.approval.role}
        </Text>
        <Text style={styles.rowMuted}>{local(stamp.approval.at, stamp.timeZone)}</Text>
      </View>
      {stamp.quoteRef ? (
        <Text style={[styles.rowMuted, { marginTop: 4, fontSize: 8 }]}>
          Recorded against quote {stamp.quoteRef} in the approval log.
        </Text>
      ) : null}
    </View>
  );
}

function MetaGrid({ result }: { result: CalcResult }) {
  const cells: [string, string][] = [
    ["USERS", String(result.inputs.users)],
    ["DEVICES", String(result.inputs.devices)],
    ["LOCATIONS", String(result.inputs.locations)],
    ["BUNDLE", result.bundle.label],
  ];
  return (
    <View style={styles.metaGrid}>
      {cells.map(([label, value]) => (
        <View key={label} style={styles.metaCell}>
          <Text style={styles.metaLabel}>{label}</Text>
          <Text style={styles.metaValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

export function buildDocument(docType: DocType, props: DocProps): ReactElement<DocumentProps> {
  const element = docType === "COGS" ? <CogsDocument {...props} /> : <QuoteDocument {...props} />;
  return element as unknown as ReactElement<DocumentProps>;
}

const NEXT_STEP =
  "confirm the user and device counts above, and we'll issue the agreement for signature with your preferred start date.";

export function QuoteDocument({
  result,
  tierKey,
  clientName,
  notes,
  stamp,
  workspace,
  logo,
  customer,
  customerLogo,
}: DocProps) {
  const t = tierResultFor(result, tierKey);
  const tierName = t.label;
  const accent = workspace.accentColor ?? brand.orange;
  const groups = groupInclusions(includedLines(result, t.key));
  const counts: [string, string][] = [
    ["USERS", String(result.inputs.users)],
    ["DEVICES", String(result.inputs.devices)],
    ["LOCATIONS", String(result.inputs.locations)],
  ];

  return (
    <Document
      title={`${clientName} — ${tierName}`}
      author={workspace.name}
      subject={`Managed services proposal · pricing version ${stamp.pricingVersion}`}
      creator={`Agreement Calculator ${stamp.appVersion}`}
      producer={`Agreement Calculator ${stamp.appVersion}`}
      keywords={`export:${stamp.exportId} pricing:${stamp.pricingVersion} approval:${approvalLabel(stamp)}`}
    >
      <Page size="LETTER" style={styles.clientPage}>
        <ClientHeader
          stamp={stamp}
          clientName={clientName}
          workspaceName={workspace.name}
          logo={logo}
          accentColor={accent}
          customerLogo={customerLogo}
        />

        <Text style={styles.investmentEyebrow}>PROPOSED MONTHLY INVESTMENT</Text>
        <Text style={styles.tierTitle}>{tierName}</Text>

        <View style={styles.investmentCard}>
          <View style={styles.rateCell}>
            <Text style={styles.metaLabel}>MONTHLY AGREEMENT RATE</Text>
            <View style={styles.rateLine}>
              <Text style={styles.rateValue}>{moneyRounded(t.headlineRate)}</Text>
              <Text style={styles.rateUnit}> / mo</Text>
            </View>
            <Text style={[styles.ratePerUser, { color: accent }]}>
              {money(t.headlinePerUser)} per user per month
            </Text>
          </View>
          <View style={styles.countsCell}>
            {counts.map(([label, value]) => (
              <View key={label} style={styles.countCell}>
                <Text style={styles.metaLabel}>{label}</Text>
                <Text style={styles.countValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {result.bundle.discountPct > 0 ? (
          <Text style={styles.bundleNote}>
            Includes the {result.bundle.label} agreement discount of {result.bundle.discountPct}%.
          </Text>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WHAT&apos;S INCLUDED</Text>
          <Text style={styles.includedIntro}>
            Every service below is covered by the monthly rate — no per-incident charges, no add-on line
            items.
          </Text>
          <View style={styles.groupGrid}>
            {groups.map((group) => (
              <View key={group.category} style={styles.groupCell} wrap={false}>
                <Text style={styles.groupTitle}>{group.category}</Text>
                {group.items.map((item) => (
                  <View key={item} style={styles.bulletRow}>
                    <View style={[styles.bullet, { backgroundColor: accent }]} />
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.nextStep, { borderLeftColor: accent }]} wrap={false}>
          <Text>
            <Text style={styles.nextStepLabel}>Next step: </Text>
            {notes?.trim() || NEXT_STEP}
          </Text>
        </View>

        <ClientFooter stamp={stamp} workspace={workspace} customer={customer} />
      </Page>
    </Document>
  );
}

export function CogsDocument({ result, tierKey, clientName, notes, stamp, workspace, logo }: DocProps) {
  const t = tierResultFor(result, tierKey);
  const tierName = t.label;
  // The offering carries its whole parent chain's items on top of its own.
  const lines = includedLines(result, t.key);
  const baseKey = tierChain(result.tiers, t.key)[0]?.key;
  const tierLabel = (key: string) => result.tiers.find((tier) => tier.key === key)?.label ?? key;
  const pending = stamp.approvalState === "PENDING_APPROVAL";

  return (
    <Document
      title={`${clientName} — internal COGS worksheet`}
      author={workspace.name}
      subject={`Internal COGS worksheet · pricing version ${stamp.pricingVersion}`}
      creator={`Agreement Calculator ${stamp.appVersion}`}
      producer={`Agreement Calculator ${stamp.appVersion}`}
      keywords={`export:${stamp.exportId} pricing:${stamp.pricingVersion} approval:${approvalLabel(stamp)}`}
    >
      <Page size="LETTER" style={styles.page}>
        {pending ? <Text style={styles.watermark}>APPROVAL REQUIRED</Text> : null}
        <Header
          stamp={stamp}
          clientName={clientName}
          title="Internal COGS worksheet"
          workspaceName={workspace.name}
          logo={logo}
          accentColor={workspace.accentColor}
        />
        <Text style={styles.confidential}>
          INTERNAL ONLY · DO NOT SEND TO CLIENT · CONTAINS TOOL COST AND MARGIN
        </Text>

        <MetaGrid result={result} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MONTHLY TOOL COST — {tierName.toUpperCase()}</Text>
          <View style={styles.table}>
            <View style={styles.th}>
              <Text style={{ width: "38%" }}>ITEM</Text>
              <Text style={{ width: "20%" }}>BASIS</Text>
              <Text style={{ width: "14%", textAlign: "right" }}>UNIT</Text>
              <Text style={{ width: "12%", textAlign: "right" }}>QTY</Text>
              <Text style={{ width: "16%", textAlign: "right" }}>MONTHLY</Text>
            </View>
            {lines.map((l) => (
              <View key={`${l.tierKey}-${l.key}`} style={styles.td}>
                <Text style={{ width: "38%" }}>
                  {l.label}
                  {l.tierKey === baseKey ? "" : ` (${tierLabel(l.tierKey)} add-on)`}
                </Text>
                <Text style={{ width: "20%", color: brand.slate }}>{UNIT_LABEL[l.unit]}</Text>
                <Text style={{ width: "14%", textAlign: "right" }}>{money(l.unitCost)}</Text>
                <Text style={{ width: "12%", textAlign: "right" }}>{l.quantity}</Text>
                <Text style={{ width: "16%", textAlign: "right" }}>{money(l.monthlyCost)}</Text>
              </View>
            ))}
            <View style={styles.rowTotal}>
              <Text>Total monthly tool cost</Text>
              <Text>{money(t.toolCost)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RATE BUILD</Text>
          <View style={styles.row}>
            <Text>Tool cost</Text>
            <Text>{money(t.toolCost)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowMuted}>Imputed labor and delivery</Text>
            <Text style={styles.rowMuted}>{money(t.costFloor - t.toolCost)}</Text>
          </View>
          <View style={styles.rowTotal}>
            <Text>Hard cost floor (tool + labor)</Text>
            <Text>{money(t.costFloor)}</Text>
          </View>
          <View style={[styles.row, { marginTop: 6 }]}>
            <Text>{standardRateLabel(t, result)}</Text>
            <Text>{money(t.standardRate)}</Text>
          </View>
          {t.discount > 0 ? (
            <View style={styles.row}>
              <Text>
                {result.bundle.label} discount ({result.bundle.discountPct}%)
                {t.discountCappedAtCost ? " — capped at cost floor" : ""}
              </Text>
              <Text>-{money(t.discount)}</Text>
            </View>
          ) : null}
          {costFloorLift(t) > 0 ? (
            <View style={styles.row}>
              <Text>Lifted to the hard cost floor</Text>
              <Text>{money(costFloorLift(t))}</Text>
            </View>
          ) : null}
          {t.belowFloor ? (
            <View style={styles.row}>
              <Text>Per-user floor applied ({money(t.perUserFloor)}/user)</Text>
              <Text>{money(t.headlineRate - t.discountedRate)}</Text>
            </View>
          ) : null}
          {t.premiumTarget !== null ? (
            <View style={styles.row}>
              <Text style={styles.rowMuted}>
                {t.premiumPct}% of the premium offering
                {t.belowPremiumPct ? " — quoted under it, approved by leadership" : ""}
              </Text>
              <Text style={styles.rowMuted}>{money(t.premiumTarget)}</Text>
            </View>
          ) : null}
          <View style={styles.rowTotal}>
            <Text>Agreement rate</Text>
            <Text>
              {money(t.headlineRate)} ({money(t.headlinePerUser)}/user)
            </Text>
          </View>
          <View style={styles.rowTotal}>
            <Text>Actual gross margin</Text>
            <Text>{achievedSgmPct(t)}%</Text>
          </View>
          <View style={[styles.row, { marginTop: 6 }]}>
            <Text style={styles.rowMuted}>
              Revenue split — tool {result.split.toolPct}% · labor {result.split.laborPct}% · gross margin{" "}
              {result.split.sgmPct}%
            </Text>
            <Text style={styles.rowMuted}>{result.multiplier.toFixed(2)}× multiplier</Text>
          </View>
        </View>

        {result.triggers.length ? (
          <View
            style={[
              styles.approvalBlock,
              workspace.accentColor ? { borderColor: workspace.accentColor } : {},
            ]}
          >
            <Text style={styles.approvalTitle}>NON-STANDARD PRICING — LEADERSHIP REVIEW</Text>
            {result.triggers.map((tr, index) => (
              <Text key={`${tr.code}-${index}`} style={{ marginTop: 3 }}>
                · {tr.message}
              </Text>
            ))}
            <Text style={{ marginTop: 5, fontFamily: "Helvetica-Bold" }}>
              Approval state: {approvalLabel(stamp)}
            </Text>
          </View>
        ) : null}

        {notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NOTES</Text>
            <Text style={styles.notes}>{notes}</Text>
          </View>
        ) : null}

        <ApprovalTimeline stamp={stamp} />

        <Stamp stamp={stamp} workspace={workspace} />
      </Page>
    </Document>
  );
}
