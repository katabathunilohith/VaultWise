import type { Check, Extraction, VerificationRow } from "../types";
import { clamp, type HardFail, type PipelineContext } from "./context";
import type { RuleScores } from "./rules";
import type { TamperAssessment } from "./tamper";

export const CONFIDENCE_WEIGHTS = { extraction: 0.15, purpose: 0.35, amount: 0.15, date: 0.1, name: 0.05, integrity: 0.2 };

export interface DecisionInput {
  /** What was read, or null when nothing read the bill. */
  extraction: Pick<Extraction, "document_type"> | null;
  aiAllowed: boolean;
  /** The extract stage's score (fields found, legibility). */
  extractionScore: number | undefined;
  scores: RuleScores;
  tamper: Pick<TamperAssessment, "score" | "scoreWithoutEla" | "elaOnly">;
  hardFails: HardFail[];
  reviewReasons: string[];
  /** The custom template with no borrowed one: a person always approves. */
  strictest: boolean;
  checks: { extract: Check[]; classify: Check[]; tamper: Check[] };
  autoApprove: number;
  autoDeny: number;
}

/**
 * Weighted confidence, then the routing rules, in order:
 * 1. a hard fail → decline (a forensic one only with AI consent: a customer who asked for a person goes to one);
 * 2–3. nothing read the bill → a person;
 * 4. confident, untampered, fully covered and no failed check → approve;
 * 5. low confidence → decline, unless it is only low because of uncorroborated ELA;
 * 6. otherwise a person.
 */
export function decide(input: DecisionInput): { decision: VerificationRow["decision"]; confidence: number; reasons: string[] } {
  const x = input.extraction;
  const { matchScore, amountScore, dateScore, nameScore } = input.scores;
  const { tamper, strictest, checks } = input;
  const tamperScore = tamper.score;
  const extractionQ = x ? (input.extractionScore ?? 0.5) : 0.3;
  const confidenceAt = (t: number) => {
    const integrity = 1 - t;
    let c = 0.15 * extractionQ + 0.35 * matchScore + 0.15 * amountScore + 0.1 * dateScore + 0.05 * nameScore + 0.2 * integrity;
    if (!x) c = Math.min(c, 0.6);
    return clamp(c);
  };
  const confidence = confidenceAt(tamperScore);
  // Image evidence of editing never declines someone who asked for a person; the rest (duplicates, purpose...) does.
  const hardFails = input.aiAllowed ? input.hardFails : input.hardFails.filter((h) => !h.forensic);

  // Automation only approves clean cases: any failed check sends it to a person.
  const anyFailedCheck = [checks.extract, checks.classify, checks.tamper].some((list) => list.some((c) => c.status === "fail"));
  let decision: VerificationRow["decision"];
  const reasons: string[] = [];
  if (hardFails.length) {
    decision = "auto_denied";
    reasons.push(...hardFails.map((h) => h.reason));
  } else if (!x && !input.aiAllowed) {
    decision = "human_review";
    reasons.push("You asked for a person to read this instead of the AI, so a person will check it", ...input.reviewReasons);
  } else if (!x) {
    decision = "human_review";
    const why = checks.extract.find((c) => c.label === "Vision model")?.detail;
    reasons.push(`Automated reading wasn't possible${why ? ` (${why.slice(0, 100)})` : ""}, so a person will check this`, ...input.reviewReasons);
  } else if (confidence >= input.autoApprove && tamperScore < 0.3 && amountScore >= 1 && !anyFailedCheck && !strictest) {
    decision = "auto_approved";
    reasons.push(`High confidence (${(confidence * 100).toFixed(0)}%) that this ${x.document_type.replace(/_/g, " ")} supports the withdrawal`);
  } else if (confidence <= input.autoDeny && !(tamper.elaOnly && confidenceAt(tamper.scoreWithoutEla) > input.autoDeny)) {
    decision = "auto_denied";
    reasons.push(`Low confidence (${(confidence * 100).toFixed(0)}%) that the document supports this purpose`);
  } else {
    decision = "human_review";
    for (const list of [checks.classify, checks.tamper, checks.extract])
      for (const c of list) if (c.status === "fail" || c.status === "warn") reasons.push(`${c.label}: ${c.detail}`);
    if (strictest) reasons.unshift("Custom vaults without a verification template are always confirmed by a person");
    if (!reasons.length) reasons.push(`Confidence ${(confidence * 100).toFixed(0)}% is between the auto-deny and auto-approve thresholds`);
  }
  return { decision, confidence, reasons };
}

/** Stage 6 — Decision: decides, then shows the confidence and the route on the stage. */
export function runDecision(ctx: PipelineContext, x: Extraction | null, scores: RuleScores, tamper: TamperAssessment) {
  const { rules } = ctx;
  const dec = ctx.begin("decision");
  // Custom vaults without a borrowed template are the strictest tier: a person always confirms.
  const strictest = ctx.template === "custom";
  const approveAt = rules.verification.autoApprove;
  const { decision, confidence, reasons } = decide({
    extraction: x,
    aiAllowed: !!ctx.proof.ai_allowed,
    extractionScore: ctx.stage("extract").score,
    scores,
    tamper,
    hardFails: ctx.hardFails,
    reviewReasons: ctx.reviewReasons,
    strictest,
    checks: { extract: ctx.stage("extract").checks, classify: ctx.stage("classify").checks, tamper: ctx.stage("tamper").checks },
    autoApprove: approveAt,
    autoDeny: rules.verification.autoDeny,
  });

  dec.checks.push({
    label: "Confidence",
    status: decision === "auto_approved" ? "pass" : decision === "auto_denied" ? "fail" : "warn",
    detail: strictest
      ? `${(confidence * 100).toFixed(0)}% · custom vault — approval always by a person, deny ≤ ${(rules.verification.autoDeny * 100).toFixed(0)}%`
      : `${(confidence * 100).toFixed(0)}% · approve ≥ ${(approveAt * 100).toFixed(0)}%, deny ≤ ${(rules.verification.autoDeny * 100).toFixed(0)}%`,
  });
  dec.checks.push({
    label: "Route",
    status: "info",
    detail:
      decision === "auto_approved"
        ? "Approved automatically — funds released"
        : decision === "auto_denied"
          ? "Declined automatically — the user can appeal to a person"
          : `Queued for a human reviewer (SLA ${rules.verification.reviewSlaHours} business hours)`,
  });
  dec.score = confidence;
  dec.data = { weights: CONFIDENCE_WEIGHTS };
  dec.status = decision === "auto_approved" ? "passed" : decision === "auto_denied" ? "failed" : "warning";
  ctx.finish(dec);
  return { decision, confidence, reasons };
}
