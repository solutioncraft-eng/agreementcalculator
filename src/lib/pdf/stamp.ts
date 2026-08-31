/**
 * How a document may be used. `STANDARD` is a compliant configuration that
 * needed no sign-off, `APPROVED` was signed off by leadership, and
 * `PENDING_APPROVAL` is watermarked as unusable with a client.
 */
export type ApprovalState = "STANDARD" | "APPROVED" | "PENDING_APPROVAL";

/** Who granted leadership approval, and when. */
export interface ApprovalRecord {
  by: string;
  role: string;
  at: Date;
}

export interface StampInfo {
  exportId: string;
  exportedAt: Date;
  exportedBy: string;
  appVersion: string;
  pricingVersion: string;
  costBasis: string;
  approvalState: ApprovalState;
  quoteRef?: string | null;
  approval?: ApprovalRecord | null;
  /** IANA zone of the exporting user, so dates read in their local time. */
  timeZone?: string | null;
}

/** Human-readable approval state, carrying the quote reference when there is one. */
export function approvalLabel(stamp: StampInfo): string {
  return stamp.quoteRef ? `${stamp.approvalState} \u00b7 ${stamp.quoteRef}` : stamp.approvalState;
}
