import type { ReactElement } from "react";
import { Document, Image, Page, Text, View, type DocumentProps } from "@react-pdf/renderer";
import type { CalcResult, Tier } from "@/lib/pricing/engine";
import { money, moneyRounded } from "@/lib/pricing/engine";
import { brand, styles } from "./theme";

export interface StampInfo {
  exportId: string;
  exportedAt: Date;
  exportedBy: string;
  appVersion: string;
  pricingVersion: string;
  costBasis: string;
  approvalState: string;
  quoteRef?: string | null;
}

export type DocType = "QUOTE" | "COGS";

export interface DocProps {
  result: CalcResult;
  tier: Tier;
  clientName: string;
  notes?: string | null;
  stamp: StampInfo;
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
  logo,
}: {
  stamp: StampInfo;
  clientName: string;
  title: string;
  logo?: Buffer;
}) {
  return (
    <View style={styles.headerRow}>
      <View>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
        {logo ? <Image style={styles.logo} src={logo} /> : <Text style={styles.title}>infinIT</Text>}
        <Text style={styles.eyebrow}>{title.toUpperCase()}</Text>
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

function Stamp({ stamp, checksum }: { stamp: StampInfo; checksum?: string }) {
  return (
    <View style={styles.stamp} fixed>
      <Text>
        Export {stamp.exportId} · generated {utc(stamp.exportedAt)} by {stamp.exportedBy} · app{" "}
        {stamp.appVersion} · pricing version {stamp.pricingVersion} ({stamp.costBasis}) · approval:{" "}
        {stamp.approvalState}
        {checksum ? ` · sha256 ${checksum.slice(0, 16)}` : ""}
      </Text>
      <Text>
        Verify this document against the InfinIT Agreement Calculator export log. Rates are valid for the
        pricing version shown; quarterly true-up recommended.
      </Text>
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

export function QuoteDocument({ result, tier, clientName, notes, stamp, logo }: DocProps) {
  const t = tier === "PINNACLE" ? result.pinnacle : result.advantage;
  const other = tier === "PINNACLE" ? result.advantage : result.pinnacle;
  const tierName = tier === "PINNACLE" ? "infinIT Pinnacle" : "infinIT Advantage";
  const otherName = tier === "PINNACLE" ? "infinIT Advantage" : "infinIT Pinnacle";
  const pending = stamp.approvalState !== "APPROVED" && stamp.approvalState !== "STANDARD";

  return (
    <Document
      title={`${clientName} — ${tierName} agreement`}
      author="infinIT Managed Services"
      subject={`Agreement summary · pricing version ${stamp.pricingVersion}`}
      creator={`InfinIT Agreement Calculator ${stamp.appVersion}`}
      producer={`InfinIT Agreement Calculator ${stamp.appVersion}`}
      keywords={`export:${stamp.exportId} pricing:${stamp.pricingVersion} approval:${stamp.approvalState}`}
    >
      <Page size="LETTER" style={styles.page}>
        {pending ? <Text style={styles.watermark}>PENDING APPROVAL</Text> : null}
        <Header stamp={stamp} clientName={clientName} title="Managed services agreement" logo={logo} />
        <Text style={styles.confidential}>PROPOSED MONTHLY INVESTMENT · {tierName.toUpperCase()}</Text>

        <MetaGrid result={result} />

        <View style={styles.highlight}>
          <View>
            <Text style={styles.highlightLabel}>MONTHLY AGREEMENT RATE</Text>
            <Text style={styles.highlightValue}>{moneyRounded(t.headlineRate)}</Text>
          </View>
          <View>
            <Text style={styles.highlightSub}>{money(t.headlinePerUser)} per user / month</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WHAT IS INCLUDED</Text>
          {tier === "PINNACLE" ? (
            <>
              <Text>
                Everything in infinIT Advantage — 24/7 monitoring and remediation, patching, endpoint
                protection, email security, vulnerability management, network monitoring, and unlimited
                remote support — plus the Pinnacle security stack:
              </Text>
              <View style={{ marginTop: 6 }}>
                {result.pinnacle.lines.map((l) => (
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ALTERNATIVE TIER</Text>
          <View style={styles.row}>
            <Text>{otherName}</Text>
            <Text>
              {moneyRounded(other.headlineRate)} / month · {money(other.headlinePerUser)} per user
            </Text>
          </View>
          <Text style={[styles.rowMuted, { marginTop: 4 }]}>
            Difference of {moneyRounded(Math.abs(result.delta.discountedRate))} per month between tiers.
          </Text>
        </View>

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

        <Stamp stamp={stamp} />
      </Page>
    </Document>
  );
}

export function CogsDocument({ result, tier, clientName, notes, stamp, logo }: DocProps) {
  const t = tier === "PINNACLE" ? result.pinnacle : result.advantage;
  const tierName = tier === "PINNACLE" ? "infinIT Pinnacle" : "infinIT Advantage";
  const lines = tier === "PINNACLE" ? [...result.advantage.lines, ...result.pinnacle.lines] : result.advantage.lines;

  return (
    <Document
      title={`${clientName} — internal COGS worksheet`}
      author="infinIT Managed Services"
      subject={`Internal COGS worksheet · pricing version ${stamp.pricingVersion}`}
      creator={`InfinIT Agreement Calculator ${stamp.appVersion}`}
      producer={`InfinIT Agreement Calculator ${stamp.appVersion}`}
      keywords={`export:${stamp.exportId} pricing:${stamp.pricingVersion} approval:${stamp.approvalState}`}
    >
      <Page size="LETTER" style={styles.page}>
        <Header stamp={stamp} clientName={clientName} title="Internal COGS worksheet" logo={logo} />
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
              <View key={`${l.tier}-${l.key}`} style={styles.td}>
                <Text style={{ width: "38%" }}>
                  {l.label}
                  {l.tier === "PINNACLE" ? " (Pinnacle add-on)" : ""}
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
          <View style={[styles.row, { marginTop: 6 }]}>
            <Text style={styles.rowMuted}>
              Revenue split — tool {result.split.toolPct}% · labor {result.split.laborPct}% · gross margin{" "}
              {result.split.sgmPct}%
            </Text>
            <Text style={styles.rowMuted}>{result.multiplier.toFixed(2)}× multiplier</Text>
          </View>
        </View>

        {result.triggers.length ? (
          <View style={styles.approvalBlock}>
            <Text style={styles.approvalTitle}>NON-STANDARD PRICING — LEADERSHIP REVIEW</Text>
            {result.triggers.map((tr) => (
              <Text key={tr.code} style={{ marginTop: 3 }}>
                · {tr.message}
              </Text>
            ))}
            <Text style={{ marginTop: 5, fontFamily: "Helvetica-Bold" }}>
              Approval state: {stamp.approvalState}
            </Text>
          </View>
        ) : null}

        {notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NOTES</Text>
            <Text style={styles.notes}>{notes}</Text>
          </View>
        ) : null}

        <Stamp stamp={stamp} />
      </Page>
    </Document>
  );
}
