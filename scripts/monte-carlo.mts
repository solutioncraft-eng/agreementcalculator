import "dotenv/config";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { CalcInputs, CalcResult, CostPlusConfig, TriggerCode } from "../src/lib/pricing/engine";
import { calculate } from "../src/lib/pricing/models";
import { seedConfig } from "../src/lib/pricing/seed-config";
import { renderMonteCarloReport, type Simulation } from "../src/lib/pdf/monte-carlo-report";

/**
 * Randomised sweep of the pricing engine.
 *
 * The engine is pure, so every run is a property test: sample an environment
 * and a set of pricing levers, then assert the invariants the agreement model
 * depends on (never priced below cost, floor always honoured, each offering
 * never cheaper than the one below it, every off-policy lever raises a review
 * trigger).
 * Distribution stats come out of the same pass so leadership can see how often
 * a quote lands outside policy and where the rates cluster.
 */

const TRIALS = Number(process.env.MC_TRIALS ?? 25000);
const SEED = Number(process.env.MC_SEED ?? 20260825);
const EPS = 1e-6;

/** Deterministic PRNG so a report can be reproduced from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface InvariantSpec {
  id: string;
  title: string;
  detail: string;
  /** Returns an explanation when violated, or null when it holds. */
  check: (result: CalcResult, config: CostPlusConfig, rng: () => number) => string | null;
}

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

const finite = (...values: number[]) => values.every((v) => Number.isFinite(v));

