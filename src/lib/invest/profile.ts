/** Risk profiling questionnaire and model portfolios (shared by client and server). */

export interface Question {
  id: string;
  text: string;
  options: { label: string; points: number }[];
}

export const QUESTIONS: Question[] = [
  {
    id: "age",
    text: "How old are you?",
    options: [
      { label: "Under 30", points: 4 },
      { label: "30 – 44", points: 3 },
      { label: "45 – 59", points: 2 },
      { label: "60 or older", points: 1 },
    ],
  },
  {
    id: "horizon",
    text: "When will you need most of this money?",
    options: [
      { label: "Within 2 years", points: 0 },
      { label: "In 2 – 5 years", points: 2 },
      { label: "In 5 – 10 years", points: 3 },
      { label: "More than 10 years from now", points: 4 },
    ],
  },
  {
    id: "income",
    text: "How stable is your income?",
    options: [
      { label: "Unstable or currently none", points: 0 },
      { label: "Variable (freelance, commission)", points: 1 },
      { label: "Stable salary", points: 3 },
      { label: "Very stable, multiple sources", points: 4 },
    ],
  },
  {
    id: "cushion",
    text: "Outside investments, how many months of expenses do you have saved?",
    options: [
      { label: "None yet", points: 0 },
      { label: "Less than 3 months", points: 1 },
      { label: "3 – 6 months", points: 3 },
      { label: "More than 6 months", points: 4 },
    ],
  },
  {
    id: "drawdown",
    text: "Your investments fall 20% in a month. What do you do?",
    options: [
      { label: "Sell everything", points: 0 },
      { label: "Sell some to limit losses", points: 1 },
      { label: "Hold and wait", points: 3 },
      { label: "Invest more while prices are low", points: 4 },
    ],
  },
  {
    id: "experience",
    text: "Which have you invested in before?",
    options: [
      { label: "Nothing beyond a bank account", points: 0 },
      { label: "Fixed deposits / savings bonds", points: 1 },
      { label: "Mutual funds or ETFs", points: 3 },
      { label: "Individual stocks, crypto or derivatives", points: 4 },
    ],
  },
  {
    id: "goal",
    text: "What matters most for this money?",
    options: [
      { label: "Not losing any of it", points: 0 },
      { label: "Steady income", points: 1 },
      { label: "Balanced growth", points: 2 },
      { label: "Maximum long-term growth", points: 4 },
    ],
  },
];

export const BANDS = [
  { band: 1, name: "Conservative", min: 0, expReturn: 0.04, vol: 0.05 },
  { band: 2, name: "Moderately conservative", min: 25, expReturn: 0.05, vol: 0.08 },
  { band: 3, name: "Balanced", min: 45, expReturn: 0.06, vol: 0.11 },
  { band: 4, name: "Growth", min: 65, expReturn: 0.07, vol: 0.14 },
  { band: 5, name: "Aggressive", min: 83, expReturn: 0.078, vol: 0.17 },
];

export interface RiskProfile {
  answers: Record<string, number>;
  score: number;
  band: number;
  bandName: string;
  experience: number;
  completedAt: number;
}

export function scoreAnswers(answers: Record<string, number>): Omit<RiskProfile, "completedAt"> {
  let total = 0;
  for (const q of QUESTIONS) {
    const idx = answers[q.id];
    if (idx == null || !q.options[idx]) throw new Error(`Missing answer: ${q.id}`);
    total += q.options[idx].points;
  }
  const max = QUESTIONS.reduce((s, q) => s + Math.max(...q.options.map((o) => o.points)), 0);
  const score = Math.round((total / max) * 100);
  const b = [...BANDS].reverse().find((x) => score >= x.min)!;
  // Someone without an emergency cushion shouldn't be pushed into the top bands.
  const capped = answers.cushion === 0 ? Math.min(b.band, 2) : b.band;
  const band = BANDS[capped - 1];
  return { answers, score, band: band.band, bandName: band.name, experience: QUESTIONS[5].options[answers.experience].points };
}

export type AssetSlot = "equity_home" | "equity_intl" | "bonds" | "gold" | "cash";

export const SLOT_LABEL: Record<AssetSlot, string> = {
  equity_home: "Core equity",
  equity_intl: "International / EM equity",
  bonds: "Bonds",
  gold: "Gold",
  cash: "Cash & T-bills",
};

const WEIGHTS: Record<number, Record<AssetSlot, number>> = {
  1: { equity_home: 15, equity_intl: 5, bonds: 55, gold: 10, cash: 15 },
  2: { equity_home: 30, equity_intl: 10, bonds: 45, gold: 10, cash: 5 },
  3: { equity_home: 40, equity_intl: 20, bonds: 30, gold: 10, cash: 0 },
  4: { equity_home: 55, equity_intl: 25, bonds: 12, gold: 8, cash: 0 },
  5: { equity_home: 65, equity_intl: 30, bonds: 0, gold: 5, cash: 0 },
};

