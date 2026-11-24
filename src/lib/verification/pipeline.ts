import { recordError, recordOutcome } from "./persistence";
import { runAiRead } from "./stages/ai-read";
import { loadContext } from "./stages/context";
import { runDecision } from "./stages/decision";
import { runIntake } from "./stages/intake";
import { runPreprocess } from "./stages/preprocess";
import { runRules } from "./stages/rules";
import { runTamper } from "./stages/tamper";

// The module's public surface stays here, so routes and tests import from "@/lib/verification/pipeline".
// Stage map and file layout: ./README.md.
export { PIPELINE_VERSION, type Check, type Extraction, type ProofRow, type Stage, type StageStatus, type VerificationRow } from "./types";
export { createProof, proofView, validateUpload } from "./proofs";
export { appeal, reviewDecision } from "./review";
export { setBillReader, type BillReader, type BillReadInput } from "./stages/ai-read";

/**
 * Runs the six stages in order, each saving its progress so the client can watch it live, then records the
 * decision (audit, fraud flags, payout / decline / hold) in one transaction. Anything thrown sends it to a person.
 */
export async function runPipeline(proofId: string) {
  const startedAt = Date.now();
  const ctx = loadContext(proofId, startedAt);
  if (!ctx) return;
  try {
    runIntake(ctx); // 1 — exact duplicate across every account
    const { processed, exif } = await runPreprocess(ctx); // 2 — image for the model, EXIF checks
    const x = await runAiRead(ctx, processed.buffer); // 3 — the vision model (consent and a key needed), or null
    const scores = runRules(ctx, x); // 4 — purpose, amount, totals, date, name
    const tamper = await runTamper(ctx, x, exif, scores.arithmetic); // 5 — ELA, reuse, timestamps, edit signs
    const outcome = runDecision(ctx, x, scores, tamper); // 6 — confidence and route
    recordOutcome(ctx, { ...outcome, tamperScore: tamper.score });
  } catch (e) {
    recordError(ctx, e);
  }
}
