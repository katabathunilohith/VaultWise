import { db } from "../db";
import { audit } from "../audit";
import { checkPin, HttpError, type User } from "../users";
import { moneyPolicy, type MoneyAction } from "../money-routes";
import { mpinEnforced } from "./config";
import { activeLock, recordFailure, recordSuccess } from "./attempts";
import { rememberPinLength, upgradeDue } from "./meta";

/**
 * An MPIN error. `extra` holds the contract's extra fields (`triesLeft`, `lockedUntil`, `reason`).
 * errorResponse() in lib/api.ts spreads `extra` into the JSON; the same facts are also in the message
 * and on GET /me (`mpin.lockedUntil`).
 */
export class MpinError extends HttpError {
  constructor(
    status: number,
    message: string,
    code: "mpin_required" | "mpin_wrong" | "mpin_locked" | "mpin_weak",
    public extra: { triesLeft?: number; lockedUntil?: number; reason?: string } = {},
  ) {
    super(status, message, code);
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "45 seconds", "5 minutes", "24 hours": how long until `until`, rounded up. */
export function waitText(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return plural(s, "second");
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return plural(m, "minute");
  return plural(Math.ceil(ms / 3_600_000), "hour");
}

/** With MPIN_ENFORCED=false only `always` checks are locked, not money moves, so the message doesn't mention them. */
function lockedError(lockedUntil: number, now: number, justLocked: boolean) {
  const what = mpinEnforced() ? "money moves are" : "anything that needs your MPIN is";
  const message = justLocked
    ? `That MPIN isn't right, and that was too many wrong tries. ${what[0].toUpperCase()}${what.slice(1)} locked for ${waitText(lockedUntil - now)}.`
    : `Too many wrong MPIN tries, so ${what} locked. Try again in ${waitText(lockedUntil - now)}.`;
  return new MpinError(423, message, "mpin_locked", { lockedUntil });
}

/**
 * Checks the MPIN for a money action, before any money transaction starts.
 *
 * - Locked → 423 `mpin_locked` (with `lockedUntil`); the PIN isn't checked and the try isn't counted.
 * - No PIN → 401 `mpin_required`.
 * - Wrong → 403 `mpin_wrong` (with `triesLeft`), or 423 `mpin_locked` when this try starts a lock.
 *   Every wrong try, and every lock, is audited here, outside any transaction, so it's never rolled back.
 *   The PIN itself is never logged.
 * - Right → the count resets.
 *
 * With MPIN_ENFORCED=false nothing throws (a PIN that was sent is still checked and counted, except
 * while a lock is on, when it isn't checked at all), unless `always` is set: a check that must hold
 * whatever the switch says (Tier 2 emergency, changing the PIN, trusting or signing out devices,
 * changing the phone number) then behaves exactly as when enforced, the lock included, so rollback
 * mode can't be used to guess the PIN without limit.
 *
 * Returns true when a PIN was sent and was right.
 */
export function requireMpin(
  user: User,
  pin: string | null | undefined,
  action: MoneyAction,
  opts: { always?: boolean; now?: number } = {},
): boolean {
  if (!moneyPolicy(action).mpin) return false;
  if (db().isTransaction) throw new Error("requireMpin() must run before the money transaction, so a wrong try's audit row is kept.");
  const now = opts.now ?? Date.now();
  const enforced = mpinEnforced();
  // Strict: refuse a missing or wrong PIN and apply the lock. Every check when enforced; `always` checks in rollback mode too.
  const strict = enforced || !!opts.always;

  const lockedUntil = activeLock(user.id, now);
  if (lockedUntil !== null) {
    if (strict) throw lockedError(lockedUntil, now, false);
    // Rollback mode, a money move: it goes ahead without the PIN, but a PIN sent during a lock isn't checked,
    // so money routes can't be used to keep guessing while the `always` checks are locked.
    return false;
  }
  const given = typeof pin === "string" && pin.length > 0 ? pin : null;
  if (given === null) {
    if (strict) throw new MpinError(401, "Enter your MPIN to continue.", "mpin_required");
    return false;
  }
  if (checkPin(user, given)) {
    recordSuccess(user.id, now);
    rememberPinLength(user.id, given.length, now);
    return true;
  }

  const r = recordFailure(user.id, now);
  const base = { userId: user.id, actor: user.id, actorType: "user" as const, entityType: "user", entityId: user.id, ts: now };
  audit({ ...base, action: "mpin.failed", details: { action, failures: r.failures, triesLeft: r.triesLeft, enforced } });
  if (r.lockedUntil !== null)
    audit({ ...base, action: "mpin.locked", details: { action, failures: r.failures, lockedUntil: r.lockedUntil, enforced } });
  if (!strict) return false;
  if (r.lockedUntil !== null) throw lockedError(r.lockedUntil, now, true);
  const left = r.triesLeft === 1 ? "1 try" : `${r.triesLeft} tries`;
  throw new MpinError(403, `That MPIN isn't right. ${left} left before ${enforced ? "money moves are" : "it's"} locked.`, "mpin_wrong", {
    triesLeft: r.triesLeft,
  });
}

/**
 * What GET /me reports: whether a 6-digit MPIN is still to be chosen, the unlock time while money moves are
 * locked, and whether the MPIN is enforced (MPIN_ENFORCED). The phone copies a typed MPIN into its unlock PIN
 * only when `enforced` is true, since in rollback mode a money move may go through with a wrong PIN.
 */
export function mpinStatus(user: Pick<User, "id">, now = Date.now()): { upgradeDue: boolean; lockedUntil: number | null; enforced: boolean } {
  const enforced = mpinEnforced();
  return { upgradeDue: upgradeDue(user.id), lockedUntil: enforced ? activeLock(user.id, now) : null, enforced };
}
