/**
 * Jurisdiction-aware compliance rules engine.
 *
 * One codebase, per-market switches: feature flags, verification thresholds,
 * emergency guardrails, personal-limit policy and disclosures all come from
 * this table rather than from forks of the product.
 *
 * Scaling to a new market is data-only: shared defaults are written once in
 * USD terms and converted with the currency's price-level scale, so a market
 * entry only lists what is genuinely different (regulators, disclosures,
 * permitted asset classes, explicit caps). Countries map onto markets, so all
 * 21 euro-area countries share the EU rule set.
 *
 * Values are illustrative planning defaults, not legal advice — each market
 * needs counsel sign-off before launch.
 */

import { CURRENCY_SCALE } from "./shared";

export type MarketCode = "US" | "EU" | "UK" | "IN" | "SG" | "CA" | "AU" | "AE";
/** @deprecated kept for older call sites — a jurisdiction is a market. */
export type JurisdictionCode = MarketCode;

export type AssetClass = "equities" | "crypto" | "forex";

export interface LimitBound {
  default: number;
  max: number;
}

export interface JurisdictionRules {
  code: MarketCode;
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
  /** Customer-adjustable limits and how often they may be loosened (minor units). */
  limits: {
    singleWithdrawal: LimitBound;
    dailyWithdrawal: LimitBound;
    loosenPerMonth: number;
    emergencyRequestsPerMonth: number;
    emergencyIncreaseDays: number;
    maxEmergencyIncreaseRatio: number;
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

/** Rounds a converted amount to a figure a person would choose (major units). */
function niceRound(major: number) {
  const step = major < 1_000 ? 10 : major < 10_000 ? 100 : major < 100_000 ? 1_000 : 10_000;
  return Math.round(major / step) * step;
}

/** Shared defaults, expressed in USD; monetary values are scaled per currency. */
const DEFAULTS_USD = {
  emergencyMonthlyCap: 2_500,
  singleWithdrawal: { default: 5_000, max: 25_000 },
  dailyWithdrawal: { default: 10_000, max: 50_000 },
};

interface MarketDef {
  code: MarketCode;
  name: string;
  currency: string;
  locale: string;
  flag: string;
  dataRegime: string;
  emoneyRegime: string;
  investRegime: string;
  cryptoRegime: string;
  disclosures: string[];
  /** Explicit cap in major units; otherwise the USD default is scaled. */
  emergencyMonthlyCap?: number;
  assetClasses?: AssetClass[];
  maxAllocationPct?: number;
  coolingOffDays?: number;
}

function defineMarket(m: MarketDef): JurisdictionRules {
  const scale = CURRENCY_SCALE[m.currency] ?? 1;
  const money = (usd: number) => niceRound(usd * scale) * 100;
  const bound = (b: { default: number; max: number }) => ({ default: money(b.default), max: money(b.max) });
  return {
    code: m.code,
    name: m.name,
    currency: m.currency,
    locale: m.locale,
    flag: m.flag,
    dataRegime: m.dataRegime,
    emoneyRegime: m.emoneyRegime,
    investRegime: m.investRegime,
    cryptoRegime: m.cryptoRegime,
    emergency: {
      monthlyCap: m.emergencyMonthlyCap != null ? m.emergencyMonthlyCap * 100 : money(DEFAULTS_USD.emergencyMonthlyCap),
      maxRequestsPer7d: 3,
      cooloffAfterRequestsIn72h: 2,
      cooloffHours: 24,
      tier2HoldSeconds: 90,
      receiptWindowDays: 14,
    },
    limits: {
      singleWithdrawal: bound(DEFAULTS_USD.singleWithdrawal),
      dailyWithdrawal: bound(DEFAULTS_USD.dailyWithdrawal),
      loosenPerMonth: 1,
      emergencyRequestsPerMonth: 2,
      emergencyIncreaseDays: 14,
      maxEmergencyIncreaseRatio: 3,
    },
    verification: { autoApprove: 0.85, autoDeny: 0.35, maxDocAgeDays: 120, reviewSlaHours: 4 },
    satellite: {
      enabled: true,
      maxAllocationPct: m.maxAllocationPct ?? 10,
      assetClasses: m.assetClasses ?? ["equities", "crypto", "forex"],
      minRiskBand: 3,
      riskPerTradePct: 1,
      dailyDrawdownHaltPct: 3,
      weeklyDrawdownHaltPct: 6,
    },
    coolingOffDays: m.coolingOffDays ?? 0,
    disclosures: m.disclosures,
  };
}

const MARKET_DEFS: MarketDef[] = [
  {
    code: "US",
    name: "United States",
    currency: "USD",
    locale: "en-US",
    flag: "🇺🇸",
    dataRegime: "CCPA/CPRA + state privacy laws",
    emoneyRegime: "Partner bank (FDIC pass-through) + state money-transmitter licensing via BaaS",
    investRegime: "SEC-registered investment adviser (partner robo-advisory umbrella)",
    cryptoRegime: "FinCEN MSB registration + state licensing via qualified custodian",
    emergencyMonthlyCap: 2_500,
    disclosures: [
      "Vault balances are held at a partner bank in cash or money-market equivalents and are never used for trading.",
      "Investment advisory services are provided under a registered partner's authorization.",
      "Satellite trading can lose money, including all of the allocated amount. Past performance does not predict future results.",
    ],
  },
  {
    code: "EU",
    name: "European Union (euro area)",
    currency: "EUR",
    locale: "de-DE",
    flag: "🇪🇺",
    dataRegime: "GDPR",
    emoneyRegime: "EMI authorization with EU passporting (via BaaS partner)",
    investRegime: "MiFID II portfolio management (partner umbrella)",
    cryptoRegime: "MiCA CASP authorization + Travel Rule",
    emergencyMonthlyCap: 2_000,
    coolingOffDays: 14,
    disclosures: [
      "E-money is safeguarded in segregated accounts and is not covered by deposit guarantee schemes.",
      "You have a 14-day right of withdrawal for distance-marketed financial services.",
      "Crypto-assets are not covered by investor-compensation schemes (MiCA). You could lose your entire allocation.",
    ],
  },
  {
    code: "UK",
    name: "United Kingdom",
    currency: "GBP",
    locale: "en-GB",
    flag: "🇬🇧",
    dataRegime: "UK GDPR + Data Protection Act 2018",
    emoneyRegime: "FCA e-money institution (via BaaS partner)",
    investRegime: "FCA-authorised discretionary management (partner umbrella)",
    cryptoRegime: "FCA cryptoasset registration; retail crypto derivatives prohibited (spot only)",
    emergencyMonthlyCap: 2_000,
    coolingOffDays: 14,
    disclosures: [
      "Consumer Duty: we will tell you plainly what the Satellite sleeve can and cannot do for you.",
      "Don't invest unless you're prepared to lose all the money you invest. This is a high-risk investment.",
      "Vault e-money is safeguarded, not FSCS-protected.",
    ],
  },
  {
    code: "IN",
    name: "India",
    currency: "INR",
    locale: "en-IN",
    flag: "🇮🇳",
    dataRegime: "Digital Personal Data Protection Act, 2023",
    emoneyRegime: "RBI PPI licence (via partner bank / PPI issuer)",
    investRegime: "SEBI Investment Adviser / mutual fund distribution via partner",
    cryptoRegime: "FIU-IND registration; 30% tax + 1% TDS on VDA transfers",
    emergencyMonthlyCap: 1_50_000,
    // Retail forex is limited to INR pairs on recognised exchanges.
    assetClasses: ["equities", "crypto"],
    disclosures: [
      "Mutual fund investments are subject to market risks; read all scheme-related documents carefully.",
      "Virtual digital assets are unregulated and taxed at 30% plus 1% TDS on transfers.",
      "Retail forex trading is restricted to INR pairs on recognised exchanges and is disabled here.",
    ],
  },
  {
    code: "SG",
    name: "Singapore",
    currency: "SGD",
    locale: "en-SG",
    flag: "🇸🇬",
    dataRegime: "PDPA",
    emoneyRegime: "MAS Payment Services Act licence (via partner)",
    investRegime: "MAS Capital Markets Services licence (partner umbrella)",
    cryptoRegime: "MAS DPT service provider licence; consumer-access measures",
    emergencyMonthlyCap: 3_000,
    maxAllocationPct: 5,
    disclosures: [
      "MAS consumer-protection measures: crypto (DPT) trading carries high risk and no incentives are offered to trade.",
      "Investments are not insured by the Singapore Deposit Insurance Corporation.",
    ],
  },
  {
    code: "CA",
    name: "Canada",
    currency: "CAD",
    locale: "en-CA",
    flag: "🇨🇦",
    dataRegime: "PIPEDA (+ Québec Law 25)",
    emoneyRegime: "Bank of Canada RPAA registration (via partner)",
    investRegime: "CIRO-registered portfolio manager (partner umbrella)",
    cryptoRegime: "CSA restricted-dealer registration via partner",
    disclosures: [
      "Vault money is held in trust with a partner institution and is never used for trading.",
      "Crypto-assets carry a high risk of loss and are not protected by CIPF.",
    ],
  },
  {
    code: "AU",
    name: "Australia",
    currency: "AUD",
    locale: "en-AU",
    flag: "🇦🇺",
    dataRegime: "Privacy Act 1988 (Australian Privacy Principles)",
    emoneyRegime: "Non-cash payment facility under a partner's AFSL",
    investRegime: "Managed discretionary account under a partner's AFSL",
    cryptoRegime: "AUSTRAC digital-currency-exchange registration",
    disclosures: [
      "General advice only — consider the PDS and Target Market Determination before investing.",
      "Satellite trading is high risk; you could lose all of the amount you allocate.",
    ],
  },
  {
    code: "AE",
    name: "United Arab Emirates",
    currency: "AED",
    locale: "en-AE",
    flag: "🇦🇪",
    dataRegime: "UAE PDPL (Federal Decree-Law 45/2021)",
    emoneyRegime: "CBUAE Stored Value Facilities licence (via partner)",
    investRegime: "SCA-licensed investment manager (partner umbrella)",
    cryptoRegime: "VARA (Dubai) virtual-asset licence via partner",
    disclosures: [
      "Core investments use global ETFs priced in USD and shown in AED at the pegged rate.",
      "Virtual assets are high risk and not covered by any deposit or investor protection scheme.",
    ],
  },
];

export const JURISDICTIONS = Object.fromEntries(MARKET_DEFS.map((m) => [m.code, defineMarket(m)])) as Record<MarketCode, JurisdictionRules>;
export const MARKET_CODES = MARKET_DEFS.map((m) => m.code) as [MarketCode, ...MarketCode[]];

export function rulesFor(code: string): JurisdictionRules {
  return JURISDICTIONS[code as MarketCode] ?? JURISDICTIONS.US;
}

/* ---------- Countries ---------- */

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  market: MarketCode;
}

const EURO_AREA: [string, string][] = [
  ["AT", "Austria"],
  ["BE", "Belgium"],
  ["BG", "Bulgaria"],
  ["HR", "Croatia"],
  ["CY", "Cyprus"],
  ["EE", "Estonia"],
  ["FI", "Finland"],
  ["FR", "France"],
  ["DE", "Germany"],
  ["GR", "Greece"],
  ["IE", "Ireland"],
  ["IT", "Italy"],
  ["LV", "Latvia"],
  ["LT", "Lithuania"],
  ["LU", "Luxembourg"],
  ["MT", "Malta"],
  ["NL", "Netherlands"],
  ["PT", "Portugal"],
  ["SK", "Slovakia"],
  ["SI", "Slovenia"],
  ["ES", "Spain"],
];

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", market: "US" },
  { code: "GB", name: "United Kingdom", market: "UK" },
  { code: "IN", name: "India", market: "IN" },
  { code: "SG", name: "Singapore", market: "SG" },
  { code: "CA", name: "Canada", market: "CA" },
  { code: "AU", name: "Australia", market: "AU" },
  { code: "AE", name: "United Arab Emirates", market: "AE" },
  ...EURO_AREA.map(([code, name]) => ({ code, name, market: "EU" as MarketCode })),
];
export const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as [string, ...string[]];

export function countryFlag(code: string) {
  return String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function countryInfo(code: string | null | undefined) {
  const c = COUNTRIES.find((x) => x.code === code?.toUpperCase());
  if (!c) return null;
  const rules = rulesFor(c.market);
  return { ...c, flag: countryFlag(c.code), currency: rules.currency, marketName: rules.name };
}

/** Best country for a market (used when only the market is known, e.g. older records). */
export function defaultCountryFor(market: string) {
  return { UK: "GB", EU: "DE" }[market] ?? market;
}
