import { run, tx } from "../db";
import { audit } from "../audit";
import { raiseFlag } from "../fraud";
import { VISION_MODEL } from "../groq";
import type { User } from "../users";
import { payoutWithdrawal } from "../vaults";
import type { PipelineContext } from "./stages/context";
import { PIPELINE_VERSION, type ProofRow, type Stage, type VerificationRow } from "./types";

/** Saves the stage list so the phone and web can watch a check live. */
export function saveStages(proofId: string, stages: Stage[]) {
  run("UPDATE verifications SET stages = ? WHERE proof_id = ?", JSON.stringify(stages), proofId);
}

/** Moves the withdrawal or emergency receipt on: paid out, declined, or waiting for a person. */
export function applyOutcome(
  user: User,
  proof: ProofRow,
  outcome: "approved" | "denied" | "review",
  actor: string,
  actorType: "model" | "reviewer",
) {
  if (proof.withdrawal_id) {
    if (outcome === "approved") payoutWithdrawal(user, proof.withdrawal_id, actor, actorType);
    else if (outcome === "denied") run("UPDATE withdrawals SET status = 'denied', decided_at = ? WHERE id = ?", Date.now(), proof.withdrawal_id);
    else run("UPDATE withdrawals SET status = 'in_review' WHERE id = ?", proof.withdrawal_id);
  }
  if (proof.emergency_id) {
    const status = outcome === "approved" ? "verified" : outcome === "denied" ? "rejected" : "in_review";
    run("UPDATE emergency_requests SET receipt_status = ? WHERE id = ?", status, proof.emergency_id);
    if (outcome === "denied") {
      raiseFlag({
        userId: user.id,
        source: "emergency",
        refId: proof.emergency_id,
        severity: "medium",
        score: 65,
        description: "Post-hoc emergency receipt was rejected",
      });
    }
  }
}

/** One transaction: the decision, its audit entry, every fraud flag, and the payout / decline / hold. */
export function recordOutcome(
  ctx: PipelineContext,
  outcome: { decision: VerificationRow["decision"]; confidence: number; reasons: string[]; tamperScore: number },
) {
  const { user, proof } = ctx;
  const { decision, confidence, reasons, tamperScore } = outcome;
  tx(() => {
    const now = Date.now();
    run(
      `UPDATE verifications SET status = 'complete', confidence = ?, decision = ?, final_decision = ?, reasons = ?,
       queued_at = ?, decided_at = ?, duration_ms = ? WHERE proof_id = ?`,
      confidence,
      decision,
      decision === "auto_approved" ? "approved" : decision === "auto_denied" ? "denied" : null,
      JSON.stringify(reasons),
      decision === "human_review" ? now : null,
      decision === "human_review" ? null : now,
      now - ctx.startedAt,
      proof.id,
    );
    audit({
      userId: user.id,
      actor: PIPELINE_VERSION,
      actorType: "model",
      action: `verification.${decision}`,
      entityType: "proof",
      entityId: proof.id,
      details: {
        confidence: Number(confidence.toFixed(4)),
        reasons,
        model: `${PIPELINE_VERSION} · ${VISION_MODEL}`,
        tamperScore: Number(tamperScore.toFixed(3)),
      },
    });
    for (const f of ctx.flags) {
      raiseFlag({
        userId: user.id,
        source: "proof_verification",
        refId: proof.id,
        severity: f.severity,
        score: f.severity === "high" ? 85 : f.severity === "medium" ? 60 : 35,
        description: f.text,
      });
    }
    applyOutcome(
      user,
      proof,
      decision === "auto_approved" ? "approved" : decision === "auto_denied" ? "denied" : "review",
      PIPELINE_VERSION,
      "model",
    );
  });
}

/** Anything thrown mid-run: the check is marked as an error and handed to a person. */
export function recordError(ctx: PipelineContext, e: unknown) {
  const { user, proof, stages } = ctx;
  const msg = (e as Error).message;
  console.error("[verify] pipeline", e);
  for (const s of stages) if (s.status === "running" || s.status === "pending") s.status = s.status === "running" ? "failed" : "skipped";
  run(
    "UPDATE verifications SET status = 'error', stages = ?, decision = 'human_review', queued_at = ?, reasons = ? WHERE proof_id = ?",
    JSON.stringify(stages),
    Date.now(),
    JSON.stringify(["Something went wrong while checking this document, so a person will review it"]),
    proof.id,
  );
  applyOutcome(user, proof, "review", PIPELINE_VERSION, "model");
  audit({
    userId: user.id,
    actor: PIPELINE_VERSION,
    actorType: "model",
    action: "verification.error",
    entityType: "proof",
    entityId: proof.id,
    details: { error: msg },
  });
}
