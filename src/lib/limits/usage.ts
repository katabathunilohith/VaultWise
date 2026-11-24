import { all, get } from "../db";
import { fmtMoney } from "../shared";
import { HttpError, type User } from "../users";
import { dayStart, monthStart } from "./period";
import { getLimits, type ChangeRow } from "./store";

/** The counters the rules check: money withdrawn today, raises used this month, emergency requests this month. */

/** Proof-verified withdrawals requested today that still count (not declined, cancelled or expired). */
export function withdrawnToday(user: User, now = Date.now()) {
  return (
    get<{ s: number }>(
      "SELECT COALESCE(SUM(amount), 0) AS s FROM withdrawals WHERE user_id = ? AND created_at >= ? AND status NOT IN ('denied', 'cancelled', 'expired')",
      user.id,
      dayStart(now),
    )?.s ?? 0
  );
}

/** Throws a friendly error if a new withdrawal would break a personal limit. */
export function assertWithinWithdrawalLimits(user: User, amount: number, now = Date.now()) {
  const l = getLimits(user);
  const cur = user.currency;
  if (amount > l.singleWithdrawal) {
    throw new HttpError(
      400,
      `That's above your single-withdrawal limit of ${fmtMoney(l.singleWithdrawal, cur)}. You can review your limits in Settings.`,
    );
  }
  const today = withdrawnToday(user, now);
  if (today + amount > l.dailyWithdrawal) {
    throw new HttpError(
      400,
      `That would take today's withdrawals past your daily limit of ${fmtMoney(l.dailyWithdrawal, cur)} (${fmtMoney(Math.max(0, l.dailyWithdrawal - today), cur)} left today).`,
    );
  }
}

/** Raises this calendar month that use the monthly allowance (a later change may have superseded them). */
export function standardChangesThisMonth(user: User, now: number) {
  return all<ChangeRow>(
    "SELECT * FROM limit_changes WHERE user_id = ? AND kind = 'standard' AND status IN ('applied', 'superseded') AND created_at >= ? ORDER BY created_at",
    user.id,
    monthStart(now),
  );
}

/** Emergency limit requests this calendar month, whatever their outcome. */
export function emergencyRequestsThisMonth(user: User, now: number) {
  return get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM limit_changes WHERE user_id = ? AND kind = 'emergency' AND created_at >= ?",
    user.id,
    monthStart(now),
  )!.n;
}
