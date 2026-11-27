import { all, get, run, tx } from "./db";
import { calendarDaysBetween, type PayoutHistory, type PayoutPlanInput, type SavedPayoutPlan } from "./payout-planner";
import { timeZoneFor } from "./timezones";
import { HttpError, type User } from "./users";

interface PlanRow {
  id: string;
  input_json: string;
  is_example: number;
  currency: string;
  created_at: number;
  actual_date: string | null;
  actual_amount: number | null;
  checked_at: number | null;
}

function asPlan(row: PlanRow): SavedPayoutPlan {
  const input: PayoutPlanInput = JSON.parse(row.input_json);
  const actual =
    row.actual_date !== null && row.actual_amount !== null && row.checked_at !== null
      ? {
          date: row.actual_date,
          amount: row.actual_amount,
          recordedAt: row.checked_at,
          daysDifference: calendarDaysBetween(input.expectedPayoutDate, row.actual_date),
          amountDifference: row.actual_amount - input.expectedPayoutAmount,
        }
      : null;
  return { id: row.id, input, isExample: Boolean(row.is_example), currency: row.currency, createdAt: row.created_at, actual };
}

export function listPayoutPlans(userId: string, limit: number = 30) {
  return all<PlanRow>("SELECT * FROM payout_plans WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?", userId, limit).map(asPlan);
}

export function recentPayoutHistory(user: User, asOfDate?: string): PayoutHistory {
  const now = Date.now();
  const localDate = new Intl.DateTimeFormat("sv-SE", { timeZone: timeZoneFor(user) });
  const today = localDate.format(now);
  const historicalStart = asOfDate && asOfDate < today ? asOfDate : null;
  const rows = all<{ expected: string; actual_date: string; created_at: number; checked_at: number }>(
    `SELECT json_extract(input_json, '$.expectedPayoutDate') AS expected, actual_date, created_at, checked_at
     FROM payout_plans WHERE user_id = ? AND currency = ? AND is_example = 0
     AND actual_date <= ? AND checked_at <= ? AND actual_amount IS NOT NULL
     ORDER BY created_at, id`,
    user.id,
    user.currency,
    historicalStart ?? today,
    now,
  );
  const paydays = new Map<string, string>();
  for (const row of rows) {
    const savedDay = localDate.format(row.created_at);
    // For past plan dates only use check-ins already known when that day began.
    if (historicalStart && localDate.format(row.checked_at) >= historicalStart) continue;
    if (savedDay >= row.expected || savedDay > row.actual_date) continue;
    // The earliest eligible saved scenario owns this payday, so trying several budgets never adds observations.
    if (!paydays.has(row.expected)) paydays.set(row.expected, row.actual_date);
  }
  const recent = [...paydays.entries()]
    .sort(([expectedA, actualA], [expectedB, actualB]) => actualB.localeCompare(actualA) || expectedB.localeCompare(expectedA))
    .slice(0, 6);
  const lateDays = recent.map(([expected, actual]) => calendarDaysBetween(expected, actual)).filter((days) => days > 0);
  return { sampleCount: recent.length, lateCount: lateDays.length, maxLateDays: Math.max(0, ...lateDays) };
}

function findPlan(userId: string, id: string) {
  return get<PlanRow>("SELECT * FROM payout_plans WHERE user_id = ? AND id = ?", userId, id);
}

export function savePayoutPlan(user: User, id: string, input: PayoutPlanInput, isExample: boolean): SavedPayoutPlan {
  const payload = JSON.stringify(input);
  return tx(() => {
    // Retries with the same id can safely arrive from multiple tabs/workers.
    run(
      `INSERT INTO payout_plans (user_id, id, currency, input_json, is_example, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, id) DO NOTHING`,
      user.id,
      id,
      user.currency,
      payload,
      Number(isExample),
      Date.now(),
    );
    const row = findPlan(user.id, id)!;
    if (row.input_json !== payload || Boolean(row.is_example) !== isExample)
      throw new HttpError(409, "This save already belongs to a different plan. Save a new plan for these figures.");
    return asPlan(row);
  });
}

export function checkInPayout(user: User, id: string, date: string, amount: number): SavedPayoutPlan {
  return tx(() => {
    const row = findPlan(user.id, id);
    if (!row) throw new HttpError(404, "Payout plan could not be found.");
    const plan = asPlan(row);
    if (plan.actual) {
      if (plan.actual.date === date && plan.actual.amount === amount) return plan;
      throw new HttpError(409, "This plan already has a recorded payout. Refresh to see the saved outcome.");
    }
    const now = Date.now();
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: timeZoneFor(user) }).format(now);
    if (date < plan.input.asOfDate || date > today) throw new HttpError(400, "Choose an actual payout date between the plan start and today.");
    run("UPDATE payout_plans SET actual_date = ?, actual_amount = ?, checked_at = ? WHERE user_id = ? AND id = ?", date, amount, now, user.id, id);
    return asPlan({ ...row, actual_date: date, actual_amount: amount, checked_at: now });
  });
}
