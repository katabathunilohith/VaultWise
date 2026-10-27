import fs from "node:fs";
import { all, get, newId, parseJson, run, tx } from "../db";
import { audit } from "../audit";
import { HttpError, type User } from "../users";
import { authMode } from "../auth/config";
import { bindIdentity, disableOtherIdentities, identitiesForUser, identityByUid, isClosed, unbindIdentity } from "../auth/identities";
import type { VerifiedToken } from "../auth/verify";
import { validateUpload } from "../verification/pipeline";
import { analyseId } from "../kyc/analyse";
import { DOC_LABELS, last4, maskEmail, maskId, validateIdNumber, type DocType } from "../kyc/ids";
import { compareNames } from "../kyc/names";
import { assertIdentitySecret, idHash } from "../kyc/secret";
import { storeIdImage, verifiedHolder } from "../kyc/store";
import type { KycCheck } from "../kyc/types";
import { claimById, CLAIM_TTL_MS, deleteClaimPhoto, ensureRecoveryTables, expireClaims, latestClaimFor, pendingClaimFor, settleExpiredClaimFor, type ClaimRow, type ClaimStatus } from "./claims";
import { clientTag, spendTry } from "./limits";
import { notifyAccount } from "./notify";
import { makeFindToken, readFindToken } from "./tokens";

const userById = (id: string) => get<User>("SELECT * FROM users WHERE id = ?", id);

type IdForm = { docType: DocType; file: { buffer: Buffer; mime: string } | null; idNumber: string | null };

/** Turns the form into a normalised number: the typed one, or the one read from the photo. */
async function numberFrom(form: IdForm): Promise<{ number: string | null; analysis: Awaited<ReturnType<typeof analyseId>> | null }> {
  let typed: string | null = null;
  if (form.idNumber) {
    const v = validateIdNumber(form.docType, form.idNumber, null);
    if (!v.ok) throw new HttpError(400, v.reason, "invalid_id");
    typed = v.number;
  }
  if (form.file) {
    await validateUpload(form.file.buffer, form.file.mime);
    const analysis = await analyseId({ docType: form.docType, file: form.file, typedNumber: typed, accountName: null, market: null });
    if (!analysis.number) throw new HttpError(400, "We couldn't read the number. Type it in and try again.", "id_number_needed");
    return { number: analysis.number, analysis };
  }
  if (!typed) throw new HttpError(400, `Type your ${DOC_LABELS[form.docType]} number, or add a photo.`, "id_number_needed");
  return { number: typed, analysis: null };
}

/* ---------- Find (no sign-in) ---------- */

export interface FindAnswer {
  found: boolean;
  maskedEmail?: string;
  canReset: boolean;
  findToken?: string;
}

export async function findAccount(form: IdForm, clientKeys: string[]): Promise<FindAnswer> {
  assertIdentitySecret();
  spendTry("find", clientKeys);
  const tag = clientTag(clientKeys);
  let number: string | null = null;
  try {
    ({ number } = await numberFrom(form));
  } catch (e) {
    audit({ actor: "recovery", actorType: "system", action: "recovery.find_attempt", entityType: "recovery", details: { docType: form.docType, matched: false, client: tag, error: (e as HttpError).code ?? "error" } });
    throw e;
  }
  const holder = number ? verifiedHolder(idHash(form.docType, number)) : undefined;
  const user = holder ? userById(holder.user_id) : undefined;
  audit({
    userId: user?.id ?? null,
    actor: "recovery",
    actorType: "system",
    action: "recovery.find_attempt",
    entityType: "recovery",
    details: { docType: form.docType, matched: !!user, client: tag, idLast4: number && user ? last4(number) : undefined },
  });
  if (!user) return { found: false, canReset: false };
  const masked = maskEmail(user.email);
  return masked ? { found: true, maskedEmail: masked, canReset: true, findToken: makeFindToken(user.id) } : { found: true, canReset: false };
}

/* ---------- Password reset (no sign-in, never says whether the account exists) ---------- */

let warnedNoKey = false;

async function sendPasswordReset(email: string) {
  const key = process.env.FIREBASE_WEB_API_KEY?.trim();
  if (!key) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn("[recovery] FIREBASE_WEB_API_KEY is not set: password-reset emails are not sent by the server.");
    }
    return;
  }
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
      signal: AbortSignal.timeout(8000),
    });
    // EMAIL_NOT_FOUND and similar are expected; the answer to the client is the same either way.
    if (!res.ok && res.status >= 500) console.warn(`[recovery] password reset request failed (${res.status})`);
  } catch {
    console.warn("[recovery] password reset request did not complete");
  }
}

export async function requestReset(input: { email?: string | null; findToken?: string | null }, clientKeys: string[]) {
  if (input.findToken) assertIdentitySecret();
  spendTry("reset", clientKeys);
  let email: string | null = null;
  let userId: string | null = null;
  let via: "email" | "findToken" | "none" = "none";
  if (input.findToken) {
    via = "findToken";
    userId = readFindToken(input.findToken);
    const user = userId && !isClosed(userId) ? userById(userId) : undefined;
    email = user?.email ?? null;
    if (!user) userId = null;
  } else if (input.email) {
    via = "email";
    email = input.email.trim().toLowerCase();
  }
  audit({ userId, actor: "recovery", actorType: "system", action: "recovery.reset_requested", entityType: "recovery", details: { via, client: clientTag(clientKeys) } });
  if (authMode() === "prototype") return { ok: true as const, simulated: true as const };
  if (email) await sendPasswordReset(email);
  return { ok: true as const };
}

