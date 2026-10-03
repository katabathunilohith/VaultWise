import { describe, expect, it } from "vitest";
import { syntheticCandles, type Candle } from "@/lib/invest/market";
import { analyze, DEFAULT_PARAMS } from "@/lib/invest/smc";
import { runBacktest } from "@/lib/invest/backtest";

const candles = syntheticCandles("TEST-USD", "1h", 900);

describe("SMC engine", () => {
  it("has no lookahead: a bar's signal is identical whether or not future bars exist", () => {
    const full = analyze(candles);
    for (const k of [200, 333, 512, 777, 899]) {
      const prefix = analyze(candles.slice(0, k + 1));
      const a = full.signals[k];
      const b = prefix.signals[k];
      expect({ long: b.long, short: b.short, dir: b.dir, stop: b.stop }).toEqual({ long: a.long, short: a.short, dir: a.dir, stop: a.stop });
    }
  });

  it("detects a bullish fair value gap", () => {
    const base = { v: 1, t: 0 };
    const c: Candle[] = [];
    for (let i = 0; i < 20; i++) c.push({ ...base, t: i, o: 100, h: 101, l: 99, c: 100 });
    // Three-candle imbalance: candle 22's low sits above candle 20's high.
    c.push({ ...base, t: 20, o: 100, h: 101, l: 99, c: 100.5 });
    c.push({ ...base, t: 21, o: 100.5, h: 106, l: 100.4, c: 105.8 });
    c.push({ ...base, t: 22, o: 105.8, h: 107, l: 103, c: 106.5 });
    const a = analyze(c, { ...DEFAULT_PARAMS, minFvgAtr: 0.1 });
    const gap = a.fvgs.find((g) => g.dir === "bull" && g.createdAt === 22);
    expect(gap).toBeDefined();
    expect(gap!.bottom).toBe(101);
    expect(gap!.top).toBe(103);
  });

  it("produces a walk-forward backtest with a governance verdict", () => {
    const r = runBacktest(candles, {}, { riskPct: 1, dailyHaltPct: 3, weeklyHaltPct: 6 });
    expect(r.folds).toHaveLength(4);
    expect(r.gate.checks.length).toBeGreaterThan(3);
    for (const t of r.trades) expect(Number.isFinite(t.r)).toBe(true);
    expect(r.full.maxDrawdownPct).toBeGreaterThanOrEqual(0);
  });
});
