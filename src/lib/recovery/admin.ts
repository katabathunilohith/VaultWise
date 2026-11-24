import { all, parseJson, run, tx } from "../db";
import { audit } from "../audit";
import { HttpError } from "../users";
import { bindIdentity, disableOtherIdentities, identitiesForUser, identityByUid, isClosed, unbindIdentity } from "../auth/identities";
import { maskEmail, maskId } from "../kyc/ids";
import type { KycCheck } from "../kyc/types";
import { claimView } from "./claim-view";
import { claimById, CLAIM_TTL_MS, deleteClaimPhoto, expireClaims, type ClaimRow } from "./claims";
import { userById } from "./id-form";
import { notifyAccount } from "./notify";

/* ---------- Admin: the review queue and the decision ---------- */

export function recoveryQueue() {
  expireClaims();
  const rows = all<ClaimRow & { user_name: string; user_email: string | null }>(
    `SELECT c.*, u.name AS user_name, u.email AS user_email FROM recovery_claims c JOIN users u ON u.id = c.user_id
     WHERE c.status = 'pending' ORDER BY c.created_at ASC`,
  );
  const recent = all<ClaimRow & { user_name: string }>(
    `SELECT c.*, u.name AS user_name FROM recovery_claims c JOIN users u ON u.id = c.user_id
     WHERE c.status != 'pending' ORDER BY COALESCE(c.decided_at, c.created_at) DESC LIMIT 20`,
  );
  const view = (c: ClaimRow & { user_name: string }) => ({
    id: c.id,
    userId: c.user_id,
    userName: c.user_name,
    claimantUid: c.claimant_uid,
    claimantEmail: c.claimant_email,
    docType: c.doc_type,
    idLast4: c.id_last4,
    maskedId: maskId(c.doc_type, c.id_last4),
    status: c.status,
    checks: parseJson<KycCheck[]>(c.checks, []),
    reasons: parseJson<string[]>(c.reasons, []),
    hasFile: !!c.file_path,
    createdAt: c.created_at,
    expiresAt: c.created_at + CLAIM_TTL_MS,
    decidedAt: c.decided_at,
    decidedBy: c.decided_by,
  });
  return {
    queue: rows.map((c) => ({
      ...view(c),
      accountEmail: c.user_email,
      signIns: identitiesForUser(c.user_id).map((i) => ({ uid: i.uid, email: i.email, provider: i.provider, status: i.status, createdAt: i.created_at })),
    })),
    recent: recent.map(view),
  };
}

export async function decideClaim(id: string, decision: "approved" | "rejected", reviewer: string, note: string) {
  expireClaims();
  const c = claimById(id);
  if (!c) throw new HttpError(404, "Not found");
  if (c.status !== "pending") throw new HttpError(409, "This request was already decided.", "already_decided");
  const owner = userById(c.user_id);
  const claimant = identityByUid(c.claimant_uid);
  // The claimant may have opened a different wallet since (onboarding is blocked while a claim waits,
  // but an older wallet may exist); approving would silently move them off it.
  if (decision === "approved" && claimant?.user_id && claimant.user_id !== c.user_id && claimant.status !== "disabled" && !isClosed(claimant.user_id))
    throw new HttpError(409, "This sign-in has another wallet now. Ask the person to close it or cancel this request.", "claimant_has_wallet");
  const now = Date.now();
  tx(() => {
    run(
      "UPDATE recovery_claims SET status = ?, decided_at = ?, decided_by = ?, reasons = ? WHERE id = ?",
      decision,
      now,
      reviewer,
      JSON.stringify(decision === "rejected" ? [note] : []),
      id,
    );
    const identity = identityByUid(c.claimant_uid);
    if (decision === "approved") {
      bindIdentity({ uid: c.claimant_uid, userId: c.user_id, email: c.claimant_email, provider: identity?.provider ?? "unknown", status: "active", at: now });
      disableOtherIdentities(c.user_id, c.claimant_uid, now);
      // The old address may be lost; the new sign-in's email becomes the contact address.
      if (c.claimant_email) run("UPDATE users SET email = ? WHERE id = ?", c.claimant_email, c.user_id);
      // Other pending claims for this account lose.
      for (const other of all<ClaimRow>("SELECT * FROM recovery_claims WHERE user_id = ? AND status = 'pending' AND id != ?", c.user_id, id)) {
        run("UPDATE recovery_claims SET status = 'rejected', decided_at = ?, decided_by = ?, reasons = ? WHERE id = ?", now, reviewer, JSON.stringify(["Another request for this account was approved."]), other.id);
        deleteClaimPhoto(other);
        const oi = identityByUid(other.claimant_uid);
        if (oi?.status === "recovery_pending" && oi.user_id === c.user_id) unbindIdentity(other.claimant_uid, now);
      }
    } else {
      deleteClaimPhoto(c);
      if (identity?.status === "recovery_pending" && identity.user_id === c.user_id) unbindIdentity(c.claimant_uid, now);
    }
    audit({
      userId: c.user_id,
      actor: reviewer,
      actorType: "reviewer",
      action: `recovery.claim_${decision}`,
      entityType: "recovery_claim",
      entityId: id,
      details: { note, claimant: maskEmail(c.claimant_email) },
      ts: now,
    });
  });
  // The notice goes to the address the account had before approval (read above), not the new one.
  await notifyAccount({ userId: c.user_id, email: owner?.email ?? null, kind: decision === "approved" ? "recovery_approved" : "recovery_rejected", ref: id });
  return claimView(claimById(id)!);
}
