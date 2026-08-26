import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { money, type CalcInputs, type CostPlusConfig } from "@/lib/pricing/engine";
import { APP_VERSION_STAMP } from "@/lib/version";
import { brandLogo, newExportId, renderPdf } from "./render";
import { brand, styles } from "./theme";

export interface InvariantOutcome {
  id: string;
  title: string;
  detail: string;
  failures: number;
}

export interface DistributionRow {
  label: string;
  min: number;
  p10: number;
  median: number;
  p90: number;
  max: number;
}

export interface Simulation {
  trials: number;
  seed: number;
  configSource: string;
  config: CostPlusConfig;
  invariants: InvariantOutcome[];
  failures: { invariantId: string; inputs: CalcInputs; message: string }[];
  flaggedPct: number;
  belowFloorPct: number;
  discountCappedPct: number;
  triggerCounts: { code: string; count: number; pct: number }[];
  distributions: DistributionRow[];
  ranAt: Date;
}

function utc(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const num = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Cell({ width, align, bold, color, children }: {
  width: string;
  align?: "left" | "right";
  bold?: boolean;
  color?: string;
  children: string;
}) {
  return (
    <Text
      style={{
        width,
        textAlign: align ?? "left",
        fontFamily: bold ? "Helvetica-Bold" : "Helvetica",
        color: color ?? brand.ink,
      }}
    >
      {children}
    </Text>
  );
}

function MonteCarloDocument({ sim, logo }: { sim: Simulation; logo?: Buffer }) {
  const violations = sim.invariants.reduce((sum, i) => sum + i.failures, 0);
  const verdict = violations === 0 ? "PASS" : "FAIL";
  const exportId = newExportId();

  return (
    <Document
      title={`Pricing engine Monte Carlo report — ${sim.trials.toLocaleString("en-US")} trials`}
      author="Agreement Calculator"
      subject={`Randomised verification of pricing version ${sim.config.versionLabel}`}
      creator={`Agreement Calculator ${APP_VERSION_STAMP}`}
      producer={`Agreement Calculator ${APP_VERSION_STAMP}`}
      keywords={`monte-carlo seed:${sim.seed} trials:${sim.trials} pricing:${sim.config.versionLabel}`}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
            {logo ? <Image style={styles.logo} src={logo} /> : <Text style={styles.title}>Agreement Calculator</Text>}
            <Text style={styles.eyebrow}>PRICING ENGINE VERIFICATION</Text>
            <Text style={styles.title}>Monte Carlo simulation</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.metaLine}>Run {utc(sim.ranAt)}</Text>
            <Text style={styles.metaLine}>Pricing version {sim.config.versionLabel}</Text>
            <Text style={styles.metaLine}>Cost basis {sim.config.costBasis}</Text>
            <Text style={styles.metaLine}>Seed {sim.seed}</Text>
          </View>
        </View>

        <Text style={styles.confidential}>INTERNAL USE ONLY · TOOL COSTS AND MARGINS ARE CONFIDENTIAL</Text>

        <View style={styles.metaGrid}>
          {[
            ["TRIALS", sim.trials.toLocaleString("en-US")],
            ["INVARIANTS", String(sim.invariants.length)],
            ["VIOLATIONS", String(violations)],
            ["VERDICT", verdict],
          ].map(([label, value]) => (
            <View key={label} style={styles.metaCell}>
              <Text style={styles.metaLabel}>{label}</Text>
              <Text
                style={{
                  ...styles.metaValue,
                  color: label === "VERDICT" && verdict === "FAIL" ? brand.orange : brand.navy,
                }}
              >
                {value}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>METHOD</Text>
          <Text style={styles.notes}>
            {sim.trials.toLocaleString("en-US")} randomised quotes were priced through the live engine against the{" "}
            {sim.configSource}. Each trial samples a client environment (users, devices, locations — including
            single-user, zero-device and multi-site edge cases) and a set of pricing levers (service gross margin,
            per-user floor, floor override, add-on multiplier, bundle), then asserts the invariants below. Sampling is
            seeded, so this run reproduces exactly from seed {sim.seed}. No quote from this run is persisted; the
            engine is pure and reads nothing but the pricing version.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INVARIANTS</Text>
          <View style={styles.table}>
            <View style={styles.th}>
              <Cell width="62%">PROPERTY ASSERTED ON EVERY TRIAL</Cell>
              <Cell width="20%" align="right">VIOLATIONS</Cell>
              <Cell width="18%" align="right">RESULT</Cell>
            </View>
            {sim.invariants.map((invariant) => (
              <View key={invariant.id} style={styles.td} wrap={false}>
                <View style={{ width: "62%" }}>
                  <Text style={{ fontFamily: "Helvetica-Bold", color: brand.navy }}>{invariant.title}</Text>
                  <Text style={{ color: brand.slate, fontSize: 8.5 }}>{invariant.detail}</Text>
                </View>
                <Cell width="20%" align="right">{invariant.failures.toLocaleString("en-US")}</Cell>
                <Cell
                  width="18%"
                  align="right"
                  bold
                  color={invariant.failures === 0 ? brand.navy : brand.orange}
                >
                  {invariant.failures === 0 ? "PASS" : "FAIL"}
                </Cell>
              </View>
            ))}
          </View>
        </View>

        {sim.failures.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>FIRST FAILING CASES</Text>
            {sim.failures.map((failure, index) => (
              <Text key={index} style={{ fontSize: 8.5, color: brand.orange }}>
                {failure.invariantId}: {failure.message} — users {failure.inputs.users}, devices{" "}
                {failure.inputs.devices}, locations {failure.inputs.locations}, SGM {failure.inputs.sgmPct}%, floor{" "}
                {money(failure.inputs.perUserFloor)}, override {String(failure.inputs.floorOverride)}, add-on{" "}
                {failure.inputs.addonMultiplier}×, bundle {failure.inputs.bundleKey}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.stamp} fixed>
          <Text>
            Simulation {exportId} · run {utc(sim.ranAt)} · app {APP_VERSION_STAMP} · pricing version{" "}
            {sim.config.versionLabel} ({sim.config.costBasis}) · seed {sim.seed} · trials{" "}
            {sim.trials.toLocaleString("en-US")}
          </Text>
          <Text>
            Verification artefact for the Agreement Calculator pricing engine. Not a client-facing document.
          </Text>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REVIEW WORKFLOW BEHAVIOUR</Text>
          <View style={styles.metaGrid}>
            {[
              ["FLAGGED FOR REVIEW", `${num(sim.flaggedPct, 1)}%`],
              ["BELOW PER-USER FLOOR", `${num(sim.belowFloorPct, 1)}%`],
              ["DISCOUNT CAPPED AT COST", `${num(sim.discountCappedPct, 1)}%`],
              ["EXPORT BLOCKED", `${num(sim.flaggedPct, 1)}%`],
            ].map(([label, value]) => (
              <View key={label} style={styles.metaCell}>
                <Text style={styles.metaLabel}>{label}</Text>
                <Text style={styles.metaValue}>{value}</Text>
              </View>
            ))}
          </View>
          <Text style={{ ...styles.notes, marginTop: 12 }}>
            A flagged quote cannot be exported until a leader approves it, so the flagged share is also the share of
            simulated quotes that would enter the review queue. The sampler deliberately over-weights off-policy
            levers, so these rates describe the sampler, not real deal flow — what matters is that every off-policy
            lever was detected.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TRIGGERS RAISED</Text>
          <View style={styles.table}>
            <View style={styles.th}>
              <Cell width="55%">TRIGGER</Cell>
              <Cell width="22%" align="right">TRIALS</Cell>
              <Cell width="23%" align="right">SHARE</Cell>
            </View>
            {sim.triggerCounts.map((trigger) => (
              <View key={trigger.code} style={styles.td}>
                <Cell width="55%">{trigger.code}</Cell>
                <Cell width="22%" align="right">{trigger.count.toLocaleString("en-US")}</Cell>
                <Cell width="23%" align="right">{`${num(trigger.pct, 1)}%`}</Cell>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RATE DISTRIBUTIONS</Text>
          <View style={styles.table}>
            <View style={styles.th}>
              <Cell width="40%">MEASURE</Cell>
              <Cell width="12%" align="right">MIN</Cell>
              <Cell width="12%" align="right">P10</Cell>
              <Cell width="12%" align="right">MEDIAN</Cell>
              <Cell width="12%" align="right">P90</Cell>
              <Cell width="12%" align="right">MAX</Cell>
            </View>
            {sim.distributions.map((row) => (
              <View key={row.label} style={styles.td}>
                <Cell width="40%">{row.label}</Cell>
                <Cell width="12%" align="right">{num(row.min)}</Cell>
                <Cell width="12%" align="right">{num(row.p10)}</Cell>
                <Cell width="12%" align="right">{num(row.median)}</Cell>
                <Cell width="12%" align="right">{num(row.p90)}</Cell>
                <Cell width="12%" align="right">{num(row.max)}</Cell>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRICING VERSION UNDER TEST</Text>
          <View style={styles.table}>
            {[
              ["Labor multiplier", `${sim.config.settings.laborMultiplier}×`],
              ["Default service gross margin", `${sim.config.settings.defaultSgmPct}%`],
              ["Maximum service gross margin", `${sim.config.settings.maxSgmPct}%`],
              ["Minimum per-user floor", money(sim.config.settings.minPerUserFloor)],
              ["Add-on multiplier", `${sim.config.settings.addonMultiplier}×`],
              ["Active COGS items", String(sim.config.items.length)],
              ["Bundles", sim.config.bundles.map((b) => b.label).join(", ")],
            ].map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={styles.rowMuted}>{label}</Text>
                <Text style={{ fontFamily: "Helvetica-Bold", color: brand.navy }}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.stamp} fixed>
          <Text>
            Simulation {exportId} · run {utc(sim.ranAt)} · app {APP_VERSION_STAMP} · pricing version{" "}
            {sim.config.versionLabel} ({sim.config.costBasis}) · seed {sim.seed}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderMonteCarloReport(sim: Simulation): Promise<{ bytes: Buffer; checksum: string }> {
  const logo = await brandLogo();
  const doc = (<MonteCarloDocument sim={sim} logo={logo} />) as unknown as ReactElement<DocumentProps>;
  return renderPdf(doc);
}
