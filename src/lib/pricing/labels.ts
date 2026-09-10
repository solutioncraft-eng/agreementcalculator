import { SEED_VERSION_LABEL } from "./defaults";

/// Next label: bumps the trailing number of the newest label, e.g. 2026.3 → 2026.4.
export function nextLabel(previous?: string): string {
  if (!previous) return SEED_VERSION_LABEL;
  const match = /^(.*?)(\d+)$/.exec(previous);
  if (!match) return `${previous}.1`;
  return `${match[1]}${Number(match[2]) + 1}`;
}

/**
 * The first label after `previous` that no version in the workspace holds.
 * Archived versions keep their labels, so bumping once is not enough to satisfy
 * the unique label per workspace.
 */
export function freeLabel(previous: string | undefined, taken: Iterable<string>): string {
  const used = new Set(taken);
  let candidate = nextLabel(previous);
  while (used.has(candidate)) candidate = nextLabel(candidate);
  return candidate;
}
