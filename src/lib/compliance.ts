/**
 * Jurisdiction-aware compliance rules engine.
 *
 * One codebase, per-market switches: feature flags, verification thresholds,
 * emergency guardrails and disclosures all come from this table rather than
 * from forks of the product. Values are illustrative planning defaults, not
 * legal advice — each market needs counsel sign-off before launch.
 */

export type JurisdictionCode = "US" | "EU" | "UK" | "IN" | "SG";

export type AssetClass = "equities" | "crypto" | "forex";

export interface JurisdictionRules {
  code: JurisdictionCode;
  name: string;
  currency: string;
  locale: string;
  flag: string;
  dataRegime: string;
  emoneyRegime: string;
  investRegime: string;
  cryptoRegime: string;
  /** Emergency cascade guardrails (minor units). */
  emergency: {
    monthlyCap: number;
    maxRequestsPer7d: number;
    cooloffAfterRequestsIn72h: number;
    cooloffHours: number;
    tier2HoldSeconds: number;
    receiptWindowDays: number;
  };
  verification: {
    autoApprove: number;
    autoDeny: number;
    maxDocAgeDays: number;
    reviewSlaHours: number;
  };
  satellite: {
    enabled: boolean;
    maxAllocationPct: number;
    assetClasses: AssetClass[];
    minRiskBand: number;
    riskPerTradePct: number;
    dailyDrawdownHaltPct: number;
    weeklyDrawdownHaltPct: number;
  };
  coolingOffDays: number;
  disclosures: string[];
}

const base = {
  verification: { autoApprove: 0.85, autoDeny: 0.35, maxDocAgeDays: 120, reviewSlaHours: 4 },
  satelliteRisk: { riskPerTradePct: 1, dailyDrawdownHaltPct: 3, weeklyDrawdownHaltPct: 6 },
};

