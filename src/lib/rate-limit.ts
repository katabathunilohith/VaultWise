import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { db, get, run } from "./db";
import { HttpError } from "./users";

/**
 * rate-limit: a shared fixed-window limiter (plan 05), modelled on src/lib/recovery/limits.ts.
 *
 * Each call to `checkRateLimit(key, limit, windowMs)` counts one request against `key` in the current
 * window (time is cut into fixed windows of `windowMs`, e.g. every whole minute). Once a key has used
 * `limit` requests in a window, further calls throw HttpError 429 `rate_limited` until the next window.
 * Counts live in SQLite (table `rate_limits`, created on first use), so they survive a restart and every
 * route shares them. Keys are stored hashed, because they hold IP addresses and user ids.
 *
 * Name keys by what they limit, so different limits never share a counter:
 *   checkRateLimit(`all:ip:${ip}`, generalLimitPerMinute(), 60_000)
 *   checkRateLimit(`mpin:user:${userId}`, 10, 15 * 60_000)
 *
 * Where it is wired:
 *   1. `handle()` in src/lib/api.ts: before every route, the general limit per client IP (`clientIp()` in
 *      src/lib/auth/context.ts, so only behind a trusted proxy), `generalLimitPerMinute()` per minute.
 *   2. `session()` in src/lib/auth/session.ts, once the person is signed in (firebase mode): the same general
 *      limit keyed by wallet id (a recovery claimant by its own sign-in), so every customer route and GET /me
 *      share it, and it runs before the calling device is recorded. `admin()` in src/lib/api.ts keys it by
 *      reviewer email.
 *   3. `limitUploads(userId)` below in the photo upload routes (bills, receipts, ID photos, limit-request
 *      documents): `UPLOADS_PER_HOUR` per person per hour, shared across those routes. MPIN and OTP limits
 *      live in their own modules.
 *   `errorResponse()` in src/lib/api.ts turns the RateLimitError into `{ error, code: "rate_limited" }` with
 *   status 429 and a `Retry-After` header from `retryAfterSeconds`.
 * Behind Caddy set TRUST_PROXY_HOPS=1 so `clientIp()` sees each visitor's address (deploy/README.md).
 *
 * Switch: RATE_LIMIT_PER_MINUTE (default 120) sets the general limit; 0 turns the general limit off.
 * Remove: delete this file and its calls (marked `// rate-limit`); the `rate_limits` table can stay or be dropped.
 */

export const DEFAULT_PER_MINUTE = 120;

/** The general per-user and per-IP limit for every route, per minute. 0 means off. */
export function generalLimitPerMinute(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env.RATE_LIMIT_PER_MINUTE?.trim();
  if (!raw) return DEFAULT_PER_MINUTE;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_PER_MINUTE;
}

export class RateLimitError extends HttpError {
  constructor(
    message: string,
    /** Seconds until the window resets, for a `Retry-After` header. */
    public retryAfterSeconds: number,
  ) {
    super(429, message, "rate_limited");
  }
}

export interface RateLimitResult {
  limit: number;
  /** Requests left in this window after this one. */
  remaining: number;
  /** When the current window ends (ms since epoch). */
  resetAt: number;
}

const ready = new WeakSet<DatabaseSync>();

function ensureTable() {
  const d = db();
  if (ready.has(d)) return;
  d.exec(`CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (key, window_start)
  );
  CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON rate_limits(expires_at);`);
  ready.add(d);
}

// The window size is part of the stored key, so two limits on the same key with different windows never collide.
const hashKey = (key: string, windowMs: number) => crypto.createHash("sha256").update(`${windowMs}|${key}`).digest("hex").slice(0, 32);

function waitText(seconds: number) {
  if (seconds <= 60) return "a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

let lastSweep = 0;

/**
 * Counts one request against `key` and returns what's left. Throws RateLimitError (HttpError 429,
 * code `rate_limited`) when the key has already used `limit` requests in the current window.
 * A `limit` of 0 or less means no limit: nothing is counted.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  return checkRateLimits([key], limit, windowMs, now);
}

/**
 * The same for several keys at once (e.g. a user id and an IP): if any key is out of requests nothing is
 * counted and it throws; otherwise each key is counted once. `remaining` is the smallest across the keys.
 *
 * The statements run synchronously, so requests in this one Node process can't interleave between the
 * check and the count. Call it outside `tx()`: inside one, a later error in the same transaction would
 * roll the count back (the same trap as audit rows for failures, see docs/security.md).
 * `count: false` only checks: it throws the same way but counts nothing.
 */
export function checkRateLimits(keys: string[], limit: number, windowMs: number, now = Date.now(), { count = true }: { count?: boolean } = {}): RateLimitResult {
  if (!(windowMs > 0)) throw new Error("checkRateLimit: windowMs must be positive");
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  if (limit <= 0) return { limit, remaining: Infinity, resetAt };
  ensureTable();

  // Old windows are never read again: clear them out at most once a minute.
  if (now - lastSweep > 60_000 || now < lastSweep) {
    lastSweep = now;
    run("DELETE FROM rate_limits WHERE expires_at <= ?", now);
  }

  const stored = [...new Set(keys)].map((k) => hashKey(k, windowMs));
  let mostUsed = 0;
  for (const k of stored) {
    const used = get<{ count: number }>("SELECT count FROM rate_limits WHERE key = ? AND window_start = ?", k, windowStart)?.count ?? 0;
    if (used >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      throw new RateLimitError(`Too many requests. Wait ${waitText(retryAfterSeconds)} and try again.`, retryAfterSeconds);
    }
    mostUsed = Math.max(mostUsed, used);
  }
  if (!count) return { limit, remaining: stored.length ? limit - mostUsed : limit, resetAt };
  for (const k of stored) {
    run(
      `INSERT INTO rate_limits (key, window_start, count, expires_at) VALUES (?, ?, 1, ?)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1`,
      k,
      windowStart,
      resetAt,
    );
  }
  return { limit, remaining: stored.length ? limit - mostUsed - 1 : limit, resetAt };
}

/** Photo uploads (bills, receipts, ID photos, limit-request documents) one person may send per hour, across those routes. */
export const UPLOADS_PER_HOUR = 20;

/**
 * Counts one photo upload for this person; throws RateLimitError (429) past `UPLOADS_PER_HOUR` in the hour.
 * Call it right after `customer()`, before reading the file, and outside any transaction.
 */
export function limitUploads(userId: string, now = Date.now()): RateLimitResult {
  return checkRateLimit(`upload:user:${userId}`, UPLOADS_PER_HOUR, 60 * 60_000, now);
}

/**
 * Throws the same 429 when this person has no uploads left this hour, without counting one. For routes that
 * must look something up before they know the upload is wanted: call this before reading the file, then
 * limitUploads() once the upload is accepted, so a refused request doesn't use up an upload.
 */
export function assertUploadsLeft(userId: string, now = Date.now()): RateLimitResult {
  return checkRateLimits([`upload:user:${userId}`], UPLOADS_PER_HOUR, 60 * 60_000, now, { count: false });
}