const TICKERS: Record<string, Record<AssetSlot, { symbol: string; name: string } | null>> = {
  US: {
    equity_home: { symbol: "VTI", name: "Vanguard Total Stock Market ETF" },
    equity_intl: { symbol: "VXUS", name: "Vanguard Total International Stock ETF" },
    bonds: { symbol: "BND", name: "Vanguard Total Bond Market ETF" },
    gold: { symbol: "GLD", name: "SPDR Gold Shares" },
    cash: { symbol: "BIL", name: "SPDR 1-3 Month T-Bill ETF" },
  },
  EU: {
    equity_home: { symbol: "VWCE.DE", name: "Vanguard FTSE All-World UCITS (Acc)" },
    equity_intl: { symbol: "IS3N.DE", name: "iShares Core MSCI EM IMI UCITS" },
    bonds: { symbol: "VAGF.DE", name: "Vanguard Global Aggregate Bond (EUR hedged)" },
    gold: { symbol: "4GLD.DE", name: "Xetra-Gold" },
    cash: { symbol: "XEON.DE", name: "Xtrackers EUR Overnight Rate Swap" },
  },
  UK: {
    equity_home: { symbol: "VWRP.L", name: "Vanguard FTSE All-World UCITS (Acc)" },
    equity_intl: { symbol: "VFEG.L", name: "Vanguard FTSE Emerging Markets (Acc)" },
    bonds: { symbol: "VGOV.L", name: "Vanguard UK Gilt UCITS ETF" },
    gold: { symbol: "SGLN.L", name: "iShares Physical Gold" },
    cash: null,
  },
  IN: {
    equity_home: { symbol: "NIFTYBEES.NS", name: "Nippon India Nifty 50 BeES" },
    equity_intl: { symbol: "MON100.NS", name: "Motilal Oswal Nasdaq 100 ETF" },
    bonds: { symbol: "SETF10GILT.NS", name: "SBI Nifty 10yr Benchmark G-Sec ETF" },
    gold: { symbol: "GOLDBEES.NS", name: "Nippon India Gold BeES" },
    cash: { symbol: "LIQUIDBEES.NS", name: "Nippon India Liquid BeES" },
  },
  CA: {
    equity_home: { symbol: "XIC.TO", name: "iShares Core S&P/TSX Capped Composite" },
    equity_intl: { symbol: "XAW.TO", name: "iShares Core MSCI All Country World ex Canada" },
    bonds: { symbol: "ZAG.TO", name: "BMO Aggregate Bond Index ETF" },
    gold: { symbol: "CGL.TO", name: "iShares Gold Bullion ETF (CAD-hedged)" },
    cash: { symbol: "CASH.TO", name: "Global X High Interest Savings ETF" },
  },
  AU: {
    equity_home: { symbol: "VAS.AX", name: "Vanguard Australian Shares Index ETF" },
    equity_intl: { symbol: "VGS.AX", name: "Vanguard MSCI International Shares ETF" },
    bonds: { symbol: "VAF.AX", name: "Vanguard Australian Fixed Interest ETF" },
    gold: { symbol: "GOLD.AX", name: "Global X Physical Gold" },
    cash: { symbol: "AAA.AX", name: "BetaShares Australian High Interest Cash ETF" },
  },
  SG: {
    equity_home: { symbol: "ES3.SI", name: "SPDR Straits Times Index ETF" },
    equity_intl: { symbol: "IWDA.L", name: "iShares Core MSCI World (USD)" },
    bonds: { symbol: "A35.SI", name: "ABF Singapore Bond Index Fund" },
    gold: { symbol: "GSD.SI", name: "SPDR Gold Shares (SGX)" },
    cash: { symbol: "MBH.SI", name: "SGD Investment Grade Corp Bond ETF" },
  },
};

export interface Allocation {
  slot: AssetSlot;
  label: string;
  symbol: string;
  name: string;
  weight: number;
}

export function modelPortfolio(jurisdiction: string, band: number): Allocation[] {
  // Markets without a local ETF set use global USD-listed funds, converted to the wallet currency.
  const tickers = TICKERS[jurisdiction] ?? TICKERS.US;
  const w = { ...WEIGHTS[band] };
  // Markets without a cash-like ETF fold that weight into bonds.
  if (!tickers.cash && w.cash) {
    w.bonds += w.cash;
    w.cash = 0;
  }
  return (Object.keys(w) as AssetSlot[])
    .filter((slot) => w[slot] > 0 && tickers[slot])
    .map((slot) => ({ slot, label: SLOT_LABEL[slot], symbol: tickers[slot]!.symbol, name: tickers[slot]!.name, weight: w[slot] / 100 }));
}

export function bandInfo(band: number) {
  return BANDS[Math.max(1, Math.min(5, band)) - 1];
}
