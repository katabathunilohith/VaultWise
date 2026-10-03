import type { Candle } from "./market";

/**
 * Smart Money Concepts / Fair Value Gap analysis.
 *
 * Every per-bar decision only uses information available at that bar's close:
 * swing points are "confirmed" `swingLen` bars after they print, higher-timeframe
 * bias uses completed HTF bars only, and the volume profile looks backwards.
 * That's what makes the backtest honest.
 */

export interface SmcParams {
  swingLen: number;
  minFvgAtr: number;
  threshold: number;
  rr: number;
  obLookback: number;
  structLookback: number;
  sweepLookback: number;
  fvgMaxAge: number;
  htfFactor: number;
  vpBars: number;
  vpBins: number;
  minStopAtr: number;
  maxStopAtr: number;
  maxBarsInTrade: number;
  costBps: number;
  /** Never trade against the higher-timeframe bias. */
  requireHtfAlignment: boolean;
}

export const DEFAULT_PARAMS: SmcParams = {
  swingLen: 3,
  minFvgAtr: 0.25,
  threshold: 60,
  rr: 2,
  obLookback: 15,
  structLookback: 20,
  sweepLookback: 10,
  fvgMaxAge: 60,
  htfFactor: 4,
  vpBars: 120,
  vpBins: 24,
  minStopAtr: 0.5,
  maxStopAtr: 3,
  maxBarsInTrade: 48,
  costBps: 5,
  requireHtfAlignment: true,
};

/** Round-trip cost assumptions per side, in basis points (fees + spread + slippage). */
export const COST_BPS: Record<string, number> = { crypto: 8, forex: 0.8, equities: 1.5 };

export type Dir = "bull" | "bear";

export interface Swing {
  i: number;
  price: number;
  kind: "high" | "low";
  confirmedAt: number;
  brokenAt?: number;
  sweptAt?: number;
}

export interface StructureEvent {
  i: number;
  kind: "BOS" | "CHoCH";
  dir: Dir;
  level: number;
  fromI: number;
}

export interface OrderBlock {
  i: number;
  dir: Dir;
  top: number;
  bottom: number;
  createdAt: number;
  touchedAt?: number;
  invalidatedAt?: number;
}

export interface Fvg {
  i: number; // index of the middle (impulse) candle
  dir: Dir;
  top: number;
  bottom: number;
  createdAt: number; // index of the third candle (gap confirmed)
  sizeAtr: number;
  touchedAt?: number;
  filledAt?: number;
  fillProb?: number;
}

export interface Sweep {
  i: number;
  dir: Dir; // bull = sell-side liquidity (lows) taken, bullish implication
  level: number;
  swingI: number;
}

export interface Components {
  htf: number;
  structure: number;
  fvg: number;
  orderBlock: number;
  sweep: number;
  location: number;
}

export interface BarSignal {
  i: number;
  long: number;
  short: number;
  longC: Components;
  shortC: Components;
  dir: Dir | null;
  score: number;
  stop: number | null;
  atr: number;
  bias: Dir | "neutral";
}

export interface Analysis {
  params: SmcParams;
  atr: number[];
  swings: Swing[];
  structure: StructureEvent[];
  orderBlocks: OrderBlock[];
  fvgs: Fvg[];
  sweeps: Sweep[];
  bias: (Dir | "neutral")[];
  signals: BarSignal[];
  trend: (Dir | "none")[];
  profile: { poc: number; vah: number; val: number; bins: { price: number; volume: number }[]; low: number; high: number } | null;
}

export const WEIGHTS = { htf: 25, structure: 20, fvg: 20, orderBlock: 15, sweep: 10, location: 10 };

function wilderAtr(c: Candle[], period = 14) {
  const out: number[] = new Array(c.length).fill(0);
  let atr = 0;
  for (let i = 0; i < c.length; i++) {
    const tr = i === 0 ? c[i].h - c[i].l : Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    atr = i < period ? (atr * i + tr) / (i + 1) : (atr * (period - 1) + tr) / period;
    out[i] = atr;
  }
  return out;
}

