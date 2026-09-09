/**
 * Groups an offering's service lines under customer-facing headings. Pure so
 * it can be tested without loading react-pdf.
 */

export const SERVICE_CATEGORIES = [
  "Security & Threat Protection",
  "Proactive Maintenance",
  "Data Protection & Recovery",
  "Service & Support",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/** Delivered by every offering regardless of tooling, so always listed. */
export const BASELINE_INCLUSIONS: { category: ServiceCategory; label: string }[] = [
  { category: "Proactive Maintenance", label: "Patch management" },
  { category: "Service & Support", label: "Unlimited remote support" },
  { category: "Service & Support", label: "24/7 monitoring and remediation" },
];

const KEYWORDS: [RegExp, ServiceCategory][] = [
  [/backup|recover|continuity|disaster/i, "Data Protection & Recovery"],
  [
    /secur|threat|endpoint|edr|mdr|xdr|antivirus|malware|phish|spam|mfa|multi-factor|password|privileged|awareness|firewall|dns/i,
    "Security & Threat Protection",
  ],
  [/monitor|patch|maintenance|rmm|network|vulnerab|lifecycle|update/i, "Proactive Maintenance"],
];

/** The configured heading, else a guess from the label, else Service & Support. */
export function serviceCategory(line: { label: string; category?: string | null }): string {
  const configured = line.category?.trim();
  if (configured) return configured;
  for (const [pattern, category] of KEYWORDS) {
    if (pattern.test(line.label)) return category;
  }
  return "Service & Support";
}

export interface InclusionGroup {
  category: string;
  items: string[];
}

/**
 * Template headings first in their fixed order, then any custom headings
 * alphabetically. Line labels keep their configured order within a group;
 * baseline items follow them. Duplicates (by label) collapse.
 */
export function groupInclusions(lines: { label: string; category?: string | null }[]): InclusionGroup[] {
  const groups = new Map<string, string[]>();
  const add = (category: string, label: string) => {
    const items = groups.get(category) ?? [];
    if (!items.some((item) => item.toLowerCase() === label.toLowerCase())) items.push(label);
    groups.set(category, items);
  };
  for (const line of lines) add(serviceCategory(line), line.label);
  for (const base of BASELINE_INCLUSIONS) add(base.category, base.label);

  const fixed = SERVICE_CATEGORIES.filter((c) => groups.has(c)).map((c) => c as string);
  const custom = [...groups.keys()].filter((c) => !fixed.includes(c)).sort((a, b) => a.localeCompare(b));
  return [...fixed, ...custom].map((category) => ({ category, items: groups.get(category) ?? [] }));
}
