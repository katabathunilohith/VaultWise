import { get, run, tx } from "../db";
import { audit } from "../audit";
import { fmtMoney } from "../shared";
import { HttpError, type User } from "../users";
import { getVaultRow, toView } from "../vaults";
import { applyOutcome } from "./persistence";
import type { ProofRow, VerificationRow } from "./types";

/** A reviewer's verdict on a check waiting for a person (or an appeal). */
export function reviewDecision(proofId: string, decision: "approved" | "denied", reviewer: string, note: string) {
  return tx(() => {
    const ver = get<VerificationRow>("SELECT * FROM verifications WHERE proof_id = ?", proofId);
    if (!ver) throw new HttpError(404, "Verification not found");
    const pending = (ver.decision === "human_review" && !ver.final_decision) || ver.final_decision === "appealed";
    if (!pending) throw new HttpError(409, "This verification is not awaiting review");
    const proof = get<ProofRow>("SELECT * FROM proofs WHERE id = ?", proofId)!;
    const user = get<User>("SELECT * FROM users WHERE id = ?", proof.user_id)!;
    run(
      "UPDATE verifications SET final_decision = ?, reviewer = ?, reviewer_note = ?, decided_at = ? WHERE proof_id = ?",
      decision,
      reviewer,
      note,
      Date.now(),
      proofId,
    );
    audit({
      userId: user.id,
      actor: reviewer,
      actorType: "reviewer",
      action: `verification.reviewed.${decision}`,
      entityType: "proof",
      entityId: proofId,
      details: { note, wasAppeal: ver.final_decision === "appealed", modelDecision: ver.decision, modelConfidence: ver.confidence },
    });
    applyOutcome(user, proof, decision, reviewer, "reviewer");
  });
}

/** The customer asks a person to look again at a declined check (once). */
export function appeal(user: User, proofId: string, note: string) {
  return tx(() => {
    const ver = get<VerificationRow>(
      "SELECT v.* FROM verifications v JOIN proofs p ON p.id = v.proof_id WHERE v.proof_id = ? AND p.user_id = ?",
      proofId,
      user.id,
    );
    if (!ver) throw new HttpError(404, "Verification not found");
    // One appeal per check: a person has already looked again if there's an appeal note (the phone hides the button then too).
    if (ver.appeal_note !== null)
      throw new HttpError(409, "A person has already looked at this again. Talk to us if you still think it's wrong.", "already_appealed");
    if (ver.final_decision !== "denied") throw new HttpError(409, "Only declined verifications can be appealed");
    const proof = get<ProofRow>("SELECT * FROM proofs WHERE id = ?", proofId)!;
    // An appeal puts the declined withdrawal back on hold. If the money has left the vault since, holding it again
    // would push `available` below zero and a reviewer's approval would then fail, so refuse the appeal up front.
    const w = proof.withdrawal_id
      ? get<{ amount: number; vault_id: string }>("SELECT amount, vault_id FROM withdrawals WHERE id = ?", proof.withdrawal_id)
      : undefined;
    if (w && w.amount > toView(getVaultRow(user, w.vault_id), user.currency).available)
      throw new HttpError(
        409,
        `The vault no longer has ${fmtMoney(w.amount, user.currency)} available for this request, so it can't be held for another look. Add the money back to the vault, then appeal.`,
        "appeal_funds_unavailable",
      );
    run("UPDATE verifications SET final_decision = 'appealed', appeal_note = ?, queued_at = ? WHERE proof_id = ?", note, Date.now(), proofId);
    if (proof.withdrawal_id) run("UPDATE withdrawals SET status = 'appealed' WHERE id = ?", proof.withdrawal_id);
    audit({
      userId: user.id,
      actor: user.id,
      actorType: "user",
      action: "verification.appealed",
      entityType: "proof",
      entityId: proofId,
      details: { note },
    });
  });
}