function volumeProfile(c: Candle[], from: number, to: number, bins: number) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = from; k <= to; k++) {
    lo = Math.min(lo, c[k].l);
    hi = Math.max(hi, c[k].h);
  }
  if (!(hi > lo)) return null;
  const step = (hi - lo) / bins;
  const vol = new Array(bins).fill(0);
  const useTpo = c.slice(from, to + 1).every((x) => !x.v);
  for (let k = from; k <= to; k++) {
    const a = Math.max(0, Math.min(bins - 1, Math.floor((c[k].l - lo) / step)));
    const b = Math.max(0, Math.min(bins - 1, Math.floor((c[k].h - lo) / step)));
    const w = (useTpo ? 1 : c[k].v) / (b - a + 1);
    for (let j = a; j <= b; j++) vol[j] += w;
  }
  let pocIdx = 0;
  for (let j = 1; j < bins; j++) if (vol[j] > vol[pocIdx]) pocIdx = j;
  const total = vol.reduce((s, v) => s + v, 0);
  let inVa = vol[pocIdx];
  let lowJ = pocIdx;
  let highJ = pocIdx;
  while (inVa < total * 0.7 && (lowJ > 0 || highJ < bins - 1)) {
    const down = lowJ > 0 ? vol[lowJ - 1] : -1;
    const up = highJ < bins - 1 ? vol[highJ + 1] : -1;
    if (up >= down) inVa += vol[++highJ];
    else inVa += vol[--lowJ];
  }
  return {
    poc: lo + step * (pocIdx + 0.5),
    vah: lo + step * (highJ + 1),
    val: lo + step * lowJ,
    bins: vol.map((v, j) => ({ price: lo + step * (j + 0.5), volume: v })),
    low: lo,
    high: hi,
  };
}

