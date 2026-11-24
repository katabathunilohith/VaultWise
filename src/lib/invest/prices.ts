import type { Candle, Interval } from "./market";
import { yahooProvider } from "./yahoo";

/** An interval a provider serves directly. 4-hour bars are built from hourly ones in market.ts. */
export type NativeInterval = Exclude<Interval, "4h">;

/** What a provider returns: candles oldest first, priced in `currency`. */
export interface RawSeries {
  candles: Candle[];
  currency: string;
}

/**
 * Where market prices come from (dependency inversion: market.ts depends on this, not on Yahoo).
 * The Yahoo adapter (`yahoo.ts`) is the default. Tests plug in a deterministic fake with
 * `setPriceProvider()`, so no test reaches the network; another data vendor would be one more adapter.
 */
export interface PriceProvider {
  /** Recorded as the series' `source` and in `market_cache`, e.g. "yahoo". */
  readonly source: string;
  /**
   * Candles for `symbol` over `range` (a Yahoo-style range such as "1mo", "2y", "730d").
   * Throws when the data can't be had; market.ts then falls back to the cache, then to synthetic data.
   */
  fetchCandles(symbol: string, interval: NativeInterval, range: string): Promise<RawSeries>;
}

let override: PriceProvider | null = null;

/** Swaps the price provider (tests). `null` goes back to the default, Yahoo. */
export function setPriceProvider(next: PriceProvider | null) {
  override = next;
}

/** The provider every price read goes through. */
export function priceProvider(): PriceProvider {
  return override ?? yahooProvider;
}
