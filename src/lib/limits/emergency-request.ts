import { newId, run, tx } from "../db";
import { audit } from "../audit";
import { rulesFor } from "../compliance";
import { raiseFlag } from "../fraud";
import { HttpError, type User } from "../users";
import { EMERGENCY_REASONS } from "../shared";
import { alertLimitLoosened } from "../alerts"; // alerts
import { diff, validate, type Limits } from "./bounds";
import { accountFacts, assessWithModel } from "./assess";
import { decideLimitRequest, type LimitAssessment, type StoredAssessment } from "./policy";
import { screenText, type TextScreen } from "./screen";
import { planIncrease } from "./increase";
import { getLimits, saveLimits } from "./store";
import { emergencyRequestsThisMonth } from "./usage";

/**
 * Emergency exception: a raise outside the monthly allowance. The text is screened, the model scores
 * it (assess.ts), the pure policy decides (policy.ts), uncertain cases go to a person (review.ts), and
 * an approved increase lasts `emergencyIncreaseDays` (expiry.ts).
 */
export async function requestEmergencyLimitChange(
  user: User,
  input: { limits: Partial<Limits>; reasonCode: string; explanation: string; document?: { buffer: Buffer; mime: string } | null },
  now = Date.now(),
) {
  validate(user, input.limits);
  const rules = rulesFor(user.jurisdiction);
  if (!EMERGENCY_REASONS[input.reasonCode]) throw new HttpError(400, "Choose a reason");
  const explanation = input.explanation.trim();
  if (explanation.length < 20) throw new HttpError(400, "Please describe the emergency in a sentence or two (20+ characters)");
  const before = getLimits(user);
  const after = { ...before, ...input.limits };
  const d = diff(before, after);
  if (!d.loosened.length) throw new HttpError(400, "Lowering a limit doesn't need an emergency request — just save it.");
  const tooMany = () =>
    new HttpError(429, `You've used this month's ${rules.limits.emergencyRequestsPerMonth} emergency limit requests. Please contact support.`);
  if (emergencyRequestsThisMonth(user, now) >= rules.limits.emergencyRequestsPerMonth) throw tooMany();

  const unit = Math.max(100, Math.round(rules.limits.singleWithdrawal.default / 100));
  const ratio = Math.max(...d.loosened.map((k) => after[k] / Math.max(before[k], unit)));
  const screen = screenText(explanation);
  const facts = accountFacts(user, rules, now);
  const { ai, aiError, model } = await assessWithModel({
    market: rules.name,
    currency: user.currency,
    reason: EMERGENCY_REASONS[input.reasonCode],
    before,
    after,
    loosened: d.loosened,
    unit,
    explanation,
    facts,
    document: input.document,
  });

  const verdict = decideLimitRequest(ai, { ratio, maxRatio: rules.limits.maxEmergencyIncreaseRatio, screen, hasDocument: !!input.document });
  const stored: StoredAssessment = { ai, aiError, screen, ratio, ...verdict };
  const expiresAt = verdict.decision === "approved" ? now + rules.limits.emergencyIncreaseDays * 86_400_000 : null;

  return tx(() => {
    // Checked again here: requests that passed the first check together while the model was asked can't all be recorded.
    if (emergencyRequestsThisMonth(user, now) >= rules.limits.emergencyRequestsPerMonth) throw tooMany();
    // An approval applies on top of the limits as they are now, which may have changed during the AI call.
    const plan = verdict.decision === "approved" ? planIncrease(user, before, after) : null;
    const rowBefore = plan?.before ?? before;
    const rowAfter = plan?.after ?? after;
    const id = newId("lim");
    run(
      `INSERT INTO limit_changes (id, user_id, kind, status, before_limits, after_limits, reason_code, explanation, assessment, model, expires_at, created_at, decided_at)
       VALUES (?, ?, 'emergency', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      user.id,
      verdict.decision === "approved" ? "applied" : verdict.decision === "denied" ? "denied" : "in_review",
      JSON.stringify(rowBefore),
      JSON.stringify(rowAfter),
      input.reasonCode,
      explanation,
      JSON.stringify(stored),
      model,
      expiresAt,
      now,
      verdict.decision === "in_review" ? null : now,
    );
    if (plan) saveLimits(user, plan.limits, now);
    if (verdict.decision === "approved") alertLimitLoosened(user.id, "Your emergency request to raise a limit was approved."); // alerts
    audit({
      userId: user.id,
      actor: model ?? "limits-policy",
      actorType: model ? "model" : "system",
      action: `limits.emergency_${verdict.decision}`,
      entityType: "limit_change",
      entityId: id,
      details: { before: rowBefore, after: rowAfter, ratio: Number(ratio.toFixed(2)), scores: ai, screen, reasons: verdict.reasons, expiresAt },
      ts: now,
    });
    flagRisk(user.id, id, verdict, screen, ai);
    return {
      id,
      decision: verdict.decision,
      reasons: verdict.reasons,
      message: ai?.user_message || null,
      expiresAt,
      limits: plan ? plan.limits : before,
    };
  });
}

/** Raises at most one fraud flag for a scam-like or manipulative request. */
function flagRisk(
  userId: string,
  id: string,
  verdict: ReturnType<typeof decideLimitRequest>,
  screen: TextScreen,
  ai: LimitAssessment | null,
) {
  if (verdict.decision === "denied" && verdict.scamRisk >= 0.6) {
    raiseFlag({
      userId,
      source: "limits",
      refId: id,
      severity: "high",
      score: Math.round(verdict.scamRisk * 100),
      description: "Emergency limit request matches scam patterns",
    });
  } else if (screen.manipulation || ai?.manipulation) {
    raiseFlag({
      userId,
      source: "limits",
      refId: id,
      severity: "medium",
      score: 60,
      description: "Limit request text tried to instruct the AI assessor",
    });
  } else if (verdict.scamRisk >= 0.6) {
    raiseFlag({
      userId,
      source: "limits",
      refId: id,
      severity: "medium",
      score: Math.round(verdict.scamRisk * 100),
      description: "Emergency limit request has moderate scam risk",
    });
  }
}
