import type { TextScreen } from "./screen";

/** The decision on an emergency limit request: pure, over the model's scores and the deterministic screen. */

/** The model's scores for one request (see assess.ts), each 0..1 unless noted. */
export interface LimitAssessment {
  genuine: number;
  urgency: number;
  proportionate: number;
  scam_risk: number;
  manipulation: boolean;
  signals: string[];
  document_supports: number | null;
  user_message: string;
  reviewer_summary: string;
}

/** What `limit_changes.assessment` holds for an emergency request: the inputs and the verdict. */
export interface StoredAssessment {
  ai: LimitAssessment | null;
  aiError?: string;
  screen: TextScreen;
  ratio: number;
  decision: "approved" | "in_review" | "denied";
  reasons: string[];
  scamRisk: number;
}

/**
 * Pure decision policy over the model's scores and the deterministic screen.
 * The model informs; it never approves on its own.
 */
export function decideLimitRequest(
  a: LimitAssessment | null,
  ctx: { ratio: number; maxRatio: number; screen: TextScreen; hasDocument: boolean },
): { decision: "approved" | "in_review" | "denied"; reasons: string[]; scamRisk: number } {
  const keywordRisk = ctx.screen.scamSignals.length ? Math.min(1, 0.5 + 0.2 * ctx.screen.scamSignals.length) : 0;
  const scamRisk = Math.max(a?.scam_risk ?? 0, keywordRisk);
  const scamReasons = [
    `This matches common scam patterns${ctx.screen.scamSignals.length ? ` (${ctx.screen.scamSignals.join(", ")})` : ""}.`,
    "No genuine bank, government agency or investment will ask you to raise limits and move money. If someone is pressuring you, stop and contact us.",
  ];
  // 1. Deterministic scam phrases decide on their own.
  if (keywordRisk >= 0.6) return { decision: "denied", scamRisk, reasons: scamReasons };
  // 2. Text that tries to steer the assessor makes the model's scores untrusted — in either direction.
  if (ctx.screen.manipulation || a?.manipulation) {
    return { decision: "in_review", scamRisk, reasons: ["The request text contains instructions aimed at the assessor, so a person will check it."] };
  }
  // 3. Strong model-assessed scam risk declines; moderate risk goes to a person.
  if ((a?.scam_risk ?? 0) >= 0.8) return { decision: "denied", scamRisk, reasons: scamReasons };
  if ((a?.scam_risk ?? 0) >= 0.6) {
    return { decision: "in_review", scamRisk, reasons: ["Some details of this request look risky, so a person will check it with you."] };
  }
  if (!a) return { decision: "in_review", scamRisk, reasons: ["Automated assessment wasn't available, so a person will check this request."] };
  if (ctx.ratio > ctx.maxRatio) {
    return {
      decision: "in_review",
      scamRisk,
      reasons: [`The increase is more than ${ctx.maxRatio}× your current limit, so a person will confirm it.`],
    };
  }
  const docOk = a.document_supports == null || a.document_supports >= 0.5;
  if (a.genuine >= 0.75 && a.urgency >= 0.6 && a.proportionate >= 0.6 && scamRisk < 0.3 && docOk) {
    return { decision: "approved", scamRisk, reasons: ["The need is urgent, specific and in proportion to the increase requested."] };
  }
  if (a.genuine <= 0.25) {
    return {
      decision: "denied",
      scamRisk,
      reasons: ["This doesn't read as an emergency. You can still make your regular monthly change when it's available."],
    };
  }
  const why: string[] = [];
  if (a.urgency < 0.6) why.push("it isn't clear the need is urgent");
  if (a.proportionate < 0.6) why.push("the increase looks larger than the need described");
  if (!docOk) why.push("the attached document doesn't clearly support the request");
  if (scamRisk >= 0.3) why.push("there are some risk signals");
  return { decision: "in_review", scamRisk, reasons: [`A person will review this${why.length ? ` — ${why.join("; ")}` : ""}.`] };
}
