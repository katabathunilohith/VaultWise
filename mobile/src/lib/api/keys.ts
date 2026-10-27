import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { Mode } from "./connection";
import type { Minor } from "./types";

/**
 * Query keys, in one place. A cached query's key is `[mode, name, ...args]`: the connection mode
 * first, so switching live/Practice never shows the other source's cache, then the name that
 * refreshes match on. `qk` builds the part after the mode; `useApiQuery` adds the mode.
 */
export const qk = {
  me: () => ["me"] as const,
  region: () => ["region"] as const,
  dashboard: () => ["dashboard"] as const,
  vaults: () => ["vaults"] as const,
  vault: (id: string | undefined) => ["vault", id] as const,
  emergency: () => ["emergency"] as const,
  emergencyPreview: (amount: Minor | null) => ["emergency-preview", amount] as const,
  limits: () => ["limits"] as const,
  portfolio: () => ["portfolio"] as const,
  investCore: () => ["invest-core"] as const,
  investSatellite: () => ["invest-satellite"] as const,
  insight: () => ["insight"] as const,
  activity: () => ["activity"] as const,
  accounts: () => ["accounts"] as const,
  badges: () => ["badges"] as const,
  samples: () => ["samples"] as const,
  proof: (id: string | undefined) => ["proof", id] as const,
  checkout: (intentId: string | undefined) => ["checkout", intentId] as const,
  payIntents: () => ["pay-intents"] as const,
  wallet: () => ["wallet"] as const, // wallet
  kyc: () => ["kyc"] as const, // identity
  recovery: () => ["recovery"] as const, // identity
};

/** A query's key without the mode, as `qk` builds it. */
export type ApiKey = ReturnType<(typeof qk)[keyof typeof qk]>;

/** A query's name, the part refreshes match on. */
export type QueryName = ApiKey[0];

/** The full cache key for `key` in this connection mode. */
export function withMode(mode: Mode, key: ApiKey): QueryKey {
  return [mode, ...key];
}

type Cached = { queryKey: QueryKey };

/** Matches cached queries with any of these names, in either mode. */
export function byName(...names: QueryName[]) {
  const wanted = new Set<unknown>(names);
  return (q: Cached) => wanted.has(q.queryKey[1]);
}

/** Matches one query (its name and arguments), in either mode. */
export function byKey(key: ApiKey) {
  const parts: readonly unknown[] = key;
  return (q: Cached) => parts.every((part, i) => q.queryKey[i + 1] === part);
}

/** Marks the named queries stale in both modes; resolves once the ones on screen have refetched. */
export function invalidate(qc: QueryClient, ...names: QueryName[]) {
  return qc.invalidateQueries({ predicate: byName(...names) });
}

/**
 * Everything that shows a balance or where money is, refreshed after money moves. A proof isn't
 * one: it shows a decision, and its own poll keeps it current.
 */
export const MONEY_QUERIES: ReadonlySet<QueryName> = new Set<QueryName>([
  "dashboard",
  "vaults",
  "vault",
  "emergency",
  "limits",
  "activity",
  "badges",
  "portfolio",
  "pay-intents",
  "invest-core",
  "invest-satellite",
  "checkout",
  "accounts",
  "wallet", // wallet
]);
