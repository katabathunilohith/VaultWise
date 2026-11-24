import type { Candle } from "./market";
import type { NativeInterval, PriceProvider, RawSeries } from "./prices";

/** The Yahoo Finance chart API: delayed quotes, no key. The only file in the app that calls it. */
async function fetchYahoo(symbol: string, interval: NativeInterval, range: string): Promise<RawSeries> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Vaultwise prototype)" }, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    if (!r?.timestamp) throw new Error("No data");
    const q = r.indicators.quote[0];
    let currency: string = r.meta?.currency ?? "USD";
    const scale = currency === "GBp" || currency === "GBX" ? 0.01 : 1;
    if (scale !== 1) currency = "GBP";
    const candles: Candle[] = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      const o = q.open[i];
      const h = q.high[i];
      const l = q.low[i];
      const c = q.close[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({ t: r.timestamp[i] * 1000, o: o * scale, h: h * scale, l: l * scale, c: c * scale, v: q.volume?.[i] ?? 0 });
    }
    if (candles.length < 10) throw new Error("Too few candles");
    return { candles, currency };
  } finally {
    clearTimeout(timer);
  }
}

export const yahooProvider: PriceProvider = { source: "yahoo", fetchCandles: fetchYahoo };