export const JURISDICTIONS: Record<JurisdictionCode, JurisdictionRules> = {
  US: {
    code: "US",
    name: "United States",
    currency: "USD",
    locale: "en-US",
    flag: "🇺🇸",
    dataRegime: "CCPA/CPRA + state privacy laws",
    emoneyRegime: "Partner bank (FDIC pass-through) + state money-transmitter licensing via BaaS",
    investRegime: "SEC-registered investment adviser (partner robo-advisory umbrella)",
    cryptoRegime: "FinCEN MSB registration + state licensing via qualified custodian",
    emergency: {
      monthlyCap: 2_500_00,
      maxRequestsPer7d: 3,
      cooloffAfterRequestsIn72h: 2,
      cooloffHours: 24,
      tier2HoldSeconds: 90,
      receiptWindowDays: 14,
    },
    verification: base.verification,
    satellite: {
      enabled: true,
      maxAllocationPct: 10,
      assetClasses: ["equities", "crypto", "forex"],
      minRiskBand: 3,
      ...base.satelliteRisk,
    },
    coolingOffDays: 0,
    disclosures: [
      "Vault balances are held at a partner bank in cash or money-market equivalents and are never used for trading.",
      "Investment advisory services are provided under a registered partner's authorization.",
      "Satellite trading can lose money, including all of the allocated amount. Past performance does not predict future results.",
    ],
  },
  EU: {
    code: "EU",
    name: "European Union",
    currency: "EUR",
    locale: "de-DE",
    flag: "🇪🇺",
    dataRegime: "GDPR",
    emoneyRegime: "EMI authorization with EU passporting (via BaaS partner)",
    investRegime: "MiFID II portfolio management (partner umbrella)",
    cryptoRegime: "MiCA CASP authorization + Travel Rule",
    emergency: {
      monthlyCap: 2_000_00,
      maxRequestsPer7d: 3,
      cooloffAfterRequestsIn72h: 2,
      cooloffHours: 24,
      tier2HoldSeconds: 90,
      receiptWindowDays: 14,
    },
    verification: base.verification,
    satellite: {
      enabled: true,
      maxAllocationPct: 10,
      assetClasses: ["equities", "crypto", "forex"],
      minRiskBand: 3,
      ...base.satelliteRisk,
    },
    coolingOffDays: 14,
    disclosures: [
      "E-money is safeguarded in segregated accounts and is not covered by deposit guarantee schemes.",
      "You have a 14-day right of withdrawal for distance-marketed financial services.",
      "Crypto-assets are not covered by investor-compensation schemes (MiCA). You could lose your entire allocation.",
    ],
  },
  UK: {
    code: "UK",
    name: "United Kingdom",
    currency: "GBP",
    locale: "en-GB",
    flag: "🇬🇧",
    dataRegime: "UK GDPR + Data Protection Act 2018",
    emoneyRegime: "FCA e-money institution (via BaaS partner)",
    investRegime: "FCA-authorised discretionary management (partner umbrella)",
    cryptoRegime: "FCA cryptoasset registration; retail crypto derivatives prohibited (spot only)",
    emergency: {
      monthlyCap: 2_000_00,
      maxRequestsPer7d: 3,
      cooloffAfterRequestsIn72h: 2,
      cooloffHours: 24,
      tier2HoldSeconds: 90,
      receiptWindowDays: 14,
    },
    verification: base.verification,
    satellite: {
      enabled: true,
      maxAllocationPct: 10,
      assetClasses: ["equities", "crypto", "forex"],
      minRiskBand: 3,
      ...base.satelliteRisk,
    },
    coolingOffDays: 14,
    disclosures: [
      "Consumer Duty: we will tell you plainly what the Satellite sleeve can and cannot do for you.",
      "Don't invest unless you're prepared to lose all the money you invest. This is a high-risk investment.",
      "Vault e-money is safeguarded, not FSCS-protected.",
    ],
  },
  IN: {
    code: "IN",
    name: "India",
    currency: "INR",
    locale: "en-IN",
    flag: "🇮🇳",
    dataRegime: "Digital Personal Data Protection Act, 2023",
    emoneyRegime: "RBI PPI licence (via partner bank / PPI issuer)",
    investRegime: "SEBI Investment Adviser / mutual fund distribution via partner",
    cryptoRegime: "FIU-IND registration; 30% tax + 1% TDS on VDA transfers",
    emergency: {
      monthlyCap: 1_50_000_00,
      maxRequestsPer7d: 3,
      cooloffAfterRequestsIn72h: 2,
      cooloffHours: 24,
      tier2HoldSeconds: 90,
      receiptWindowDays: 14,
    },
    verification: base.verification,
    satellite: {
      enabled: true,
      maxAllocationPct: 10,
      // Retail forex is limited to INR pairs on recognised exchanges.
      assetClasses: ["equities", "crypto"],
      minRiskBand: 3,
      ...base.satelliteRisk,
    },
    coolingOffDays: 0,
    disclosures: [
      "Mutual fund investments are subject to market risks; read all scheme-related documents carefully.",
      "Virtual digital assets are unregulated and taxed at 30% plus 1% TDS on transfers.",
      "Retail forex trading is restricted to INR pairs on recognised exchanges and is disabled here.",
    ],
  },
  SG: {
    code: "SG",
    name: "Singapore",
    currency: "SGD",
    locale: "en-SG",
    flag: "🇸🇬",
    dataRegime: "PDPA",
    emoneyRegime: "MAS Payment Services Act licence (via partner)",
    investRegime: "MAS Capital Markets Services licence (partner umbrella)",
    cryptoRegime: "MAS DPT service provider licence; consumer-access measures",
    emergency: {
      monthlyCap: 3_000_00,
      maxRequestsPer7d: 3,
      cooloffAfterRequestsIn72h: 2,
      cooloffHours: 24,
      tier2HoldSeconds: 90,
      receiptWindowDays: 14,
    },
    verification: base.verification,
    satellite: {
      enabled: true,
      maxAllocationPct: 5,
      assetClasses: ["equities", "crypto", "forex"],
      minRiskBand: 3,
      ...base.satelliteRisk,
    },
    coolingOffDays: 0,
    disclosures: [
      "MAS consumer-protection measures: crypto (DPT) trading carries high risk and no incentives are offered to trade.",
      "Investments are not insured by the Singapore Deposit Insurance Corporation.",
    ],
  },
};

export function rulesFor(code: string): JurisdictionRules {
  return JURISDICTIONS[code as JurisdictionCode] ?? JURISDICTIONS.US;
}
