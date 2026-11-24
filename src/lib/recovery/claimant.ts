import fs from "node:fs";
import { all, newId, run, tx } from "../db";
import { audit } from "../audit";
import { HttpError } from "../users";
import { authMode } from "../auth/config";
import { bindIdentity, identityByUid, isClosed, unbindIdentity } from "../auth/identities";
import type { VerifiedToken } from "../auth/verify";
import { last4, maskEmail } from "../kyc/ids";
import { assertIdentitySecret, idHash } from "../kyc/secret";
import { storeIdImage, verifiedHolder } from "../kyc/store";
import { claimChecks } from "./claim-checks";
import { claimView, type ClaimView } from "./claim-view";
import { claimById, deleteClaimPhoto, ensureRecoveryTables, expireClaims, latestClaimFor, pendingClaimFor, settleExpiredClaimFor } from "./claims";
import { numberFrom, userById, type IdForm } from "./id-form";
import { clientTag, spendTry } from "./limits";
import { notifyAccount } from "./notify";

/* ---------- Claim (signed in with a new sign-in that has no wallet) ---------- */

const CLAIM_PENDING = "You already asked to recover an account. We'll let you know when a person has checked it.";
const HAS_WALLET = "This sign-in already has a wallet.";

export async function createClaim(token: VerifiedToken, form: IdForm, clientKeys: string[]): Promise<ClaimView> {
  ensureRecoveryTables();
  if (authMode() !== "firebase") throw new HttpError(400, "Account recovery needs sign-in, which isn't turned on here.", "not_available");
  settleExpiredClaimFor(token.uid); // a lapsed claim doesn't block a new one
  const identity = identityByUid(token.uid);
  if (identity?.status === "recovery_pending" || pendingClaimFor(token.uid)) throw new HttpError(409, CLAIM_PENDING, "claim_pending");
  if (identity?.user_id && identity.status === "active" && !isClosed(identity.user_id))
    throw new HttpError(409, HAS_WALLET, "has_wallet");
  if (!form.file) throw new HttpError(400, "Add a photo of your ID.", "file_required");
  assertIdentitySecret();
  spendTry("claim", [`uid:${token.uid}`, ...clientKeys]);

  const { number, analysis } = await numberFrom(form);
  const tag = clientTag(clientKeys);
  const holder = number ? verifiedHolder(idHash(form.docType, number)) : undefined;
  const user = holder ? userById(holder.user_id) : undefined;
  if (!user || !analysis || !number) {
    audit({ actor: token.uid, actorType: "user", action: "recovery.claim_no_match", entityType: "recovery", details: { docType: form.docType, client: tag } });
    throw new HttpError(404, "We couldn't find a wallet with that ID.", "no_match");
  }

  const otherPending = all<{ n: number }>("SELECT COUNT(*) AS n FROM recovery_claims WHERE user_id = ? AND status = 'pending'", user.id)[0].n;
  const { checks, reasons, provisional } = claimChecks({ analysis, user, token, docType: form.docType, number, otherPending });

  const id = newId("rcv");
  const now = Date.now();
  const filePath = storeIdImage("rcv", id, form.file);
  try {
    tx(() => {
      // Re-check inside the transaction: reading the card takes seconds, and meanwhile the same sign-in may have
      // opened a wallet or started another claim. The unique index on pending claims is the final guard.
      const current = identityByUid(token.uid);
      if (current?.status === "recovery_pending" || pendingClaimFor(token.uid)) throw new HttpError(409, CLAIM_PENDING, "claim_pending");
      if (current?.user_id && current.status === "active" && !isClosed(current.user_id)) throw new HttpError(409, HAS_WALLET, "has_wallet");
      run(
        `INSERT INTO recovery_claims (id, claimant_uid, claimant_email, user_id, doc_type, id_last4, status, checks, reasons, file_path, provisional, notified_email, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
        id,
        token.uid,
        token.email,
        user.id,
        form.docType,
        last4(number),
        JSON.stringify(checks),
        JSON.stringify(reasons),
        filePath,
        provisional ? 1 : 0,
        user.email ?? "", // the address the notice below goes to; "" = the account has none
        now,
      );
      if (provisional) bindIdentity({ uid: token.uid, userId: user.id, email: token.email, provider: token.provider, status: "recovery_pending", at: now });
      // Otherwise the sign-in stays without a wallet; remember it (email, provider) for the reviewer and the approval.
      else if (!current) bindIdentity({ uid: token.uid, userId: null, email: token.email, provider: token.provider, status: "active", at: now });
      audit({
        userId: user.id,
        actor: token.uid,
        actorType: "user",
        action: "recovery.claim_created",
        entityType: "recovery_claim",
        entityId: id,
        details: { docType: form.docType, idLast4: last4(number), claimant: maskEmail(token.email), client: tag, provisional },
        ts: now,
      });
    });
  } catch (e) {
    fs.rmSync(filePath, { force: true });
    if (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) throw new HttpError(409, CLAIM_PENDING, "claim_pending");
    throw e;
  }
  await notifyAccount({ userId: user.id, email: user.email, kind: "recovery_started", ref: id });
  return claimView(claimById(id)!);
}

export function claimStatus(uid: string): ClaimView | null {
  expireClaims();
  const c = latestClaimFor(uid);
  return c ? claimView(c) : null;
}

export async function cancelClaim(uid: string) {
  expireClaims();
  const c = pendingClaimFor(uid);
  if (!c) throw new HttpError(404, "There's no recovery request to cancel.", "no_claim");
  const now = Date.now();
  tx(() => {
    run("UPDATE recovery_claims SET status = 'cancelled', decided_at = ?, decided_by = 'claimant' WHERE id = ?", now, c.id);
    deleteClaimPhoto(c);
    const identity = identityByUid(uid);
    if (identity?.status === "recovery_pending" && identity.user_id === c.user_id) unbindIdentity(uid, now);
    audit({ userId: c.user_id, actor: uid, actorType: "user", action: "recovery.claim_cancelled", entityType: "recovery_claim", entityId: c.id, ts: now });
  });
  const owner = userById(c.user_id);
  await notifyAccount({ userId: c.user_id, email: owner?.email ?? null, kind: "recovery_cancelled", ref: c.id });
  return claimView(claimById(c.id)!);
}