export const INVARIANTS: InvariantSpec[] = [
  {
    id: "FINITE",
    title: "Every rate is a finite number",
    detail: "No NaN or Infinity reaches the UI or a PDF, whatever the inputs.",
    check: (r) =>
      finite(
        r.multiplier,
        ...r.tiers.flatMap((t) => [
          t.toolCost,
          t.costFloor,
          t.standardRate,
          t.discountedRate,
          t.headlineRate,
          t.perUser,
        ]),
      )
        ? null
        : "non-finite rate produced",
  },
  {
    id: "NEVER_BELOW_COST",
    title: "No quote is ever priced below cost",
    detail:
      "Every offering stays at or above tool + imputed labor, even with the largest bundle discount applied.",
    check: (r) => {
      for (const tier of r.tiers) {
        if (tier.discountedRate < tier.costFloor - EPS) {
          return `${tier.label} ${tier.discountedRate.toFixed(2)} < cost floor ${tier.costFloor.toFixed(2)}`;
        }
      }
      return null;
    },
  },
  {
    id: "FLOOR_HONOURED",
    title: "The per-user floor holds unless it is overridden",
    detail: "Without an explicit override, the headline rate never falls below the per-user floor.",
    check: (r) => {
      if (r.inputs.floorOverride) return null;
      const users = Math.max(r.inputs.users, 1);
      for (const tier of r.tiers) {
        const perUser = tier.headlineRate / users;
        if (perUser < r.inputs.perUserFloor - EPS) {
          return `${tier.label} ${perUser.toFixed(2)}/user < floor ${r.inputs.perUserFloor.toFixed(2)}`;
        }
      }
      return null;
    },
  },
  {
    id: "LADDER_PREMIUM",
    title: "Each offering is never cheaper than the one below it",
    detail: "Cost, standard rate and discounted rate all move in the right direction up the ladder.",
    check: (r) => {
      for (let i = 1; i < r.tiers.length; i += 1) {
        const lower = r.tiers[i - 1];
        const upper = r.tiers[i];
        if (upper.toolCost < lower.toolCost - EPS) return `${upper.label} tool cost below ${lower.label}`;
        if (upper.standardRate < lower.standardRate - EPS) {
          return `${upper.label} standard rate below ${lower.label}`;
        }
        if (upper.discountedRate < lower.discountedRate - EPS) {
          return `${upper.label} discounted rate below ${lower.label}`;
        }
      }
      return null;
    },
  },
  {
    id: "SGM_IDENTITY",
    title: "The margin formula is exact",
    detail: "standardRate x (1 - SGM) equals the cost floor, so the slider means what it says.",
    check: (r, config) => {
      const sgm = Math.min(Math.max(r.inputs.sgmPct, 0), config.settings.maxSgmPct) / 100;
      const base = r.tiers[0];
      const implied = base.standardRate * (1 - sgm);
      return near(implied, base.costFloor, 1e-9)
        ? null
        : `implied cost ${implied.toFixed(4)} ≠ cost floor ${base.costFloor.toFixed(4)}`;
    },
  },
  {
    id: "SGM_CAPPED",
    title: "Service gross margin is capped at the version maximum",
    detail: "A slider beyond the published maximum is clamped rather than compounding into the rate.",
    check: (r, config) => {
      const capped = Math.min(Math.max(r.inputs.sgmPct, 0), config.settings.maxSgmPct) / 100;
      const expected = (1 + config.settings.laborMultiplier) / (1 - capped);
      return near(r.multiplier, expected, 1e-9) ? null : "multiplier does not match the capped SGM";
    },
  },
  {
    id: "DISCOUNT_BOUNDED",
    title: "A bundle discount never exceeds its published percentage",
    detail: "The applied discount sits between zero and the bundle's percentage of the standard rate.",
    check: (r) => {
      const pct = r.bundle.discountPct / 100;
      for (const tier of r.tiers) {
        if (tier.discount < -EPS) return `negative ${tier.label} discount`;
        if (tier.discount > tier.standardRate * pct + EPS) {
          return `${tier.label} discount exceeds the bundle percentage`;
        }
      }
      return null;
    },
  },
  {
    id: "OFF_POLICY_FLAGGED",
    title: "Every off-policy lever raises a review trigger",
    detail:
      "A non-default margin, a changed floor, an override, a capped discount or a non-default add-on multiplier always flags the quote for leadership.",
    check: (r, config) => {
      const expected: TriggerCode[] = [];
      if (r.inputs.sgmPct !== config.settings.defaultSgmPct) expected.push("SGM_NON_DEFAULT");
      if (r.inputs.perUserFloor !== config.settings.minPerUserFloor) expected.push("FLOOR_CHANGED");
      if (r.inputs.floorOverride) expected.push("FLOOR_OVERRIDE");
      if (r.inputs.addonMultiplier !== config.settings.addonMultiplier) expected.push("ADDON_MULTIPLIER_NON_DEFAULT");
      if (r.tiers.some((t) => t.belowFloor)) expected.push("TIER_BELOW_FLOOR");
      if (r.tiers.some((t) => t.discountCappedAtCost)) expected.push("DISCOUNT_CAPPED_AT_COST");
      const raised = new Set(r.triggers.map((t) => t.code));
      const missing = expected.filter((code) => !raised.has(code));
      if (missing.length > 0) return `missing trigger(s) ${missing.join(", ")}`;
      if (r.needsApproval !== r.triggers.length > 0) return "needsApproval disagrees with the trigger list";
      return null;
    },
  },
  {
    id: "STANDARD_NOT_FLAGGED",
    title: "A standard quote is never flagged",
    detail:
      "With published levers, no override and a rate above the floor, the quote stays exportable without review.",
    check: (r, config) => {
      const onPolicy =
        r.inputs.sgmPct === config.settings.defaultSgmPct &&
        r.inputs.perUserFloor === config.settings.minPerUserFloor &&
        r.inputs.addonMultiplier === config.settings.addonMultiplier &&
        !r.inputs.floorOverride &&
        !r.tiers.some((t) => t.belowFloor) &&
        !r.tiers.some((t) => t.discountCappedAtCost);
      if (!onPolicy) return null;
      return r.needsApproval ? `flagged on-policy quote: ${r.triggers.map((t) => t.code).join(", ")}` : null;
    },
  },
  {
    id: "MONOTONIC_SCALE",
    title: "More users, devices or locations never lowers the price",
    detail: "Re-running the same quote with one more of each unit produces a rate that is greater or equal.",
    check: (r, config) => {
      const bigger = calculate(config, {
        ...r.inputs,
        users: r.inputs.users + 1,
        devices: r.inputs.devices + 1,
        locations: r.inputs.locations + 1,
      });
      if (bigger.tiers[0].toolCost < r.tiers[0].toolCost - EPS) return "tool cost fell as the environment grew";
      if (bigger.tiers[0].standardRate < r.tiers[0].standardRate - EPS) {
        return "standard rate fell as the environment grew";
      }
      return null;
    },
  },
  {
    id: "MONOTONIC_MARGIN",
    title: "Raising service gross margin never lowers the rate",
    detail: "A one-point SGM increase (within the cap) always produces a greater or equal standard rate.",
    check: (r, config) => {
      if (r.inputs.sgmPct >= config.settings.maxSgmPct) return null;
      const richer = calculate(config, { ...r.inputs, sgmPct: r.inputs.sgmPct + 1 });
      return richer.tiers[0].standardRate < r.tiers[0].standardRate - EPS
        ? "standard rate fell as SGM rose"
        : null;
    },
  },
  {
    id: "COST_CONFIDENTIAL_SPLIT",
    title: "The cost/labor/margin split always adds up",
    detail: "Tool %, labor % and margin % sum to 100 (±1 for rounding) so the PDF's split panel is coherent.",
    check: (r) => {
      const total = r.split.toolPct + r.split.laborPct + r.split.sgmPct;
      return Math.abs(total - 100) <= 1 ? null : `split sums to ${total}`;
    },
  },
];

interface Failure {
  invariantId: string;
  inputs: CalcInputs;
  message: string;
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)];
}

