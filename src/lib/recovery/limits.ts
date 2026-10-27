import crypto from "node:crypto";
import { get, run } from "../db";
import { HttpError } from "../users";
import { ensureRecoveryTables } from "./claims";

/**
 * Rate limits for the recovery routes. Each try counts against every key the client has (its IP from
 * proxy headers, its app device id, its sign-in for claims) with a strict per-key cap, and against a
 * generous server-wide cap per route, so rotating headers can't remove the limit and a client with no
 * keys (no proxy in local development) never locks everyone else out on its own. Keys are stored hashed.
 */

export const LIMITS = {
  find: { perKey: 5, global: 300, windowMs: 3_600_000 },
  reset: { perKey: 5, global: 500, windowMs: 3_600_000 },
  claim: { perKey: 3, global: 200, windowMs: 86_400_000 },
} as const;
export type Bucket = keyof typeof LIMITS;

/** The stored key that counts every try on a route. */
export const GLOBAL_KEY = "*";

const hashKey = (k: string) => crypto.createHash("sha256").update(k).digest("hex").slice(0, 32);

export function clientTag(keys: string[]) {
  return keys.length ? hashKey(keys.join("|")).slice(0, 12) : "anonymous";
}

const TOO_MANY = "Too many tries. Wait an hour and try again.";
const BUSY = "We're getting a lot of requests right now. Try again in an hour.";

/** Records one try; throws 429 rate_limited when any key, or the route as a whole, is out of tries. */
export function spendTry(bucket: Bucket, keys: string[], now = Date.now()) {
  ensureRecoveryTables();
  const { perKey, global, windowMs } = LIMITS[bucket];
  const since = now - windowMs;
  const count = (k: string) => get<{ n: number }>("SELECT COUNT(*) AS n FROM recovery_attempts WHERE bucket = ? AND client_key = ? AND ts > ?", bucket, k, since)!.n;
  const hashed = [...new Set(keys)].map(hashKey);
  for (const k of hashed) if (count(k) >= perKey) throw new HttpError(429, TOO_MANY, "rate_limited");
  if (count(GLOBAL_KEY) >= global) throw new HttpError(429, BUSY, "rate_limited");
  for (const k of [...hashed, GLOBAL_KEY]) run("INSERT INTO recovery_attempts (bucket, client_key, ts) VALUES (?, ?, ?)", bucket, k, now);
  // Keep the table small.
  run("DELETE FROM recovery_attempts WHERE ts < ?", now - 7 * 86_400_000);
}
