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
};

/**
 * Offerings a new workspace starts with: a base offering and one built on it.
 * An admin can rename these, add more (built on any of them or standalone), or
 * drop back to one while the version is still a draft.
 */
export const SEED_SERVICE_TIERS = [
  { key: "advantage", label: "Advantage", description: "Core managed services", parentKey: null },
  {
    key: "pinnacle",
    label: "Pinnacle",
    description: "Adds the security stack",
    parentKey: "advantage",
  },
] as const;

export const SEED_COGS_ITEMS = [
  { key: "k365", label: "K365 Endpoint", vendor: "Datto RMM + SOC", unit: "DEVICE", tierKeys: ["advantage"], unitCost: 3.49 },
  { key: "edr", label: "EDR", vendor: "SentinelOne", unit: "DEVICE", tierKeys: ["advantage"], unitCost: 2.85 },
  { key: "pam", label: "Privilege management", vendor: "AutoElevate", unit: "DEVICE", tierKeys: ["advantage"], unitCost: 1.71 },
  { key: "spam", label: "Spam + email filtering", vendor: "Avanan", unit: "USER", tierKeys: ["advantage"], unitCost: 1.5 },
  { key: "vuln", label: "Vulnerability monitoring", vendor: "ConnectSecure", unit: "DEVICE", tierKeys: ["advantage"], unitCost: 0.15 },
  { key: "net", label: "Network monitoring", vendor: "Domotz", unit: "LOCATION", tierKeys: ["advantage"], unitCost: 23 },
  { key: "mfa", label: "MFA", vendor: "Duo", unit: "USER", tierKeys: ["pinnacle"], unitCost: 3 },
  { key: "m365", label: "M365 Backup", vendor: "DropSuite", unit: "USER", tierKeys: ["pinnacle"], unitCost: 3 },
  { key: "pw", label: "Password manager", vendor: "Keeper", unit: "USER", tierKeys: ["pinnacle"], unitCost: 2.25 },
  { key: "sat", label: "Security awareness", vendor: "KnowBe4", unit: "USER", tierKeys: ["pinnacle"], unitCost: 1.5 },
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
