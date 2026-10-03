import type { Candle } from "./market";
import { analyze, DEFAULT_PARAMS, signalAt, type Analysis, type Dir, type SmcParams } from "./smc";

export interface Trade {
  entryI: number;
  exitI: number;
  entryT: number;
  exitT: number;
  dir: Dir;
  entry: number;
  stop: number;
  target: number;
  exit: number;
  r: number; // net of costs
  score: number;
  reason: "target" | "stop" | "time" | "end";
}

export interface Stats {
  trades: number;
  winRate: number;
  expectancyR: number;
  profitFactor: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  tStat: number;
  avgBars: number;
  halts: number;
}

export interface RiskRules {
  riskPct: number;
  dailyHaltPct: number;
  weeklyHaltPct: number;
}

const THRESHOLDS = [50, 55, 60, 65, 70, 75];

function simulate(c: Candle[], a: Analysis, threshold: number, from: number, to: number, risk: RiskRules) {
  const p = a.params;
  const trades: Trade[] = [];
  const equity: { t: number; v: number }[] = [];
  let eq = 1;
  let peak = 1;
  let maxDd = 0;
  let halts = 0;
  let dayKey = -1;
  let dayStart = 1;
  let weekKey = -1;
  let weekStart = 1;
  let haltedUntilKey = -1;
  let i = Math.max(from, p.vpBars, 30);
  while (i < Math.min(to, c.length - 1)) {
    const dk = Math.floor(c[i].t / 86_400_000);
    const wk = Math.floor((dk + 3) / 7);
    if (dk !== dayKey) {
      dayKey = dk;
      dayStart = eq;
    }
    if (wk !== weekKey) {
      weekKey = wk;
      weekStart = eq;
    }
    const halted = haltedUntilKey >= dk;
    const sig = halted ? null : signalAt(a, i, threshold);
    if (!sig) {
      equity.push({ t: c[i].t, v: eq });
      i++;
      continue;
    }
    // Enter at the next bar's open; keep the signal's stop level.
    const entryI = i + 1;
    const entry = c[entryI].o;
    const riskPerUnit = sig.dir === "bull" ? entry - sig.stop : sig.stop - entry;
    if (riskPerUnit <= 0) {
      i++;
      continue;
    }
    const target = sig.dir === "bull" ? entry + p.rr * riskPerUnit : entry - p.rr * riskPerUnit;
    let exitI = entryI;
    let exit = entry;
    let reason: Trade["reason"] = "end";
    for (let j = entryI; j < Math.min(c.length, to + p.maxBarsInTrade); j++) {
      const bar = c[j];
      const hitStop = sig.dir === "bull" ? bar.l <= sig.stop : bar.h >= sig.stop;
      const hitTarget = sig.dir === "bull" ? bar.h >= target : bar.l <= target;
      exitI = j;
      if (hitStop) {
        // Gap through the stop fills at the open; same-bar ambiguity resolves to the stop (conservative).
        exit = sig.dir === "bull" ? Math.min(sig.stop, bar.o) : Math.max(sig.stop, bar.o);
        reason = "stop";
        break;
      }
      if (hitTarget) {
        exit = target;
        reason = "target";
        break;
      }
      if (j - entryI >= p.maxBarsInTrade) {
        exit = bar.c;
        reason = "time";
        break;
      }
      exit = bar.c;
    }
    const gross = (sig.dir === "bull" ? exit - entry : entry - exit) / riskPerUnit;
    const costR = ((p.costBps / 10_000) * (entry + exit)) / riskPerUnit;
    const r = gross - costR;
    eq *= 1 + (r * risk.riskPct) / 100;
    trades.push({
      entryI,
      exitI,
      entryT: c[entryI].t,
      exitT: c[exitI].t,
      dir: sig.dir,
      entry,
      stop: sig.stop,
      target,
      exit,
      r,
      score: sig.score,
      reason,
    });
    for (let j = i; j <= exitI; j++) equity.push({ t: c[j].t, v: j === exitI ? eq : (equity.at(-1)?.v ?? eq) });
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, (peak - eq) / peak);
    // Circuit breakers halt new entries for the rest of the day / week.
    const exitDay = Math.floor(c[exitI].t / 86_400_000);
    if (eq < dayStart * (1 - risk.dailyHaltPct / 100)) {
      haltedUntilKey = exitDay;
      halts++;
    }
    if (eq < weekStart * (1 - risk.weeklyHaltPct / 100)) {
      haltedUntilKey = Math.max(haltedUntilKey, exitDay + 6 - ((exitDay + 3) % 7));
      halts++;
    }
    i = exitI + 1;
  }
  return { trades, equity, finalEquity: eq, maxDd, halts };
}

export function stats(trades: Trade[], finalEquity: number, maxDd: number, halts: number): Stats {
  const n = trades.length;
  const rs = trades.map((t) => t.r);
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r <= 0);
  const mean = n ? rs.reduce((s, r) => s + r, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(rs.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1)) : 0;
  const lossSum = Math.abs(losses.reduce((s, r) => s + r, 0));
  return {
    trades: n,
    winRate: n ? wins.length / n : 0,
    expectancyR: mean,
    profitFactor: lossSum > 0 ? wins.reduce((s, r) => s + r, 0) / lossSum : wins.length ? 99 : 0,
    totalReturnPct: (finalEquity - 1) * 100,
    maxDrawdownPct: maxDd * 100,
    tStat: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0,
    avgBars: n ? trades.reduce((s, t) => s + (t.exitI - t.entryI), 0) / n : 0,
    halts,
  };
}

