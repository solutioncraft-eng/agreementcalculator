/**
 * Facts the privacy policy and the terms both state, kept in one place so they
 * cannot drift apart — a policy that names a different contact address, or is
 * dated differently, from the terms beside it is worse than no policy.
 */

/** Who provides the service, as it should be named to a reader. */
export const PROVIDER = "SolutionCraft";

/** Where privacy and contractual questions go. */
export const LEGAL_CONTACT = "hello@agreementcalculator.com";

/** Last substantive change, ISO for machines. */
export const LEGAL_UPDATED = "2026-09-02";

export function legalUpdatedLabel(): string {
  return new Date(`${LEGAL_UPDATED}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
