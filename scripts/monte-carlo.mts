import "dotenv/config";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  calculate,
  type CalcInputs,
  type CalcResult,
  type PricingConfig,
  type TriggerCode,
} from "../src/lib/pricing/engine";
import { getActiveConfig } from "../src/lib/pricing/config";
import { seedConfig } from "../src/lib/pricing/seed-config";
import { renderMonteCarloReport, type Simulation } from "../src/lib/pdf/monte-carlo-report";

/**
 * Randomised sweep of the pricing engine.
 *
 * The engine is pure, so every run is a property test: sample an environment
 * and a set of pricing levers, then assert the invariants the agreement model
 * depends on (never priced below cost, floor always honoured, Pinnacle never
 * cheaper than Advantage, every off-policy lever raises a review trigger).
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
  check: (result: CalcResult, config: PricingConfig, rng: () => number) => string | null;
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
        r.advantage.toolCost,
        r.advantage.costFloor,
        r.advantage.standardRate,
        r.advantage.discountedRate,
        r.advantage.headlineRate,
        r.advantage.perUser,
        r.pinnacle.toolCost,
        r.pinnacle.costFloor,
        r.pinnacle.standardRate,
        r.pinnacle.discountedRate,
        r.pinnacle.headlineRate,
        r.pinnacle.perUser,
      )
        ? null
        : "non-finite rate produced",
  },
  {
    id: "NEVER_BELOW_COST",
    title: "No quote is ever priced below cost",
    detail: "Both tiers stay at or above tool + imputed labor, even with the largest bundle discount applied.",
    check: (r) => {
      if (r.advantage.discountedRate < r.advantage.costFloor - EPS) {
        return `Advantage ${r.advantage.discountedRate.toFixed(2)} < cost floor ${r.advantage.costFloor.toFixed(2)}`;
      }
      if (r.pinnacle.discountedRate < r.pinnacle.costFloor - EPS) {
        return `Pinnacle ${r.pinnacle.discountedRate.toFixed(2)} < cost floor ${r.pinnacle.costFloor.toFixed(2)}`;
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
      const advPerUser = r.advantage.headlineRate / users;
      const pinnPerUser = r.pinnacle.headlineRate / users;
      if (advPerUser < r.inputs.perUserFloor - EPS) {
        return `Advantage ${advPerUser.toFixed(2)}/user < floor ${r.inputs.perUserFloor.toFixed(2)}`;
      }
      if (pinnPerUser < r.inputs.perUserFloor - EPS) {
        return `Pinnacle ${pinnPerUser.toFixed(2)}/user < floor ${r.inputs.perUserFloor.toFixed(2)}`;
      }
      return null;
    },
  },
  {
    id: "PINNACLE_PREMIUM",
    title: "Pinnacle is never cheaper than Advantage",
    detail: "Cost, standard rate and discounted rate all move in the right direction for the upgrade tier.",
    check: (r) => {
      if (r.pinnacle.toolCost < r.advantage.toolCost - EPS) return "Pinnacle tool cost below Advantage";
      if (r.pinnacle.standardRate < r.advantage.standardRate - EPS) return "Pinnacle standard rate below Advantage";
      if (r.pinnacle.discountedRate < r.advantage.discountedRate - EPS) {
        return "Pinnacle discounted rate below Advantage";
      }
      return null;
    },
  },
  {
    id: "SGM_IDENTITY",
    title: "The margin formula is exact",
    detail: "standardRate x (1 - SGM) equals the cost floor, so the slider means what it says.",
    check: (r, config) => {
      const sgm = Math.min(Math.max(r.inputs.sgmPct, 0), config.maxSgmPct) / 100;
      const implied = r.advantage.standardRate * (1 - sgm);
      return near(implied, r.advantage.costFloor, 1e-9)
        ? null
        : `implied cost ${implied.toFixed(4)} ≠ cost floor ${r.advantage.costFloor.toFixed(4)}`;
    },
  },
  {
    id: "SGM_CAPPED",
    title: "Service gross margin is capped at the version maximum",
    detail: "A slider beyond the published maximum is clamped rather than compounding into the rate.",
    check: (r, config) => {
      const capped = Math.min(Math.max(r.inputs.sgmPct, 0), config.maxSgmPct) / 100;
      const expected = (1 + config.laborMultiplier) / (1 - capped);
      return near(r.multiplier, expected, 1e-9) ? null : "multiplier does not match the capped SGM";
    },
  },
  {
    id: "DISCOUNT_BOUNDED",
    title: "A bundle discount never exceeds its published percentage",
    detail: "The applied discount sits between zero and the bundle's percentage of the standard rate.",
    check: (r) => {
      const pct = r.bundle.discountPct / 100;
      const maxDiscount = r.advantage.standardRate * pct + EPS;
      if (r.advantage.discount < -EPS) return "negative Advantage discount";
      if (r.advantage.discount > maxDiscount) return "Advantage discount exceeds the bundle percentage";
      if (r.pinnacle.discount > r.pinnacle.standardRate * pct + EPS) {
        return "Pinnacle discount exceeds the bundle percentage";
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
      if (r.inputs.sgmPct !== config.defaultSgmPct) expected.push("SGM_NON_DEFAULT");
      if (r.inputs.perUserFloor !== config.minPerUserFloor) expected.push("FLOOR_CHANGED");
      if (r.inputs.floorOverride) expected.push("FLOOR_OVERRIDE");
      if (r.inputs.addonMultiplier !== config.addonMultiplier) expected.push("ADDON_MULTIPLIER_NON_DEFAULT");
      if (r.advantage.belowFloor) expected.push("ADVANTAGE_BELOW_FLOOR");
      if (r.pinnacle.belowFloor) expected.push("PINNACLE_BELOW_FLOOR");
      if (r.advantage.discountCappedAtCost || r.pinnacle.discountCappedAtCost) {
        expected.push("DISCOUNT_CAPPED_AT_COST");
      }
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
        r.inputs.sgmPct === config.defaultSgmPct &&
        r.inputs.perUserFloor === config.minPerUserFloor &&
        r.inputs.addonMultiplier === config.addonMultiplier &&
        !r.inputs.floorOverride &&
        !r.advantage.belowFloor &&
        !r.pinnacle.belowFloor &&
        !r.advantage.discountCappedAtCost &&
        !r.pinnacle.discountCappedAtCost;
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
      if (bigger.advantage.toolCost < r.advantage.toolCost - EPS) return "tool cost fell as the environment grew";
      if (bigger.advantage.standardRate < r.advantage.standardRate - EPS) return "standard rate fell as the environment grew";
      return null;
    },
  },
  {
    id: "MONOTONIC_MARGIN",
    title: "Raising service gross margin never lowers the rate",
    detail: "A one-point SGM increase (within the cap) always produces a greater or equal standard rate.",
    check: (r, config) => {
      if (r.inputs.sgmPct >= config.maxSgmPct) return null;
      const richer = calculate(config, { ...r.inputs, sgmPct: r.inputs.sgmPct + 1 });
      return richer.advantage.standardRate < r.advantage.standardRate - EPS ? "standard rate fell as SGM rose" : null;
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
function sampleInputs(rng: () => number, config: PricingConfig): CalcInputs {
  const edge = rng() < 0.08;
  const users = edge ? pick(rng, [1, 1, 2, 3, 750, 1500]) : 3 + Math.floor(rng() ** 2 * 400);
  const devices = edge
    ? pick(rng, [0, 1, users * 6])
    : Math.max(0, Math.round(users * (0.6 + rng() * 1.8)));
  const locations = edge ? pick(rng, [0, 1, 40]) : 1 + Math.floor(rng() ** 2 * 12);

  const sgmPct = rng() < 0.45 ? config.defaultSgmPct : Math.round(rng() * 85 * 10) / 10;
  const perUserFloor = rng() < 0.6 ? config.minPerUserFloor : Math.round((20 + rng() * 280) * 100) / 100;
  const addonMultiplier = rng() < 0.6 ? config.addonMultiplier : Math.round(rng() * 900) / 100;

  return {
    users,
    devices,
    locations,
    sgmPct,
    perUserFloor,
    floorOverride: rng() < 0.15,
    addonMultiplier,
    bundleKey: pick(rng, config.bundles).key,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

async function main() {
  const dbConfig = await getActiveConfig().catch(() => null);
  const config = dbConfig ?? seedConfig();
  const configSource = dbConfig ? "published pricing version (database)" : "seed pricing version (no database)";

  const rng = mulberry32(SEED);
  const invariantFailures = new Map<string, number>();
  const triggerCounts = new Map<string, number>();
  const failures: Failure[] = [];
  const advPerUser: number[] = [];
  const pinnPerUser: number[] = [];
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
    if (result.advantage.belowFloor || result.pinnacle.belowFloor) belowFloor += 1;
    if (result.advantage.discountCappedAtCost || result.pinnacle.discountCappedAtCost) discountCapped += 1;
    for (const trigger of result.triggers) {
      triggerCounts.set(trigger.code, (triggerCounts.get(trigger.code) ?? 0) + 1);
    }

    advPerUser.push(result.advantage.headlinePerUser);
    pinnPerUser.push(result.pinnacle.headlinePerUser);
    if (result.advantage.headlineRate > 0) {
      realisedMargin.push(
        ((result.advantage.headlineRate - result.advantage.toolCost) / result.advantage.headlineRate) * 100,
      );
    }
  }

  advPerUser.sort((a, b) => a - b);
  pinnPerUser.sort((a, b) => a - b);
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
      { label: "Advantage $/user/month", values: advPerUser },
      { label: "Pinnacle $/user/month", values: pinnPerUser },
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
