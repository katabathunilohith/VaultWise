import { all, parseJson } from "../db";
import type { User } from "../users";
import { diff, LIMIT_KEYS, type Limits } from "./bounds";
import { getLimits, type ChangeRow } from "./store";

/**
 * The arithmetic of temporary (emergency) increases: how one is applied on top of the limits as they
 * are now, and what a limit falls back to when one expires. Call these inside the transaction that
 * saves the result, so the limits they read can't change underneath.
 *
 * For an applied emergency increase, `limit_changes.before_limits` holds, for each limit it raises, the
 * level that limit falls back to (the lowest of the limit when it was applied and the fall-back of any
 * other increase still applied to it), and `after_limits` the level this increase grants. Other limits
 * hold their value at the time it was applied.
 */

interface Increase {
  before: Limits;
  after: Limits;
  raised: (keyof Limits)[];
}

/** Emergency increases still applied for this user, optionally leaving one out and those already due at `activeAt`. */
function appliedIncreases(user: User, opts: { excludeId?: string; activeAt?: number } = {}): Increase[] {
  const out: Increase[] = [];
  for (const r of all<ChangeRow>("SELECT * FROM limit_changes WHERE user_id = ? AND kind = 'emergency' AND status = 'applied'", user.id)) {
    if (r.id === opts.excludeId) continue;
    if (opts.activeAt !== undefined && !((r.expires_at ?? 0) > opts.activeAt)) continue;
    const before = parseJson<Limits | null>(r.before_limits, null);
    const after = parseJson<Limits | null>(r.after_limits, null);
    if (!before || !after) continue;
    out.push({ before, after, raised: diff(before, after).loosened });
  }
  return out;
}

/**
 * Applies an approved emergency request (filed as `filedBefore` → `filedAfter`) on top of the current limits:
 * - a limit the request raises goes to the requested value, or stays higher if it is higher now;
 * - a limit the request lowers goes to the lower of now and the requested value;
 * - every other limit keeps its current value, so a limit lowered since the request was filed stays lowered.
 * Returns the limits to save and the `before` / `after` to store on the change (see above).
 */
export function planIncrease(user: User, filedBefore: Limits, filedAfter: Limits) {
  const current = getLimits(user);
  const raised = diff(filedBefore, filedAfter).loosened;
  const active = appliedIncreases(user);
  const limits = { ...current };
  const before = { ...current };
  const after = { ...current };
  for (const k of LIMIT_KEYS) {
    if (raised.includes(k)) {
      const floor = Math.min(current[k], ...active.filter((a) => a.raised.includes(k)).map((a) => a.before[k]));
      before[k] = floor;
      after[k] = Math.max(filedAfter[k], floor);
      limits[k] = Math.max(current[k], filedAfter[k]);
    } else if (filedAfter[k] < filedBefore[k]) {
      after[k] = limits[k] = Math.min(current[k], filedAfter[k]);
    }
  }
  return { limits, before, after };
}

/**
 * What the limits become when emergency increase `r` expires: each limit it raised falls back to its stored
 * fall-back level, or to the highest level another still-active increase grants that limit, and never above
 * its current value. Limits it didn't raise are left alone.
 */
export function fallBack(user: User, r: ChangeRow, now: number): Limits {
  const current = getLimits(user);
  const before = parseJson<Limits>(r.before_limits, current);
  const after = parseJson<Limits>(r.after_limits, current);
  const others = appliedIncreases(user, { excludeId: r.id, activeAt: now });
  const restored = { ...current };
  for (const k of diff(before, after).loosened) {
    const granted = others.filter((o) => o.raised.includes(k)).map((o) => o.after[k]);
    restored[k] = Math.min(current[k], Math.max(before[k], ...granted));
  }
  return restored;
}