export function analyze(c: Candle[], params: SmcParams = DEFAULT_PARAMS): Analysis {
  const n = c.length;
  const L = params.swingLen;
  const atr = wilderAtr(c);
  const swings: Swing[] = [];
  const structure: StructureEvent[] = [];
  const orderBlocks: OrderBlock[] = [];
  const fvgs: Fvg[] = [];
  const sweeps: Sweep[] = [];
  const bias: (Dir | "neutral")[] = new Array(n).fill("neutral");
  const trendArr: (Dir | "none")[] = new Array(n).fill("none");
  const signals: BarSignal[] = [];

  let trend: Dir | "none" = "none";
  let lastHigh: Swing | null = null;
  let lastLow: Swing | null = null;
  let rangeHigh: Swing | null = null;
  let rangeLow: Swing | null = null;

  // Higher-timeframe bias from completed HTF bars: close vs EMA(20) and EMA slope.
  const F = params.htfFactor;
  const htfClose: number[] = [];
  const htfEma: number[] = [];
  const k = 2 / 21;

  // Rolling volume profile, recomputed every few bars to bound cost.
  let vp: ReturnType<typeof volumeProfile> = null;

  for (let i = 0; i < n; i++) {
    const bar = c[i];

    // HTF: a bucket completes at i when (i + 1) % F === 0.
    if ((i + 1) % F === 0) {
      const close = bar.c;
      htfClose.push(close);
      const prev = htfEma.at(-1);
      htfEma.push(prev == null ? close : prev + k * (close - prev));
    }
    if (htfEma.length >= 4) {
      const e = htfEma.at(-1)!;
      const slope = e - htfEma.at(-4)!;
      const cl = htfClose.at(-1)!;
      bias[i] = cl > e && slope > 0 ? "bull" : cl < e && slope < 0 ? "bear" : "neutral";
    }

    // Swing confirmation for pivot p = i - L.
    const p = i - L;
    if (p >= L) {
      let isHigh = true;
      let isLow = true;
      for (let j = p - L; j <= p + L; j++) {
        if (j === p) continue;
        if (c[j].h >= c[p].h) isHigh = false;
        if (c[j].l <= c[p].l) isLow = false;
      }
      if (isHigh) {
        const s: Swing = { i: p, price: c[p].h, kind: "high", confirmedAt: i };
        swings.push(s);
        lastHigh = s;
        rangeHigh = s;
      }
      if (isLow) {
        const s: Swing = { i: p, price: c[p].l, kind: "low", confirmedAt: i };
        swings.push(s);
        lastLow = s;
        rangeLow = s;
      }
    }

    // Liquidity sweeps: wick through a recent unbroken swing, close back inside.
    for (let s = swings.length - 1; s >= 0 && s >= swings.length - 8; s--) {
      const sw = swings[s];
      if (sw.brokenAt != null || sw.sweptAt != null || sw.confirmedAt >= i) continue;
      if (sw.kind === "high" && bar.h > sw.price && bar.c < sw.price) {
        sw.sweptAt = i;
        sweeps.push({ i, dir: "bear", level: sw.price, swingI: sw.i });
      } else if (sw.kind === "low" && bar.l < sw.price && bar.c > sw.price) {
        sw.sweptAt = i;
        sweeps.push({ i, dir: "bull", level: sw.price, swingI: sw.i });
      }
    }

    // Market structure: close beyond the last unbroken swing.
    if (lastHigh && lastHigh.brokenAt == null && bar.c > lastHigh.price && lastHigh.confirmedAt < i) {
      lastHigh.brokenAt = i;
      structure.push({ i, kind: trend === "bear" ? "CHoCH" : "BOS", dir: "bull", level: lastHigh.price, fromI: lastHigh.i });
      trend = "bull";
      for (let j = i - 1; j >= Math.max(0, i - params.obLookback); j--) {
        if (c[j].c < c[j].o) {
          orderBlocks.push({ i: j, dir: "bull", top: c[j].h, bottom: c[j].l, createdAt: i });
          break;
        }
      }
    }
    if (lastLow && lastLow.brokenAt == null && bar.c < lastLow.price && lastLow.confirmedAt < i) {
      lastLow.brokenAt = i;
      structure.push({ i, kind: trend === "bull" ? "CHoCH" : "BOS", dir: "bear", level: lastLow.price, fromI: lastLow.i });
      trend = "bear";
      for (let j = i - 1; j >= Math.max(0, i - params.obLookback); j--) {
        if (c[j].c > c[j].o) {
          orderBlocks.push({ i: j, dir: "bear", top: c[j].h, bottom: c[j].l, createdAt: i });
          break;
        }
      }
    }
    trendArr[i] = trend;

    // Fair value gaps (three-candle imbalance), confirmed at the third candle.
    if (i >= 2 && atr[i] > 0) {
      if (bar.l > c[i - 2].h && bar.l - c[i - 2].h >= params.minFvgAtr * atr[i]) {
        fvgs.push({ i: i - 1, dir: "bull", top: bar.l, bottom: c[i - 2].h, createdAt: i, sizeAtr: (bar.l - c[i - 2].h) / atr[i] });
      } else if (bar.h < c[i - 2].l && c[i - 2].l - bar.h >= params.minFvgAtr * atr[i]) {
        fvgs.push({ i: i - 1, dir: "bear", top: c[i - 2].l, bottom: bar.h, createdAt: i, sizeAtr: (c[i - 2].l - bar.h) / atr[i] });
      }
    }

    // Mitigation updates (only for zones created before this bar).
    for (const g of fvgs) {
      if (g.createdAt >= i || g.filledAt != null) continue;
      if (g.dir === "bull") {
        if (bar.l <= g.top && g.touchedAt == null) g.touchedAt = i;
        if (bar.l <= g.bottom) g.filledAt = i;
      } else {
        if (bar.h >= g.bottom && g.touchedAt == null) g.touchedAt = i;
        if (bar.h >= g.top) g.filledAt = i;
      }
    }
    for (const ob of orderBlocks) {
      if (ob.createdAt >= i || ob.invalidatedAt != null) continue;
      if (ob.dir === "bull") {
        if (bar.l <= ob.top && ob.touchedAt == null) ob.touchedAt = i;
        if (bar.c < ob.bottom) ob.invalidatedAt = i;
      } else {
        if (bar.h >= ob.bottom && ob.touchedAt == null) ob.touchedAt = i;
        if (bar.c > ob.top) ob.invalidatedAt = i;
      }
    }

    if (i >= params.vpBars && (vp == null || i % 6 === 0)) vp = volumeProfile(c, i - params.vpBars + 1, i, params.vpBins);

    // Confluence scores for both directions at this bar.
    const score = (d: Dir): { total: number; comp: Components; zoneLow: number | null; zoneHigh: number | null } => {
      const comp: Components = { htf: 0, structure: 0, fvg: 0, orderBlock: 0, sweep: 0, location: 0 };
      let zoneLow: number | null = null;
      let zoneHigh: number | null = null;
      comp.htf = bias[i] === d ? WEIGHTS.htf : bias[i] === "neutral" ? 10 : 0;
      for (let s = structure.length - 1; s >= 0; s--) {
        const ev = structure[s];
        if (i - ev.i > params.structLookback) break;
        if (ev.dir === d) {
          comp.structure = ev.kind === "CHoCH" ? WEIGHTS.structure : 16;
          break;
        }
        break; // most recent event is against us
      }
      for (let g = fvgs.length - 1; g >= 0; g--) {
        const z = fvgs[g];
        if (i - z.createdAt > params.fvgMaxAge) break;
        if (z.dir !== d || z.createdAt >= i || z.filledAt != null) continue;
        const inZone = d === "bull" ? bar.l <= z.top && bar.c >= z.bottom : bar.h >= z.bottom && bar.c <= z.top;
        if (inZone) {
          comp.fvg = WEIGHTS.fvg;
          zoneLow = z.bottom;
          zoneHigh = z.top;
          break;
        }
      }
      for (let o = orderBlocks.length - 1; o >= 0 && o >= orderBlocks.length - 6; o--) {
        const ob = orderBlocks[o];
        if (ob.dir !== d || ob.invalidatedAt != null || ob.createdAt >= i) continue;
        const inZone = d === "bull" ? bar.l <= ob.top && bar.c >= ob.bottom : bar.h >= ob.bottom && bar.c <= ob.top;
        if (inZone) {
          comp.orderBlock = WEIGHTS.orderBlock;
          zoneLow = zoneLow == null ? ob.bottom : Math.min(zoneLow, ob.bottom);
          zoneHigh = zoneHigh == null ? ob.top : Math.max(zoneHigh, ob.top);
          break;
        }
      }
      for (let s = sweeps.length - 1; s >= 0; s--) {
        if (i - sweeps[s].i > params.sweepLookback) break;
        if (sweeps[s].dir === d) {
          comp.sweep = WEIGHTS.sweep;
          break;
        }
      }
      if (rangeHigh && rangeLow && rangeHigh.price > rangeLow.price) {
        const eq = (rangeHigh.price + rangeLow.price) / 2;
        if (d === "bull" ? bar.c < eq : bar.c > eq) comp.location += 5;
      }
      if (vp) {
        if (d === "bull" ? bar.c <= vp.poc : bar.c >= vp.poc) comp.location += 5;
      }
      const total = comp.htf + comp.structure + comp.fvg + comp.orderBlock + comp.sweep + comp.location;
      return { total, comp, zoneLow, zoneHigh };
    };

    const L1 = score("bull");
    const S1 = score("bear");
    let dir: Dir | null = null;
    let stop: number | null = null;
    // A setup needs a price-action zone (FVG or OB) — bias and location alone never trigger.
    const htfOk = (d: Dir) => !params.requireHtfAlignment || bias[i] !== (d === "bull" ? "bear" : "bull");
    const longOk = L1.total >= params.threshold && L1.total > S1.total && (L1.comp.fvg > 0 || L1.comp.orderBlock > 0) && htfOk("bull");
    const shortOk = S1.total >= params.threshold && S1.total > L1.total && (S1.comp.fvg > 0 || S1.comp.orderBlock > 0) && htfOk("bear");
    if (atr[i] > 0 && (longOk || shortOk)) {
      dir = longOk ? "bull" : "bear";
      const a = atr[i];
      if (dir === "bull") {
        let recentLow = Infinity;
        for (let j = Math.max(0, i - 5); j <= i; j++) recentLow = Math.min(recentLow, c[j].l);
        const raw = Math.min(L1.zoneLow ?? recentLow, recentLow) - 0.2 * a;
        const dist = Math.max(params.minStopAtr * a, Math.min(params.maxStopAtr * a, bar.c - raw));
        stop = bar.c - dist;
      } else {
        let recentHigh = -Infinity;
        for (let j = Math.max(0, i - 5); j <= i; j++) recentHigh = Math.max(recentHigh, c[j].h);
        const raw = Math.max(S1.zoneHigh ?? recentHigh, recentHigh) + 0.2 * a;
        const dist = Math.max(params.minStopAtr * a, Math.min(params.maxStopAtr * a, raw - bar.c));
        stop = bar.c + dist;
      }
    }
    signals.push({
      i,
      long: L1.total,
      short: S1.total,
      longC: L1.comp,
      shortC: S1.comp,
      dir,
      score: dir === "bull" ? L1.total : dir === "bear" ? S1.total : Math.max(L1.total, S1.total),
      stop,
      atr: atr[i],
      bias: bias[i],
    });
  }

  // Empirical FVG fill probability: share of past gaps of similar size that
  // filled within 30 bars (Laplace-smoothed). Shown to users; not used in scoring.
  const bucket = (s: number) => (s < 0.5 ? 0 : s < 1 ? 1 : s < 2 ? 2 : 3);
  const stats = [0, 1, 2, 3].map(() => ({ filled: 0, total: 0 }));
  for (const g of fvgs) {
    if (g.createdAt > n - 31) continue;
    const b = stats[bucket(g.sizeAtr)];
    b.total++;
    if (g.filledAt != null && g.filledAt - g.createdAt <= 30) b.filled++;
  }
  for (const g of fvgs) {
    const b = stats[bucket(g.sizeAtr)];
    g.fillProb = (b.filled + 1) / (b.total + 2);
  }

  return {
    params,
    atr,
    swings,
    structure,
    orderBlocks,
    fvgs,
    sweeps,
    bias,
    signals,
    trend: trendArr,
    profile: n > 10 ? volumeProfile(c, Math.max(0, n - params.vpBars), n - 1, params.vpBins) : null,
  };
}

/**
 * Signal at bar i for a threshold at or above the one the analysis ran with.
 * (Run `analyze` at the lowest candidate threshold, then filter upwards — the
 * stop placement doesn't depend on the threshold.)
 */
export function signalAt(a: Analysis, i: number, threshold: number): { dir: Dir; stop: number; score: number } | null {
  const s = a.signals[i];
  if (!s || !s.dir || s.stop == null) return null;
  const score = s.dir === "bull" ? s.long : s.short;
  return score >= threshold ? { dir: s.dir, stop: s.stop, score } : null;
}
