import { all, parseJson } from "../db";
import { rulesFor } from "../compliance";
import { EMERGENCY_REASONS } from "../shared";
import type { User } from "../users";
import { limitBounds, type Limits } from "./bounds";
import { nextMonthStart } from "./period";
import type { StoredAssessment } from "./policy";
import { getLimits, type ChangeRow } from "./store";
import { emergencyRequestsThisMonth, standardChangesThisMonth, withdrawnToday } from "./usage";

/** What the limits screen and the review queue read: a change row as JSON, and the whole overview. */

export function limitsOverview(user: User, now = Date.now()) {
  const rules = rulesFor(user.jurisdiction);
  const used = standardChangesThisMonth(user, now);
  const limits = getLimits(user);
  const today = withdrawnToday(user, now);
  return {
    currency: user.currency,
    limits,
    bounds: limitBounds(rules),
    usage: { withdrawnToday: today, dailyRemaining: Math.max(0, limits.dailyWithdrawal - today) },
    quota: {
      perMonth: rules.limits.loosenPerMonth,
      used: used.length,
      available: used.length < rules.limits.loosenPerMonth,
      lastUsedAt: used.at(-1)?.created_at ?? null,
      nextAvailableAt: used.length < rules.limits.loosenPerMonth ? now : nextMonthStart(now),
      resetsAt: nextMonthStart(now),
    },
    emergency: {
      perMonth: rules.limits.emergencyRequestsPerMonth,
      used: emergencyRequestsThisMonth(user, now),
      increaseDays: rules.limits.emergencyIncreaseDays,
      maxIncreaseRatio: rules.limits.maxEmergencyIncreaseRatio,
    },
    active: all<ChangeRow>(
      "SELECT * FROM limit_changes WHERE user_id = ? AND kind = 'emergency' AND status = 'applied' AND expires_at > ? ORDER BY expires_at",
      user.id,
      now,
    ).map(viewChange),
    history: all<ChangeRow>("SELECT * FROM limit_changes WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", user.id).map(viewChange),
  };
}

export function viewChange(r: ChangeRow) {
  const a = parseJson<StoredAssessment | null>(r.assessment, null);
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    before: parseJson<Limits>(r.before_limits, {} as Limits),
    after: parseJson<Limits>(r.after_limits, {} as Limits),
    reasonCode: r.reason_code,
    reason: r.reason_code ? (EMERGENCY_REASONS[r.reason_code] ?? r.reason_code) : null,
    explanation: r.explanation,
    assessment: a,
    model: r.model,
    reviewer: r.reviewer,
    reviewerNote: r.reviewer_note,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}