export interface GateResult {
  passed: boolean;
  checks: { label: string; pass: boolean; detail: string }[];
}

export function governanceGate(full: Stats, oos: Stats): GateResult {
  const checks = [
    { label: "Sample size", pass: full.trades >= 30, detail: `${full.trades} trades (need ≥ 30)` },
    { label: "Out-of-sample profit factor", pass: oos.profitFactor >= 1.1, detail: `${oos.profitFactor.toFixed(2)} (need ≥ 1.10)` },
    { label: "Out-of-sample expectancy", pass: oos.expectancyR > 0, detail: `${oos.expectancyR.toFixed(3)}R per trade (need > 0)` },
    { label: "Max drawdown", pass: full.maxDrawdownPct <= 20, detail: `${full.maxDrawdownPct.toFixed(1)}% (limit 20%)` },
    { label: "Statistical evidence", pass: full.tStat >= 1.0, detail: `t = ${full.tStat.toFixed(2)} (need ≥ 1.0; ≥ 2 is strong)` },
  ];
  return { passed: checks.every((c) => c.pass), checks };
}

/**
 * Full-sample backtest plus anchored walk-forward: for each fold the threshold
 * is chosen on all earlier data, then tested on the next unseen window.
 */
export function runBacktest(c: Candle[], params: Partial<SmcParams> = {}, risk: RiskRules) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const a = analyze(c, { ...p, threshold: Math.min(...THRESHOLDS, p.threshold) });
  const start = Math.max(p.vpBars, 30);
  const full = simulate(c, a, p.threshold, start, c.length, risk);
  const fullStats = stats(full.trades, full.finalEquity, full.maxDd, full.halts);

  const K = 5;
  const span = c.length - start;
  const folds: {
    fold: number;
    isFrom: number;
    isTo: number;
    oosFrom: number;
    oosTo: number;
    threshold: number;
    isExpectancy: number;
    isTrades: number;
    oosExpectancy: number;
    oosTrades: number;
  }[] = [];
  const oosTrades: Trade[] = [];
  let oosEq = 1;
  let oosPeak = 1;
  let oosDd = 0;
  for (let k = 1; k < K; k++) {
    const isFrom = start;
    const isTo = start + Math.floor((span * k) / K);
    const oosTo = start + Math.floor((span * (k + 1)) / K);
    let best = { th: p.threshold, exp: -Infinity, n: 0 };
    for (const th of THRESHOLDS) {
      const r = simulate(c, a, th, isFrom, isTo, risk);
      const s = stats(r.trades, r.finalEquity, r.maxDd, r.halts);
      if (s.trades >= 5 && s.expectancyR > best.exp) best = { th, exp: s.expectancyR, n: s.trades };
    }
    if (best.exp === -Infinity) best = { th: p.threshold, exp: 0, n: 0 };
    const oos = simulate(c, a, best.th, isTo, oosTo, risk);
    for (const t of oos.trades) {
      oosEq *= 1 + (t.r * risk.riskPct) / 100;
      oosPeak = Math.max(oosPeak, oosEq);
      oosDd = Math.max(oosDd, (oosPeak - oosEq) / oosPeak);
    }
    oosTrades.push(...oos.trades);
    const os = stats(oos.trades, oos.finalEquity, oos.maxDd, oos.halts);
    folds.push({
      fold: k,
      isFrom: c[isFrom].t,
      isTo: c[isTo - 1].t,
      oosFrom: c[isTo].t,
      oosTo: c[Math.min(oosTo, c.length) - 1].t,
      threshold: best.th,
      isExpectancy: best.exp,
      isTrades: best.n,
      oosExpectancy: os.expectancyR,
      oosTrades: os.trades,
    });
  }
  const oosStats = stats(oosTrades, oosEq, oosDd, 0);
  const isAvg = folds.length ? folds.reduce((s, f) => s + f.isExpectancy, 0) / folds.length : 0;

  const first = c[start];
  const last = c.at(-1)!;
  // Downsample the equity curve for the chart.
  const stride = Math.max(1, Math.floor(full.equity.length / 400));
  const curve = full.equity.filter((_, idx) => idx % stride === 0 || idx === full.equity.length - 1).map((e) => ({ t: e.t, v: e.v }));
  const bh = curve.map((e) => {
    const bar = c.find((x) => x.t >= e.t) ?? last;
    return bar.c / first.c;
  });

  return {
    params: p,
    risk,
    bars: c.length,
    from: first.t,
    to: last.t,
    full: fullStats,
    oos: oosStats,
    decay: { isExpectancy: isAvg, oosExpectancy: oosStats.expectancyR },
    folds,
    gate: governanceGate(fullStats, oosStats),
    buyHoldPct: (last.c / first.c - 1) * 100,
    equity: curve.map((e, idx) => ({ t: e.t, strategy: e.v, buyHold: bh[idx] })),
    trades: full.trades.slice(-60).reverse(),
  };
}

export type BacktestResult = ReturnType<typeof runBacktest>;
