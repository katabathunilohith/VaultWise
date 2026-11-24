import { get, run } from "../db";
import { priceProvider } from "./prices";

export interface Candle {
  t: number; // ms epoch (bar open)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Interval = "1h" | "4h" | "1d" | "1wk" | "1mo";

export interface Series {
  symbol: string;
  interval: Interval;
  currency: string;
  /** The price provider's name ("yahoo" by default, see prices.ts), "cache" or "synthetic". */
  source: string;
  fetchedAt: number;
  candles: Candle[];
}

export const SATELLITE_UNIVERSE = [
  { symbol: "BTC-USD", name: "Bitcoin", assetClass: "crypto" as const },
  { symbol: "ETH-USD", name: "Ether", assetClass: "crypto" as const },
  { symbol: "EURUSD=X", name: "EUR / USD", assetClass: "forex" as const },
  { symbol: "GBPUSD=X", name: "GBP / USD", assetClass: "forex" as const },
  { symbol: "USDJPY=X", name: "USD / JPY", assetClass: "forex" as const },
  { symbol: "SPY", name: "S&P 500 ETF", assetClass: "equities" as const },
  { symbol: "AAPL", name: "Apple", assetClass: "equities" as const },
  { symbol: "NVDA", name: "NVIDIA", assetClass: "equities" as const },
];

const TTL: Record<Interval, number> = {
  "1h": 5 * 60_000,
  "4h": 10 * 60_000,
  "1d": 30 * 60_000,
  "1wk": 6 * 3_600_000,
  "1mo": 12 * 3_600_000,
};

const DEFAULT_RANGE: Record<Interval, string> = {
  "1h": "60d",
  "4h": "730d",
  "1d": "2y",
  "1wk": "10y",
  "1mo": "10y",
};

function aggregate(candles: Candle[], hours: number): Candle[] {
  const bucket = hours * 3_600_000;
  const out: Candle[] = [];
  for (const c of candles) {
    const key = Math.floor(c.t / bucket) * bucket;
    const last = out.at(-1);
    if (last && last.t === key) {
      last.h = Math.max(last.h, c.h);
      last.l = Math.min(last.l, c.l);
      last.c = c.c;
      last.v += c.v;
    } else out.push({ ...c, t: key });
  }
  return out;
}

function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic regime-switching random walk, used only when live data is unreachable. */
export function syntheticCandles(symbol: string, interval: Interval, n = 600): Candle[] {
  const rand = rng(hashSeed(symbol + interval));
  const stepMs = { "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1wk": 604_800_000, "1mo": 2_629_800_000 }[interval];
  const isCrypto = symbol.includes("-USD");
  const isFx = symbol.endsWith("=X");
  const annualVol = isCrypto ? 0.65 : isFx ? 0.08 : 0.22;
  const perBar = annualVol * Math.sqrt(stepMs / (365 * 86_400_000));
  let price = isCrypto ? 60000 : isFx ? 1.1 : 150;
  let drift = 0;
  const start = Date.now() - n * stepMs;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    if (rand() < 0.03) drift = (rand() - 0.5) * perBar * 0.8;
    const g = () => {
      const u = Math.max(1e-9, rand());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
    };
    const o = price;
    const c = o * Math.exp(drift + perBar * g());
    const h = Math.max(o, c) * (1 + Math.abs(g()) * perBar * 0.5);
    const l = Math.min(o, c) * (1 - Math.abs(g()) * perBar * 0.5);
    out.push({ t: start + i * stepMs, o, h, l, c, v: Math.round(1000 + rand() * 5000) });
    price = c;
  }
  return out;
}

export async function getSeries(symbol: string, interval: Interval, range = DEFAULT_RANGE[interval]): Promise<Series> {
  const key = `${symbol}|${interval}|${range}`;
  const cached = get<{ fetched_at: number; source: string; payload: string }>("SELECT * FROM market_cache WHERE key = ?", key);
  if (cached && Date.now() - cached.fetched_at < TTL[interval]) {
    const p = JSON.parse(cached.payload);
    return {
      symbol,
      interval,
      currency: p.currency,
      source: cached.source === "synthetic" ? "synthetic" : "cache",
      fetchedAt: cached.fetched_at,
      candles: p.candles,
    };
  }
  try {
    // Every live read goes through the price provider (Yahoo by default; tests plug in a fake).
    const provider = priceProvider();
    const raw = await provider.fetchCandles(symbol, interval === "4h" ? "1h" : interval, range);
    const candles = interval === "4h" ? aggregate(raw.candles, 4) : raw.candles;
    const now = Date.now();
    run(
      "INSERT INTO market_cache (key, fetched_at, source, payload) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET fetched_at = excluded.fetched_at, source = excluded.source, payload = excluded.payload",
      key,
      now,
      provider.source,
      JSON.stringify({ currency: raw.currency, candles }),
    );
    return { symbol, interval, currency: raw.currency, source: provider.source, fetchedAt: now, candles };
  } catch {
    if (cached) {
      const p = JSON.parse(cached.payload);
      return { symbol, interval, currency: p.currency, source: "cache", fetchedAt: cached.fetched_at, candles: p.candles };
    }
    const candles = syntheticCandles(symbol, interval);
    return { symbol, interval, currency: "USD", source: "synthetic", fetchedAt: Date.now(), candles };
  }
}

export async function latestPrice(symbol: string) {
  const s = await getSeries(symbol, "1d", "1mo");
  const last = s.candles.at(-1)!;
  const prev = s.candles.at(-2) ?? last;
  return { price: last.c, change: (last.c - prev.c) / prev.c, currency: s.currency, source: s.source, t: last.t };
}