/* ---------- Claim (signed in with a new sign-in that has no wallet) ---------- */

export interface ClaimView {
  id: string;
  status: ClaimStatus;
  /**
   * What the claimant can do while it waits: "read_only" when the automated checks passed (a summary of the
   * account, no money moves); "after_approval" when a person must check first (no access until approved).
   */
  access: "read_only" | "after_approval";
  docType: string;
  idLast4: string | null;
  /** The account's email we told about this claim, masked. */
  notifiedEmail: string | null;
  reasons: string[];
  createdAt: number;
  expiresAt: number;
  decidedAt: number | null;
}

export function claimView(c: ClaimRow): ClaimView {
  const owner = userById(c.user_id);
  return {
    id: c.id,
    status: c.status,
    access: c.provisional ? "read_only" : "after_approval",
    docType: c.doc_type,
    idLast4: c.id_last4,
    notifiedEmail: maskEmail(owner?.email),
    reasons: parseJson<string[]>(c.reasons, []),
    createdAt: c.created_at,
    expiresAt: c.created_at + CLAIM_TTL_MS,
    decidedAt: c.decided_at,
  };
}

const CLAIM_PENDING = "You already asked to recover an account. We'll let you know when a person has checked it.";

export async function createClaim(token: VerifiedToken, form: IdForm, clientKeys: string[]): Promise<ClaimView> {
  ensureRecoveryTables();
  if (authMode() !== "firebase") throw new HttpError(400, "Account recovery needs sign-in, which isn't turned on here.", "not_available");
  settleExpiredClaimFor(token.uid); // a lapsed claim doesn't block a new one
  const identity = identityByUid(token.uid);
  if (identity?.status === "recovery_pending" || pendingClaimFor(token.uid)) throw new HttpError(409, CLAIM_PENDING, "claim_pending");
  if (identity?.user_id && identity.status === "active" && !isClosed(identity.user_id))
    throw new HttpError(409, "This sign-in already has a wallet.", "has_wallet");
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

  const checks: KycCheck[] = [...analysis.checks];
  const reasons: string[] = [...analysis.reasons];
  const name = compareNames(analysis.nameOnDoc, user.name);
  checks.push({
    label: "Name on account",
    status: name.result === "match" ? "pass" : name.result === "mismatch" ? "fail" : "warn",
    detail: `Card name vs account name: ${name.result} (${(name.score * 100).toFixed(0)}%)`,
  });
  checks.push({ label: "Matched ID", status: "pass", detail: `${DOC_LABELS[form.docType]} ${maskId(form.docType, last4(number))} matches the account's verified ID` });
  checks.push({
    label: "New sign-in email",
    status: token.emailVerified ? "pass" : "warn",
    detail: token.email ? `${token.email} (${token.emailVerified ? "verified" : "not verified"}, ${token.provider})` : `No email (${token.provider})`,
  });
  checks.push({
    label: "Account email",
    status: user.email ? "info" : "warn",
    detail: user.email ? `Notice sent to ${maskEmail(user.email)}` : "The account has no email to notify",
  });
  const others = all<{ n: number }>("SELECT COUNT(*) AS n FROM recovery_claims WHERE user_id = ? AND status = 'pending'", user.id)[0].n;
  if (others) checks.push({ label: "Other claims", status: "warn", detail: `${others} other pending claim(s) for this account` });

  // Provisional read-only access only when the card itself backs the claim: the model read it, it is the
  // chosen ID type, the number on the card is the matched one (and equals any typed number), the name fits,
  // and there is no sign of editing. Anything else waits for a person with no access at all.
  const sg = analysis.signals;
  const provisional =
    analysis.aiUsed &&
    sg.isIdDocument &&
    sg.docTypeMatches &&
    sg.legible &&
    !sg.expired &&
    !sg.editSignals &&
    !!sg.readNumber &&
    sg.readNumber === number &&
    sg.typedMatchesCard !== false &&
    (name.result === "match" || name.result === "partial");
  checks.push({
    label: "Access while waiting",
    status: provisional ? "pass" : "info",
    detail: provisional ? "Checks passed: read-only summary until a person decides" : "No access until a person approves",
  });
  if (!provisional) reasons.push("A person will check your ID before you can see the account.");

  const id = newId("rcv");
  const now = Date.now();
  const filePath = storeIdImage("rcv", id, form.file);
  try {
    tx(() => {
      // Re-check inside the transaction; the unique index on pending claims is the final guard.
      if (pendingClaimFor(token.uid)) throw new HttpError(409, CLAIM_PENDING, "claim_pending");
      run(
        `INSERT INTO recovery_claims (id, claimant_uid, claimant_email, user_id, doc_type, id_last4, status, checks, reasons, file_path, provisional, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
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
        now,
      );
      if (provisional) bindIdentity({ uid: token.uid, userId: user.id, email: token.email, provider: token.provider, status: "recovery_pending", at: now });
      // Otherwise the sign-in stays without a wallet; remember it (email, provider) for the reviewer and the approval.
      else if (!identity) bindIdentity({ uid: token.uid, userId: null, email: token.email, provider: token.provider, status: "active", at: now });
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

/* ---------- Admin ---------- */

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
  await notifyAccount({ userId: c.user_id, email: owner?.email ?? null, kind: decision === "approved" ? "recovery_approved" : "recovery_rejected", ref: id });
  return claimView(claimById(id)!);
}
