import { all, get } from "../db";
import { nextRun, type VaultRow } from "../vaults";
import type { AutoSaveSource, WalletSettings } from "./store";
import { zonedDayStart, zonedNextDayStart } from "../timezones";

/**
 * The wallet's numbers: when payday is likely, what auto-saves will take from the wallet before
 * then, what has gone out today, and how much is safe to spend today.
 */

export const DAY_MS = 86_400_000;
/** Raising (or turning off) the daily limit is allowed once in this window. */
export const RAISE_WINDOW_MS = 30 * DAY_MS;
/** Gap assumed between paydays until there are two paydays to measure. */
export const DEFAULT_PAY_GAP_MS = 30 * DAY_MS;
/** How many recent paydays the gap is measured from. */
const PAYDAYS_MEASURED = 7;

/** Journal kinds that count toward the daily limit. */
export const LIMITED_KINDS = ["wallet_spend", "wallet_cash_out"] as const;

/** Local midnight, the same day boundary personal limits use. */
export function dayStart(ts: number) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function nextDayStart(ts: number) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** Whole calendar days from a's day to b's day (DST-safe). */
function daysBetween(a: number, b: number) {
  return Math.round((dayStart(b) - dayStart(a)) / DAY_MS);
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export interface Payday {
  /** Estimated time of the next income credit (ms). */
  nextPayday: number;
  /** Calendar days from today to payday, at least 1 (today counts). */
  daysToPayday: number;
  /** "income" when estimated from income credits, "default" when there were none to go on. */
  basis: "income" | "default";
  lastIncomeAt: number | null;
  gapMs: number;
}

/**
 * Payday = last income credit + the median gap between the last few incomes (30 days until there
 * are two). Credits on the same day count as one payday. A payday that has passed without income
 * rolls forward by whole gaps, which keeps the estimate on the careful side.
 */
export function paydayEstimate(userId: string, now = Date.now()): Payday {
  const times = all<{ t: number }>(
    "SELECT created_at AS t FROM journals WHERE user_id = ? AND kind = 'income' AND created_at <= ? ORDER BY created_at DESC LIMIT 60",
    userId,
    now,
  ).map((r) => r.t);
  // One entry per calendar day, newest first, keeping that day's first credit.
  const paydays: number[] = [];
  for (const t of times) {
    if (paydays.length && dayStart(paydays[paydays.length - 1]) === dayStart(t)) paydays[paydays.length - 1] = t;
    else if (paydays.length < PAYDAYS_MEASURED) paydays.push(t);
    else break;
  }
  const today = dayStart(now);
  if (!paydays.length) {
    const nextPayday = now + DEFAULT_PAY_GAP_MS;
    return { nextPayday, daysToPayday: Math.max(1, daysBetween(now, nextPayday)), basis: "default", lastIncomeAt: null, gapMs: DEFAULT_PAY_GAP_MS };
  }
  const gaps = paydays.slice(0, -1).map((t, i) => t - paydays[i + 1]);
  const gapMs = gaps.length ? Math.max(DAY_MS, median(gaps)) : DEFAULT_PAY_GAP_MS;
  const last = paydays[0];
  let next = last + gapMs;
  if (dayStart(next) < today) next += Math.floor((today - dayStart(next)) / gapMs) * gapMs;
  while (dayStart(next) < today) next += gapMs;
  return { nextPayday: next, daysToPayday: Math.max(1, daysBetween(now, next)), basis: "income", lastIncomeAt: last, gapMs };
}

/**
 * What fixed auto-saves will take from the wallet before `until`. Zero when auto-saves draw from
 * the bank. Runs already due count too: the scheduler takes them on the next tick.
 */
export function upcomingFromWallet(userId: string, source: AutoSaveSource, until: number) {
  if (source !== "wallet") return 0;
  const vaults = all<Pick<VaultRow, "rule_amount" | "rule_frequency" | "next_run_at">>(
    "SELECT rule_amount, rule_frequency, next_run_at FROM vaults WHERE user_id = ? AND rule_type = 'fixed' AND status = 'locked' AND next_run_at IS NOT NULL",
    userId,
  );
  let total = 0;
  for (const v of vaults) {
    let at = v.next_run_at!;
    let guard = 0;
    while (at < until && guard++ < 60) {
      total += v.rule_amount ?? 0;
      at = nextRun(at, v.rule_frequency);
    }
  }
  return total;
}

/**
 * Spends and cash-outs from the wallet on the calendar day of `now`. With `timeZone` (the customer's,
 * from timeZoneFor(user)) the day runs midnight to midnight there, so "resets at midnight" is their midnight.
 */
export function spentOn(walletAccountId: string, now = Date.now(), timeZone?: string) {
  const from = timeZone ? zonedDayStart(now, timeZone) : dayStart(now);
  const to = timeZone ? zonedNextDayStart(now, timeZone) : nextDayStart(now);
  return (
    get<{ s: number }>(
      `SELECT COALESCE(-SUM(e.amount), 0) AS s FROM ledger_entries e JOIN journals j ON j.id = e.journal_id
       WHERE e.account_id = ? AND e.amount < 0 AND j.kind IN (${LIMITED_KINDS.map(() => "?").join(",")})
         AND e.created_at >= ? AND e.created_at < ?`,
      walletAccountId,
      ...LIMITED_KINDS,
      from,
      to,
    )?.s ?? 0
  );
}

export interface LimitState {
  dailyLimit: number | null;
  spentToday: number;
  /** What the limit still allows today; null with no limit. */
  limitLeftToday: number | null;
  limitRaiseAvailable: boolean;
  /** When raising or turning off is next allowed; null when it is allowed now. */
  nextRaiseAt: number | null;
}

export function limitState(settings: WalletSettings, spentToday: number, now = Date.now()): LimitState {
  const raiseAvailable = settings.limitRaisedAt === null || now - settings.limitRaisedAt >= RAISE_WINDOW_MS;
  return {
    dailyLimit: settings.dailyLimit,
    spentToday,
    limitLeftToday: settings.dailyLimit === null ? null : Math.max(0, settings.dailyLimit - spentToday),
    limitRaiseAvailable: raiseAvailable,
    nextRaiseAt: raiseAvailable ? null : settings.limitRaisedAt! + RAISE_WINDOW_MS,
  };
}

/**
 * Safe to spend today = max(0, balance − auto-saves due from the wallet before payday) ÷ days to
 * payday, capped by what is left of the daily limit when one is set. Rounded down to a minor unit.
 */
export function safeToSpend(input: { balance: number; upcoming: number; daysToPayday: number; limitLeftToday: number | null }) {
  const perDay = Math.floor(Math.max(0, input.balance - input.upcoming) / Math.max(1, input.daysToPayday));
  return input.limitLeftToday === null ? perDay : Math.min(perDay, input.limitLeftToday);
}
