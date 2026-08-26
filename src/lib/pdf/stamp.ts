/**
 * How a document may be used. `STANDARD` is a compliant configuration that
 * needed no sign-off, `APPROVED` was signed off by leadership, and
 * `PENDING_APPROVAL` is watermarked as unusable with a client.
 */
export type ApprovalState = "STANDARD" | "APPROVED" | "PENDING_APPROVAL";

export interface StampInfo {
  exportId: string;
  exportedAt: Date;
  exportedBy: string;
  appVersion: string;
  pricingVersion: string;
  costBasis: string;
  approvalState: ApprovalState;
  quoteRef?: string | null;
}

/** Human-readable approval state, carrying the quote reference when there is one. */
export function approvalLabel(stamp: StampInfo): string {
  return stamp.quoteRef ? `${stamp.approvalState} \u00b7 ${stamp.quoteRef}` : stamp.approvalState;
}
