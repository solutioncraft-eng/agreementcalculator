import type { ReactElement } from "react";
import { Document, Image, Page, Text, View, type DocumentProps } from "@react-pdf/renderer";
import type { CalcResult } from "@/lib/pricing/engine";
import {
  achievedSgmPct,
  costFloorLift,
  includedLines,
  money,
  moneyRounded,
  ratesDiffer,
  tierChain,
  tierResultFor,
} from "@/lib/pricing/engine";
import { approvalLabel, type StampInfo } from "./stamp";
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

export interface DocProps {
  result: CalcResult;
  /** ServiceTier.key of the offering the document is written for. */
  tierKey: string;
  clientName: string;
  notes?: string | null;
  stamp: StampInfo;
  workspace: DocWorkspace;
  logo?: Buffer;
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
        <Text style={[styles.eyebrow, accentColor ? { color: accentColor } : {}]}>
          {title.toUpperCase()}
        </Text>
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

export function QuoteDocument({ result, tierKey, clientName, notes, stamp, workspace, logo }: DocProps) {
  const t = tierResultFor(result, tierKey);
  const tierName = t.label;
  const lower = result.tiers[t.index - 1];
  const others = result.tiers.filter((tier) => tier.key !== t.key);
  const accent = workspace.accentColor ?? brand.orange;

  return (
    <Document
      title={`${clientName} — ${tierName} agreement`}
      author={workspace.name}
      subject={`Agreement summary · pricing version ${stamp.pricingVersion}`}
      creator={`Agreement Calculator ${stamp.appVersion}`}
      producer={`Agreement Calculator ${stamp.appVersion}`}
      keywords={`export:${stamp.exportId} pricing:${stamp.pricingVersion} approval:${approvalLabel(stamp)}`}
    >
      <Page size="LETTER" style={styles.page}>
        <Header
          stamp={stamp}
          clientName={clientName}
          title="Managed services agreement"
          workspaceName={workspace.name}
          logo={logo}
          accentColor={accent}
        />
        <Text style={styles.confidential}>PROPOSED MONTHLY INVESTMENT · {tierName.toUpperCase()}</Text>

        <MetaGrid result={result} />

        <View style={styles.highlight}>
          <View>
            <Text style={styles.highlightLabel}>MONTHLY AGREEMENT RATE</Text>
            <Text style={styles.highlightValue}>{moneyRounded(t.headlineRate)}</Text>
          </View>
          <View>
            <Text style={[styles.highlightSub, { color: accent }]}>
              {money(t.headlinePerUser)} per user / month
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WHAT IS INCLUDED</Text>
          {lower ? (
            <>
              <Text>
                Everything in {lower.label} — 24/7 monitoring and remediation, patching, endpoint
                protection, email security, vulnerability management, network monitoring, and unlimited
                remote support — plus what {tierName} adds:
              </Text>
              <View style={{ marginTop: 6 }}>
                {t.lines.map((l) => (
                  <View key={l.key} style={styles.row}>
                    <Text>{l.label}</Text>
                    <Text style={styles.rowMuted}>{UNIT_LABEL[l.unit]}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text>
              24/7 monitoring and remediation, patching and lifecycle management, managed endpoint
              protection, email security, vulnerability management, network monitoring, privileged access
              control, and unlimited remote support for the environment shown above.
            </Text>
          )}
        </View>

        {others.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {others.length === 1 ? "ALTERNATIVE OFFERING" : "ALTERNATIVE OFFERINGS"}
            </Text>
            {others.map((other) => (
              <View key={other.key}>
                <View style={styles.row}>
                  <Text>{other.label}</Text>
                  <Text>
                    {moneyRounded(other.headlineRate)} / month · {money(other.headlinePerUser)} per user
                  </Text>
                </View>
                <Text style={[styles.rowMuted, { marginTop: 2 }]}>
                  {ratesDiffer(other.headlineRate, t.headlineRate)
                    ? `${other.index > t.index ? "+" : "−"}${moneyRounded(
                        Math.abs(other.headlineRate - t.headlineRate),
                      )} per month against ${tierName}.`
                    : `Same monthly rate as ${tierName}.`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {result.bundle.discountPct > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BUNDLE</Text>
            <View style={styles.row}>
              <Text>{result.bundle.label}</Text>
              <Text>{result.bundle.discountPct}% agreement discount applied</Text>
            </View>
          </View>
        ) : null}

        {notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NOTES</Text>
            <Text style={styles.notes}>{notes}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.rowMuted, { fontSize: 8 }]}>
            Rates assume the environment counts shown and are subject to a quarterly true-up. Mailbox count
            is assumed equal to user count. This document is a proposal, not an invoice, and does not
            constitute a contract until countersigned.
          </Text>
        </View>

        <ApprovalTimeline stamp={stamp} />

        <Stamp stamp={stamp} workspace={workspace} />
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
            <Text>Standard rate at {result.split.sgmPct}% service gross margin</Text>
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
              <Text>Per-user floor applied ({money(result.inputs.perUserFloor)}/user)</Text>
              <Text>{money(t.headlineRate - t.discountedRate)}</Text>
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
            style={[styles.approvalBlock, workspace.accentColor ? { borderColor: workspace.accentColor } : {}]}
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
