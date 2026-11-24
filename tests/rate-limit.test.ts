import { describe, expect, it } from "vitest";
import { all } from "@/lib/db";
import { HttpError } from "@/lib/users";
import { DEFAULT_PER_MINUTE, RateLimitError, checkRateLimit, checkRateLimits, generalLimitPerMinute } from "@/lib/rate-limit";

const MINUTE = 60_000;
// A fixed clock at the start of a minute, so window edges are predictable.
const T0 = Date.UTC(2026, 10, 22, 10, 0, 0);

function refused(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected a 429");
}

describe("checkRateLimit", () => {
  it("allows `limit` requests in a window, then answers 429 rate_limited", () => {
    for (let i = 0; i < 3; i++) expect(checkRateLimit("t1:ip:1.2.3.4", 3, MINUTE, T0 + i).remaining).toBe(2 - i);
    const e = refused(() => checkRateLimit("t1:ip:1.2.3.4", 3, MINUTE, T0 + 10_000));
    expect(e).toBeInstanceOf(HttpError);
    expect(e).toBeInstanceOf(RateLimitError);
    expect((e as HttpError).status).toBe(429);
    expect((e as HttpError).code).toBe("rate_limited");
    expect((e as HttpError).message).toMatch(/Too many requests/);
    expect((e as RateLimitError).retryAfterSeconds).toBe(50);
  });

  it("starts again in the next window", () => {
    for (let i = 0; i < 2; i++) checkRateLimit("t2:user:a", 2, MINUTE, T0 + i);
    expect(() => checkRateLimit("t2:user:a", 2, MINUTE, T0 + MINUTE - 1)).toThrow(RateLimitError);
    const next = checkRateLimit("t2:user:a", 2, MINUTE, T0 + MINUTE);
    expect(next.remaining).toBe(1);
    expect(next.resetAt).toBe(T0 + 2 * MINUTE);
  });

  it("keeps keys, and the same key with a different window, apart", () => {
    checkRateLimit("t3:ip:a", 1, MINUTE, T0);
    expect(() => checkRateLimit("t3:ip:a", 1, MINUTE, T0)).toThrow(RateLimitError);
    expect(checkRateLimit("t3:ip:b", 1, MINUTE, T0).remaining).toBe(0);
    expect(checkRateLimit("t3:ip:a", 1, 60 * MINUTE, T0).remaining).toBe(0);
  });

  it("treats a limit of 0 as no limit and counts nothing", () => {
    for (let i = 0; i < 5; i++) expect(checkRateLimit("t4:off", 0, MINUTE, T0).remaining).toBe(Infinity);
    expect(checkRateLimit("t4:off", 1, MINUTE, T0).remaining).toBe(0);
  });

  it("stores keys hashed, never the IP or user id", () => {
    checkRateLimit("t5:ip:203.0.113.7", 5, MINUTE, T0);
    const keys = all<{ key: string }>("SELECT key FROM rate_limits").map((r) => r.key);
    expect(keys.some((k) => k.includes("203.0.113.7"))).toBe(false);
    expect(keys.every((k) => /^[0-9a-f]{32}$/.test(k))).toBe(true);
  });

  it("clears out windows that have ended", () => {
    checkRateLimit("t6:old", 5, MINUTE, T0);
    const later = T0 + 10 * MINUTE;
    checkRateLimit("t6:new", 5, MINUTE, later);
    const left = all<{ expires_at: number }>("SELECT expires_at FROM rate_limits");
    expect(left.every((r) => r.expires_at > later)).toBe(true);
  });

  it("explains the wait in plain words", () => {
    const hour = 60 * MINUTE;
    checkRateLimit("t7:mpin", 1, hour, T0);
    const e = refused(() => checkRateLimit("t7:mpin", 1, hour, T0 + 1000)) as RateLimitError;
    expect(e.message).toBe("Too many requests. Wait an hour and try again.");
    expect(e.retryAfterSeconds).toBe(3599);
  });
});

describe("checkRateLimits (several keys)", () => {
  it("counts nothing when any key is out of requests", () => {
    checkRateLimit("t8:user:x", 1, MINUTE, T0);
    expect(() => checkRateLimits(["t8:ip:y", "t8:user:x"], 1, MINUTE, T0)).toThrow(RateLimitError);
    // The IP key wasn't spent by the refused call.
    expect(checkRateLimit("t8:ip:y", 1, MINUTE, T0).remaining).toBe(0);
  });

  it("reports the smallest remaining, and counts a repeated key once", () => {
    checkRateLimit("t9:a", 5, MINUTE, T0);
    checkRateLimit("t9:a", 5, MINUTE, T0);
    expect(checkRateLimits(["t9:a", "t9:b", "t9:b"], 5, MINUTE, T0).remaining).toBe(2);
    expect(checkRateLimit("t9:b", 5, MINUTE, T0).remaining).toBe(3);
  });

  it("passes with no keys", () => {
    expect(checkRateLimits([], 5, MINUTE, T0).remaining).toBe(5);
  });
});

describe("generalLimitPerMinute", () => {
  it("defaults to 120 and reads RATE_LIMIT_PER_MINUTE", () => {
    expect(DEFAULT_PER_MINUTE).toBe(120);
    expect(generalLimitPerMinute({})).toBe(120);
    expect(generalLimitPerMinute({ RATE_LIMIT_PER_MINUTE: "300" })).toBe(300);
    expect(generalLimitPerMinute({ RATE_LIMIT_PER_MINUTE: "0" })).toBe(0);
    expect(generalLimitPerMinute({ RATE_LIMIT_PER_MINUTE: "lots" })).toBe(120);
    expect(generalLimitPerMinute({ RATE_LIMIT_PER_MINUTE: "-5" })).toBe(120);
  });
});
