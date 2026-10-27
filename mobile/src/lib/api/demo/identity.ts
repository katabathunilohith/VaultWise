/**
 * Identity in Practice: the same methods as identityLive (lib/api/identity.ts), simulated.
 * - The ID check passes for the plain "SAMPLE ID · Practice only" card; any other photo goes to a
 *   pretend person, who approves it about 20 seconds later.
 * - Find my account always finds the Practice account and shows its email masked.
 * - Password resets are never sent; the answer says so (`simulated`).
 * - A recovery request waits for the same pretend person (about 20 seconds), and can be cancelled.
 *   With the sample card it passes the automatic checks ("read_only"): like the server, /me then
 *   says recovery access, with the first name only and the email masked, and Practice wallet moves
 *   are refused (assertPracticeCanMove; the older Practice money flows don't check it). With any
 *   other photo it's "after_approval": a new login would have no access at all until approved;
 *   Practice can't take the sample account away, so only the status screens show that.
 */
import { ApiError } from "../errors";
import { docTypesFor, last4, validateIdNumber } from "../identity-ids";
import type { ClaimInput, FindAccountInput, FindAccountResult, IdSubmission, KycInput, KycView, RecoveryClaim, ResetInput, ResetResult } from "../identity-types";
import type { Me } from "../types";
import { clone, newId, S, wait } from "./state";

/** How long the pretend person takes to decide, so a demo can watch it happen. */
export const PRACTICE_REVIEW_MS = 20_000;
const CLAIM_TTL_MS = 7 * 86_400_000;

/** The sample card's file name (see features/kyc/sample.tsx). */
const isSample = (input: IdSubmission) => !!input.file && /sample-id/i.test(input.file.name);

function maskEmail(email: string | null | undefined) {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  if (!local) return `***@${domain}`;
  return `${local.length <= 2 ? `${local[0]}***` : `${local[0]}***${local[local.length - 1]}`}@${domain}`;
}

/** Same check the server makes on a typed number. */
function checkTyped(input: IdSubmission, market: string | null) {
  if (!input.idNumber?.trim()) return null;
  const v = validateIdNumber(input.docType, input.idNumber, market);
  if (!v.ok) throw new ApiError(v.reason, 400, "invalid_id");
  return v.number;
}

/** Lets the pretend person finish whatever is due. */
function settleIdentity(now = Date.now()) {
  const id = S.identity;
  if (id.kyc.status === "needs_review" && id.kyc.decideAt && now >= id.kyc.decideAt) {
    id.kyc = { ...id.kyc, status: "verified", reasons: [], updatedAt: id.kyc.decideAt, decideAt: null };
  }
  const c = id.claim;
  if (c?.status === "pending" && c.decideAt && now >= c.decideAt) {
    id.claim = { ...c, status: "approved", decidedAt: c.decideAt, decideAt: null };
  }
  S.me.user.kycStatus = id.kyc.status;
  S.me.user.kycLevel = id.kyc.status === "verified" ? 2 : 1;
}

function kycView(): KycView {
  const { decideAt: _decideAt, ...view } = S.identity.kyc;
  return clone(view);
}

function claimView(): RecoveryClaim | null {
  const c = S.identity.claim;
  if (!c) return null;
  const { decideAt: _decideAt, ...view } = c;
  return clone(view);
}

/**
 * The server's read-only rule in Practice: no money moves while a recovery request waits for a
 * person. Called by the Practice money moves (demo/wallet.ts).
 */
export function assertPracticeCanMove() {
  settleIdentity();
  if (readOnlyClaim())
    throw new ApiError("Your account is being checked. Money can't move until a person confirms it's you.", 403, "recovery_restricted");
}

/** A request that passed the automatic checks and waits for a person: the account is read-only. */
function readOnlyClaim() {
  const c = S.identity.claim;
  return c?.status === "pending" && c.access === "read_only" ? c : null;
}

/**
 * Adds the identity fields to the Practice /me (demo/index.ts `me`). During a read-only recovery,
 * like the server: the first name only and the email masked.
 */
