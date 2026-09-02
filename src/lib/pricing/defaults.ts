/**
 * Starting pricing content for a new workspace, carried over from the
 * standalone InfinIT calculator v11. A tenant on the cost-plus model gets
 * this as an editable draft; it is a starting point, not a product default.
 *
 * Labor multiplier note (from v11): labor is imputed as a multiple of tool
 * cost and is a proxy for real delivery labor, not a markup — it must be
 * re-based whenever tool cost moves without real labor moving with it.
 *   v9  4.00 (tool basis $234.20 on a 25u/30d/2l reference client)
 *   v11 3.10 (tool basis $306.50 — SentinelOne 2.15→2.85, AutoElevate added)
 */
export const SEED_VERSION_LABEL = "2026.3";
export const SEED_COST_BASIS = "Q3 2026";

export const SEED_COST_PLUS_SETTINGS = {
  laborMultiplier: 3.1,
  defaultSgmPct: 50,
  maxSgmPct: 70,
  minPerUserFloor: 100,
  addonMultiplier: 4.83,
  coManagedLaborMultiplier: 1,
};

/**
 * Offerings a new workspace starts with, named and costed generically so an
 * admin renames and re-costs them rather than inheriting someone else's stack:
 * a parent agreement, an add-on built on it, and a standalone co-managed
 * agreement that shares some tooling but carries its own membership. Together
 * they demonstrate both ways to compose an offering. Any of them can be
 * renamed, re-parented or removed while the version is still a draft.
 */
export const SEED_SERVICE_TIERS = [
  {
    key: "parent",
    label: "Parent Agreement",
    description: "Fully managed core services",
    parentKey: null,
    coManaged: false,
  },
  {
    key: "addon",
    label: "Add-On Agreement",
    description: "Parent Agreement plus the advanced security stack",
    parentKey: "parent",
    coManaged: false,
  },
  {
    key: "co-managed",
    label: "Co-Managed Agreement",
    description: "Standalone: delivered alongside the client's own IT staff",
    parentKey: null,
    coManaged: true,
  },
] as const;

/**
 * Reference costs on a 25-user / 30-device / 2-location client. An item may
 * serve several offerings: the co-managed agreement re-uses the shared tooling
 * it needs and adds the two items only it carries.
 */
export const SEED_COGS_ITEMS = [
  { key: "rmm", label: "Remote monitoring and management", unit: "DEVICE", tierKeys: ["parent", "co-managed"], unitCost: 3.49 },
  { key: "edr", label: "Endpoint detection and response", unit: "DEVICE", tierKeys: ["parent", "co-managed"], unitCost: 2.85 },
  { key: "pam", label: "Privileged access management", unit: "DEVICE", tierKeys: ["parent"], unitCost: 1.71 },
  { key: "email", label: "Email security and spam filtering", unit: "USER", tierKeys: ["parent", "co-managed"], unitCost: 1.5 },
  { key: "vuln", label: "Vulnerability monitoring", unit: "DEVICE", tierKeys: ["parent"], unitCost: 0.15 },
  { key: "net", label: "Network monitoring", unit: "LOCATION", tierKeys: ["parent"], unitCost: 23 },
  { key: "mfa", label: "Multi-factor authentication", unit: "USER", tierKeys: ["addon"], unitCost: 3 },
  { key: "backup", label: "Cloud mailbox and file backup", unit: "USER", tierKeys: ["addon"], unitCost: 3 },
  { key: "pw", label: "Password manager", unit: "USER", tierKeys: ["addon"], unitCost: 2.25 },
  { key: "sat", label: "Security awareness training", unit: "USER", tierKeys: ["addon"], unitCost: 1.5 },
  { key: "portal", label: "Shared service desk portal", unit: "USER", tierKeys: ["co-managed"], unitCost: 2 },
  { key: "docs", label: "Documentation and asset platform", unit: "USER", tierKeys: ["co-managed"], unitCost: 1.25 },
] as const;

export const SEED_BUNDLES = [
  { key: "voip", label: "VoIP only", description: "5% off managed services", discountPct: 5, highlight: false },
  { key: "isp", label: "ISP only", description: "5% off managed services", discountPct: 5, highlight: false },
  { key: "both", label: "VoIP + ISP", description: "15% off managed services", discountPct: 15, highlight: true },
] as const;

/** Default calculator inputs for a new quote. */
export const DEFAULT_INPUTS = { users: 25, devices: 30, locations: 2 };

/** How long a submitted quote request is retained before purge. */
export const QUOTE_RETENTION_MONTHS = 12;
