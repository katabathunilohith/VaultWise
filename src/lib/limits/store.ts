import { get, run } from "../db";
import { rulesFor } from "../compliance";
import type { User } from "../users";
import { LIMIT_KEYS, limitBounds, type Limits } from "./bounds";

/**
 * Storage: `user_limits` (one row per customer, created on the first change) and the row shape of
 * `limit_changes` (every standard change and emergency request). Both tables are created in db.ts.
 */

interface LimitRow {
  single_withdrawal: number;
  daily_withdrawal: number;
  monthly_emergency: number;
}

export interface ChangeRow {
  id: string;
  user_id: string;
  kind: "tighten" | "standard" | "emergency";
  status: "applied" | "in_review" | "denied" | "reverted" | "superseded";
  before_limits: string;
  after_limits: string;
  reason_code: string | null;
  explanation: string | null;
  assessment: string | null;
  model: string | null;
  reviewer: string | null;
  reviewer_note: string | null;
  expires_at: number | null;
  created_at: number;
  decided_at: number | null;
}

export function getLimits(user: User): Limits {
  const bounds = limitBounds(rulesFor(user.jurisdiction));
  const row = get<LimitRow>("SELECT * FROM user_limits WHERE user_id = ?", user.id);
  const raw: Limits = row
    ? { singleWithdrawal: row.single_withdrawal, dailyWithdrawal: row.daily_withdrawal, monthlyEmergency: row.monthly_emergency }
    : {
        singleWithdrawal: bounds.singleWithdrawal.default,
        dailyWithdrawal: bounds.dailyWithdrawal.default,
        monthlyEmergency: bounds.monthlyEmergency.default,
      };
  // Market maximums always win (e.g. if a regulator lowers a cap).
  return Object.fromEntries(LIMIT_KEYS.map((k) => [k, Math.min(raw[k], bounds[k].max)])) as Limits;
}

export function saveLimits(user: User, l: Limits, now: number) {
  run(
    `INSERT INTO user_limits (user_id, single_withdrawal, daily_withdrawal, monthly_emergency, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET single_withdrawal = excluded.single_withdrawal, daily_withdrawal = excluded.daily_withdrawal,
       monthly_emergency = excluded.monthly_emergency, updated_at = excluded.updated_at`,
    user.id,
    l.singleWithdrawal,
    l.dailyWithdrawal,
    l.monthlyEmergency,
    now,
  );
}

/** The emergency cap actually applied: the stricter of the market cap and the personal limit. */
export function effectiveEmergencyCap(user: User) {
  return Math.min(rulesFor(user.jurisdiction).emergency.monthlyCap, getLimits(user).monthlyEmergency);
}
