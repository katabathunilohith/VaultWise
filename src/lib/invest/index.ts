/**
 * Investing: the risk profile, the Core sleeve (model portfolio, one-off buys, SIPs) and the opt-in Satellite
 * sleeve (paper-trading engine, backtests). See README.md for the price-provider seam, per-customer
 * strategies and which routes need the MPIN.
 */
export {
  QUESTIONS,
  BANDS,
  SLOT_LABEL,
  missingAnswers,
  scoreAnswers,
  modelPortfolio,
  bandInfo,
  type Question,
  type RiskProfile,
  type AssetSlot,
  type Allocation,
} from "./profile";
export { SATELLITE_UNIVERSE, rng, syntheticCandles, getSeries, latestPrice, type Candle, type Interval, type Series } from "./market";
export { setPriceProvider, priceProvider, type PriceProvider, type RawSeries, type NativeInterval } from "./prices";
export { yahooProvider } from "./yahoo";
export {
  riskProfile,
  requireProfile,
  fxRate,
  executeSip,
  coreHoldings,
  sipPlans,
  activeSip,
  upsertSip,
  cancelSip,
  runDueSips,
  historicalIllustration,
  projection,
} from "./core";
export {
  PAPER_TIMEFRAME,
  DISCLOSURES,
  universeFor,
  eligibility,
  optIn,
  optOut,
  setMarketEnabled,
  paperEquity,
  runPaperEngine,
  satelliteOverview,
  strategyId,
  backtestMarket,
  marketAnalysis,
} from "./satellite";
export { sipNeedsMpin, sipPerMonth, type SipFrequency } from "./sip-rule";
export { strategyFor, saveStrategyBacktest, allStrategies, type StrategyRow } from "./strategies";
export { runBacktest, governanceGate, stats, type BacktestResult, type Trade, type Stats, type RiskRules, type GateResult } from "./backtest";
export { analyze, signalAt, DEFAULT_PARAMS, COST_BPS, WEIGHTS, type SmcParams, type Analysis, type Components } from "./smc";