export function withIdentity<T extends Me>(me: T): T {
  settleIdentity();
  const { kyc } = S.identity;
  const claim = readOnlyClaim();
  const pending = !!claim;
  const user = me.onboarded
    ? {
        ...me.user,
        kycStatus: kyc.status,
        kycLevel: kyc.status === "verified" ? 2 : 1,
        ...(pending ? { name: me.user.name.trim().split(/\s+/)[0] ?? me.user.name, email: maskEmail(me.user.email) } : {}),
      }
    : null;
  return {
    ...me,
    ...(user ? { user } : {}),
    auth: { mode: "prototype", access: pending ? "recovery" : "full", email: pending ? maskEmail(S.me.user.email) : S.me.user.email },
    kyc: { status: kyc.status, ...(kyc.docType ? { docType: kyc.docType } : {}), ...(kyc.idLast4 ? { idLast4: kyc.idLast4 } : {}) },
    recovery: pending && claim ? { claimId: claim.id, status: claim.status, createdAt: claim.createdAt } : null,
  };
}

export const identityDemo = {
  kyc: async (): Promise<KycView> => {
    await wait(250);
    settleIdentity();
    return kycView();
  },
  /** Practice lets a verified person run the check again, so the flow can be shown. */
  submitKyc: async (input: KycInput): Promise<KycView> => {
    settleIdentity();
    const market = S.me.user.jurisdiction;
    if (!docTypesFor(market).includes(input.docType)) throw new ApiError("Choose one of the ID types listed.", 400, "doc_type_not_accepted");
    if (S.identity.kyc.status === "needs_review") throw new ApiError("We're already checking your ID. We'll let you know when it's done.", 409, "kyc_in_review");
    const typed = checkTyped(input, market);
    await wait(2200);
    const now = Date.now();
    const idLast4 = typed ? last4(typed) : "4821";
    S.identity.kyc = isSample(input)
      ? { status: "verified", docType: input.docType, idLast4, reasons: [], updatedAt: now, decideAt: null }
      : {
          status: "needs_review",
          docType: input.docType,
          idLast4: typed ? idLast4 : null,
          reasons: ["In Practice, a person checks every photo that isn't the sample card."],
          updatedAt: now,
          decideAt: now + PRACTICE_REVIEW_MS,
        };
    settleIdentity(now);
    return kycView();
  },
  findAccount: async (input: FindAccountInput): Promise<FindAccountResult> => {
    if (!input.file && !input.idNumber?.trim()) throw new ApiError("Type your ID number, or add a photo.", 400, "id_number_needed");
    checkTyped(input, null);
    await wait(1400);
    const masked = maskEmail(S.me.user.email);
    return masked ? { found: true, maskedEmail: masked, canReset: true, findToken: "practice" } : { found: true, canReset: false };
  },
  resetPassword: async (_input: ResetInput): Promise<ResetResult> => {
    await wait(700);
    return { ok: true, simulated: true };
  },
  recoveryClaim: async (): Promise<RecoveryClaim | null> => {
    await wait(200);
    settleIdentity();
    return claimView();
  },
  submitClaim: async (input: ClaimInput): Promise<RecoveryClaim | null> => {
    settleIdentity();
    if (S.identity.claim?.status === "pending")
      throw new ApiError("You already asked to recover an account. We'll let you know when a person has checked it.", 409, "claim_pending");
    const typed = checkTyped(input, null);
    await wait(2200);
    const now = Date.now();
    S.identity.claim = {
      id: newId("rcv"),
      status: "pending",
      docType: input.docType,
      idLast4: typed ? last4(typed) : (S.identity.kyc.idLast4 ?? "4821"),
      reasons: [],
      notifiedEmail: maskEmail(S.me.user.email),
      // The sample card passes the automatic checks; any other photo waits for the person.
      access: isSample(input) ? "read_only" : "after_approval",
      createdAt: now,
      decidedAt: null,
      expiresAt: now + CLAIM_TTL_MS,
      decideAt: now + PRACTICE_REVIEW_MS,
    };
    return claimView();
  },
  cancelClaim: async (): Promise<{ ok: true }> => {
    await wait(500);
    settleIdentity();
    const c = S.identity.claim;
    if (c?.status !== "pending") throw new ApiError("There's no recovery request to cancel.", 404, "no_claim");
    S.identity.claim = { ...c, status: "cancelled", decidedAt: Date.now(), decideAt: null };
    return { ok: true };
  },
};
