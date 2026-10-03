import { handle, json } from "@/lib/api";
import { all, get, parseJson } from "@/lib/db";
import { verifyAuditChain } from "@/lib/audit";
import { reconcile } from "@/lib/ledger";
import { listFlags } from "@/lib/fraud";
import { rulesFor } from "@/lib/compliance";
import { pendingLimitReviews } from "@/lib/limits";

/** Operations console: review queue, risk flags, model metrics, ledger and audit integrity. */
export const GET = handle(async () => {
  const queue = all<{
    proof_id: string;
    confidence: number | null;
    decision: string | null;
    final_decision: string | null;
    reasons: string | null;
    queued_at: number | null;
    appeal_note: string | null;
    category: string;
    purpose: string;
    user_name: string;
    jurisdiction: string;
    currency: string;
    vault_name: string | null;
    amount: number | null;
    payee: string | null;
    emergency_amount: number | null;
  }>(
    `SELECT v.proof_id, v.confidence, v.decision, v.final_decision, v.reasons, v.queued_at, v.appeal_note,
            p.category, p.purpose, u.name AS user_name, u.jurisdiction, u.currency,
            vt.name AS vault_name, w.amount, w.payee, er.amount AS emergency_amount
     FROM verifications v
     JOIN proofs p ON p.id = v.proof_id
     JOIN users u ON u.id = p.user_id
     LEFT JOIN vaults vt ON vt.id = p.vault_id
     LEFT JOIN withdrawals w ON w.id = p.withdrawal_id
     LEFT JOIN emergency_requests er ON er.id = p.emergency_id
     WHERE (v.decision = 'human_review' AND v.final_decision IS NULL) OR v.final_decision = 'appealed'
     ORDER BY v.queued_at ASC`,
  ).map((q) => {
    const sla = rulesFor(q.jurisdiction).verification.reviewSlaHours;
    return {
      ...q,
      reasons: parseJson<string[]>(q.reasons, []),
      slaDueAt: (q.queued_at ?? Date.now()) + sla * 3_600_000,
      amount: q.amount ?? q.emergency_amount,
    };
  });

  const counts = all<{ decision: string; n: number }>(
    "SELECT decision, COUNT(*) AS n FROM verifications WHERE status != 'processing' GROUP BY decision",
  );
  const by = Object.fromEntries(counts.map((c) => [c.decision, c.n]));
  const total = counts.reduce((s, c) => s + c.n, 0);
  const reviewed = all<{
    confidence: number;
    final_decision: string;
    queued_at: number;
    decided_at: number;
    decision: string;
    appeal_note: string | null;
  }>("SELECT confidence, final_decision, queued_at, decided_at, decision, appeal_note FROM verifications WHERE reviewer IS NOT NULL");
  const humanOnly = reviewed.filter((r) => r.decision === "human_review");
  const agree = humanOnly.filter((r) => (r.confidence >= 0.6 ? "approved" : "denied") === r.final_decision).length;
  const appeals = reviewed.filter((r) => r.decision === "auto_denied");
  const overturned = appeals.filter((r) => r.final_decision === "approved").length;
  const slaOk = reviewed.filter((r) => r.decided_at - r.queued_at <= 4 * 3_600_000).length;
  const avg = get<{ a: number | null }>("SELECT AVG(duration_ms) AS a FROM verifications WHERE duration_ms IS NOT NULL")?.a ?? null;
  const daily = all<{ day: string; decision: string; n: number }>(
    `SELECT date(created_at / 1000, 'unixepoch') AS day, decision, COUNT(*) AS n FROM verifications
     WHERE created_at > ? AND decision IS NOT NULL GROUP BY day, decision ORDER BY day`,
    Date.now() - 30 * 86_400_000,
  );

  const strategies = all<{ id: string; name: string; stage: string; last_backtest: string | null }>(
    "SELECT id, name, stage, last_backtest FROM strategies ORDER BY id",
  ).map((s) => ({
    ...s,
    last_backtest: parseJson(s.last_backtest, null),
  }));

  return json({
    queue,
    limitRequests: pendingLimitReviews(),
    flags: listFlags(),
    metrics: {
      total,
      autoApproved: by.auto_approved ?? 0,
      autoDenied: by.auto_denied ?? 0,
      humanReview: by.human_review ?? 0,
      automationRate: total ? ((by.auto_approved ?? 0) + (by.auto_denied ?? 0)) / total : 0,
      reviewerAgreement: humanOnly.length ? agree / humanOnly.length : null,
      reviewedCount: humanOnly.length,
      appeals: appeals.length,
      overturned,
      falseDeclineRate: by.auto_denied ? overturned / by.auto_denied : 0,
      slaCompliance: reviewed.length ? slaOk / reviewed.length : null,
      avgPipelineMs: avg,
      daily,
    },
    reconciliation: reconcile(),
    auditChain: verifyAuditChain(),
    strategies,
  });
});
