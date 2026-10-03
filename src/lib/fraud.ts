import { all, get, newId, run } from "./db";
import { audit } from "./audit";

export interface FraudFlag {
  id: string;
  user_id: string | null;
  source: string;
  ref_id: string | null;
  severity: "low" | "medium" | "high";
  score: number;
  description: string;
  status: "open" | "resolved" | "dismissed";
  resolution: string | null;
  created_at: number;
  resolved_at: number | null;
}

export function raiseFlag(f: {
  userId: string | null;
  source: string;
  refId?: string;
  severity: FraudFlag["severity"];
  score: number;
  description: string;
}) {
  const id = newId("flg");
  run(
    `INSERT INTO fraud_flags (id, user_id, source, ref_id, severity, score, description, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    id,
    f.userId,
    f.source,
    f.refId ?? null,
    f.severity,
    f.score,
    f.description,
    Date.now(),
  );
  audit({
    userId: f.userId,
    actor: "risk-engine",
    actorType: "system",
    action: "fraud.flag_raised",
    entityType: f.source,
    entityId: f.refId,
    details: { severity: f.severity, score: f.score, description: f.description },
  });
  return id;
}

export function listFlags(status?: string) {
  return status
    ? all<FraudFlag>("SELECT * FROM fraud_flags WHERE status = ? ORDER BY created_at DESC", status)
    : all<FraudFlag>("SELECT * FROM fraud_flags ORDER BY created_at DESC LIMIT 200");
}

export function resolveFlag(id: string, status: "resolved" | "dismissed", resolution: string, reviewer: string) {
  run("UPDATE fraud_flags SET status = ?, resolution = ?, resolved_at = ? WHERE id = ?", status, resolution, Date.now(), id);
  audit({ actor: reviewer, actorType: "reviewer", action: `fraud.flag_${status}`, entityType: "fraud_flag", entityId: id, details: { resolution } });
}

/**
 * Velocity/anomaly score for an emergency request (0–100). Feature weights are
 * hand-set for the prototype; production would fit them on labelled outcomes.
 */
export function emergencyRiskScore(userId: string, amount: number, now = Date.now()) {
  const day = 86_400_000;
  const recent30 = get<{ n: number; s: number }>(
    "SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS s FROM emergency_requests WHERE user_id = ? AND status != 'blocked' AND created_at > ?",
    userId,
    now - 30 * day,
  )!;
  const recent3 = get<{ n: number }>("SELECT COUNT(*) AS n FROM emergency_requests WHERE user_id = ? AND created_at > ?", userId, now - 3 * day)!.n;
  const avgDeposit =
    get<{ a: number }>(
      `SELECT COALESCE(AVG(e.amount), 0) AS a FROM ledger_entries e
       JOIN accounts acc ON acc.id = e.account_id
       WHERE acc.user_id = ? AND acc.kind = 'vault' AND e.amount > 0`,
      userId,
    )?.a ?? 0;
  const user = get<{ created_at: number }>("SELECT created_at FROM users WHERE id = ?", userId);
  const tenureDays = user ? (now - user.created_at) / day : 0;
  const overdueReceipts = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM emergency_requests WHERE user_id = ? AND receipt_status IN ('requested', 'rejected') AND receipt_due_at < ?",
    userId,
    now,
  )!.n;
  const openFlags = get<{ n: number }>("SELECT COUNT(*) AS n FROM fraud_flags WHERE user_id = ? AND status = 'open'", userId)!.n;

  const features = [
    { name: "Requests in last 30 days", value: recent30.n, points: Math.min(30, recent30.n * 10) },
    { name: "Requests in last 72 hours", value: recent3, points: Math.min(25, recent3 * 12) },
    {
      name: "Amount vs typical contribution",
      value: avgDeposit ? Number((amount / avgDeposit).toFixed(1)) : null,
      points: avgDeposit ? Math.min(15, Math.max(0, Math.log2(amount / avgDeposit) * 3)) : 5,
    },
    { name: "Account tenure (days)", value: Math.round(tenureDays), points: tenureDays < 14 ? 15 : tenureDays < 60 ? 6 : 0 },
    { name: "Overdue or rejected receipts", value: overdueReceipts, points: Math.min(25, overdueReceipts * 15) },
    { name: "Open risk flags", value: openFlags, points: Math.min(15, openFlags * 5) },
  ];
  const score = Math.round(
    Math.min(
      100,
      features.reduce((s, f) => s + f.points, 0),
    ),
  );
  return { score, features: features.map((f) => ({ ...f, points: Math.round(f.points) })) };
}
