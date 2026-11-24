import type { Candle, NativeInterval, PriceProvider } from "@/lib/invest";

const STEP_MS: Record<NativeInterval, number> = { "1h": 3_600_000, "1d": 86_400_000, "1wk": 604_800_000, "1mo": 2_629_800_000 };

/**
 * A deterministic price provider for tests (no network): flat candles at a fixed price per symbol, ending now.
 * FX pairs (`EURUSD=X`) default to 1 and everything else to 100, so a buy of 100.00 gets exactly 1 unit.
 * `calls` records every request, so a test can check the provider was used.
 */
export function fakePrices(opts: { prices?: Record<string, number>; bars?: number; currency?: string } = {}): PriceProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    source: "fake",
    calls,
    async fetchCandles(symbol, interval, range) {
      calls.push(`${symbol}|${interval}|${range}`);
      const price = opts.prices?.[symbol] ?? (symbol.endsWith("=X") ? 1 : 100);
      const n = opts.bars ?? 300;
      const step = STEP_MS[interval];
      const end = Math.floor(Date.now() / step) * step;
      const candles: Candle[] = Array.from({ length: n }, (_, i) => ({
        t: end - (n - 1 - i) * step,
        o: price,
        h: price,
        l: price,
        c: price,
        v: 1000,
      }));
      return { candles, currency: opts.currency ?? "USD" };
    },
  };
}

/** A provider that is always down, to exercise the cache and synthetic fallbacks. */
export function downPrices(): PriceProvider & { calls: number } {
  const p = {
    source: "down",
    calls: 0,
    async fetchCandles(): Promise<never> {
      p.calls++;
      throw new Error("market data unavailable");
    },
  };
  return p;
}