/** Weighted mix of realistic client shapes plus deliberate edge cases. */
function sampleInputs(rng: () => number, config: CostPlusConfig): CalcInputs {
  const edge = rng() < 0.08;
  const users = edge ? pick(rng, [1, 1, 2, 3, 750, 1500]) : 3 + Math.floor(rng() ** 2 * 400);
  const devices = edge
    ? pick(rng, [0, 1, users * 6])
    : Math.max(0, Math.round(users * (0.6 + rng() * 1.8)));
  const locations = edge ? pick(rng, [0, 1, 40]) : 1 + Math.floor(rng() ** 2 * 12);

  const sgmPct = rng() < 0.45 ? config.settings.defaultSgmPct : Math.round(rng() * 85 * 10) / 10;
  const perUserFloor = rng() < 0.6 ? config.settings.minPerUserFloor : Math.round((20 + rng() * 280) * 100) / 100;
  const addonMultiplier = rng() < 0.6 ? config.settings.addonMultiplier : Math.round(rng() * 900) / 100;

  return {
    users,
    devices,
    locations,
    sgmPct,
    perUserFloor,
    floorOverride: rng() < 0.15,
    addonMultiplier,
    markupMultiple: 0,
    bundleKey: pick(rng, config.bundles).key,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

async function main() {
  const config = seedConfig();
  const configSource = "seed cost-plus pricing version";

  const rng = mulberry32(SEED);
  const invariantFailures = new Map<string, number>();
  const triggerCounts = new Map<string, number>();
  const failures: Failure[] = [];
  const perUserByTier = new Map<string, number[]>();
  const realisedMargin: number[] = [];

  let flagged = 0;
  let belowFloor = 0;
  let discountCapped = 0;

  for (let trial = 0; trial < TRIALS; trial += 1) {
    const inputs = sampleInputs(rng, config);
    const result = calculate(config, inputs);

    for (const invariant of INVARIANTS) {
      const message = invariant.check(result, config, rng);
      if (message) {
        invariantFailures.set(invariant.id, (invariantFailures.get(invariant.id) ?? 0) + 1);
        if (failures.length < 12) failures.push({ invariantId: invariant.id, inputs, message });
      }
    }

    if (result.needsApproval) flagged += 1;
    if (result.tiers.some((t) => t.belowFloor)) belowFloor += 1;
    if (result.tiers.some((t) => t.discountCappedAtCost)) discountCapped += 1;
    for (const trigger of result.triggers) {
      triggerCounts.set(trigger.code, (triggerCounts.get(trigger.code) ?? 0) + 1);
    }

    for (const tier of result.tiers) {
      const bucket = perUserByTier.get(tier.label);
      if (bucket) bucket.push(tier.headlinePerUser);
      else perUserByTier.set(tier.label, [tier.headlinePerUser]);
    }

    const base = result.tiers[0];
    if (base.headlineRate > 0) {
      realisedMargin.push(((base.headlineRate - base.toolCost) / base.headlineRate) * 100);
    }
  }

  for (const values of perUserByTier.values()) values.sort((a, b) => a - b);
  realisedMargin.sort((a, b) => a - b);

  const simulation: Simulation = {
    trials: TRIALS,
    seed: SEED,
    configSource,
    config,
    invariants: INVARIANTS.map((invariant) => ({
      id: invariant.id,
      title: invariant.title,
      detail: invariant.detail,
      failures: invariantFailures.get(invariant.id) ?? 0,
    })),
    failures,
    flaggedPct: (flagged / TRIALS) * 100,
    belowFloorPct: (belowFloor / TRIALS) * 100,
    discountCappedPct: (discountCapped / TRIALS) * 100,
    triggerCounts: [...triggerCounts.entries()]
      .map(([code, count]) => ({ code, count, pct: (count / TRIALS) * 100 }))
      .sort((a, b) => b.count - a.count),
    distributions: [
      ...[...perUserByTier.entries()].map(([label, values]) => ({
        label: `${label} $/user/month`,
        values,
      })),
      { label: "Realised margin over tool cost (%)", values: realisedMargin },
    ].map(({ label, values }) => ({
      label,
      min: values[0] ?? 0,
      p10: percentile(values, 10),
      median: percentile(values, 50),
      p90: percentile(values, 90),
      max: values[values.length - 1] ?? 0,
    })),
    ranAt: new Date(),
  };

  const { bytes, checksum } = await renderMonteCarloReport(simulation);
  const outPath = process.env.MC_OUT ?? "monte-carlo-report.pdf";
  await writeFile(outPath, bytes);

  const totalFailures = [...invariantFailures.values()].reduce((sum, n) => sum + n, 0);
  console.log(
    [
      `trials            ${TRIALS}`,
      `seed              ${SEED}`,
      `config            ${config.versionLabel} (${configSource})`,
      `invariants        ${INVARIANTS.length}`,
      `violations        ${totalFailures}`,
      `flagged for review ${simulation.flaggedPct.toFixed(1)}%`,
      `report            ${outPath} (sha256 ${checksum.slice(0, 16)})`,
      ...simulation.invariants
        .filter((invariant) => invariant.failures > 0)
        .map((invariant) => `  ${invariant.id} failed ${invariant.failures}×`),
      ...failures.slice(0, 5).map((failure) => `  ${failure.invariantId}: ${failure.message}`),
    ].join("\n"),
  );
  if (totalFailures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    // Keep the checksum of the input set stable in the log for reproducibility.
    const stamp = createHash("sha256").update(`${SEED}:${TRIALS}`).digest("hex").slice(0, 12);
    console.log(`run id            ${stamp}`);
  });
