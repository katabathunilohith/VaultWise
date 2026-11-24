/**
 * Identity in Practice: the same methods as identityLive (lib/api/identity.ts), simulated.
 * - The ID check passes for the plain "SAMPLE ID · Practice only" card; any other photo goes to a
 *   pretend person, who approves it about 20 seconds later.
 * - Find my account always finds the Practice account and shows its email masked.
 * - Password resets are never sent; the answer says so (`simulated`).
 * - A recovery request waits for the same pretend person (about 20 seconds), and can be cancelled.
 *   With the sample card it passes the automatic checks ("read_only"): like the server, /me then
 *   says recovery access, with the first name only and the email masked, and Practice wallet moves
 *   are refused (assertPracticeCanMove; assertPracticeIdVerified also needs a verified ID, for the
 *   moves the server's money table marks `kyc`). With any
 *   other photo it's "after_approval": a new login would have no access at all until approved;
 *   Practice can't take the sample account away, so only the status screens show that.
 * - kyc-checks (plan 07): the onboarding steps (PAN, Aadhaar through DigiLocker, bank account) with
 *   the contract's test provider. See "The onboarding steps" below.
 */
import { ApiError } from "../errors";
import { docTypesFor, last4, validateIdNumber } from "../identity-ids";
import type {
  BankCheckStart,
  ClaimInput,
  DigiLockerStart,
  FindAccountInput,
  FindAccountResult,
  IdSubmission,
  KycFlow,
  KycInput,
  KycStepName,
  KycSteps,
  KycStepStatus,
  KycView,
  RecoveryClaim,
  ResetInput,
  ResetResult,
} from "../identity-types";
import type { Me } from "../types";
import { freshStep, freshSteps, type DemoIdentity, type DemoStep } from "./identity-state";
import { clone, newId, S, wait } from "./state";

/** Mirrors src/lib/kyc/levels.ts: 2 verified, 1 waiting, 0 rejected. */
const kycLevelFor = (status: string) => (status === "verified" ? 2 : status === "rejected" ? 0 : 1);

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
  ensureSteps();
  const id = S.identity;
  if (id.kyc.status === "needs_review" && id.kyc.decideAt && now >= id.kyc.decideAt) {
    id.kyc = { ...id.kyc, status: "verified", reasons: [], updatedAt: id.kyc.decideAt, decideAt: null };
  }
  const c = id.claim;
  if (c?.status === "pending" && c.decideAt && now >= c.decideAt) {
    id.claim = { ...c, status: "approved", decidedAt: c.decideAt, decideAt: null };
  }
  S.me.user.kycStatus = id.kyc.status;
  S.me.user.kycLevel = kycLevelFor(id.kyc.status);
}

/**
 * The view GET /kyc answers. Like the server (src/lib/kyc/service.ts kycView): in the steps flow the
 * steps' reasons join the check's own, a step a person looked at counts as done once the check is
 * verified, and the newest step's time stands in while the check itself has none.
 */
function kycView(): KycView {
  const { decideAt: _decideAt, ...photo } = S.identity.kyc;
  const flow = flowNow();
  if (flow !== "steps") return clone({ ...photo, flow, steps: null });
  const verified = photo.status === "verified";
  const steps = {} as KycSteps;
  const reasons = [...photo.reasons];
  let stepsAt: number | null = null;
  for (const name of STEP_ORDER) {
    const s = S.identity.steps[name];
    const status: KycStepStatus = s.status === "review" && verified ? "done" : s.status;
    steps[name] = { status, last4: status === "todo" ? null : s.last4 };
    if (status === "review" || status === "failed") reasons.push(...s.reasons);
    if (status !== "todo" && s.updatedAt) stepsAt = Math.max(stepsAt ?? 0, s.updatedAt);
  }
  return clone({ ...photo, reasons: verified ? [] : [...new Set(reasons)], updatedAt: photo.updatedAt ?? stepsAt, flow, steps });
}

/* ---------- kyc-checks (plan 07): the onboarding steps, with the contract's test provider ---------- */

const STEP_ORDER: KycStepName[] = ["pan", "aadhaar", "bank"];
const STEP_STATUSES: KycStepStatus[] = ["todo", "done", "review", "failed"];

/**
 * The test provider's published answers (docs/plans/contracts.md, src/lib/kyc/checks/providers/test.ts):
 * PAN ABCDE1234F matches any name, ABCDE0000F is registered to someone else (a person checks it), any
 * other well-formed PAN isn't found. DigiLocker and the ₹1 payment always finish with the account name.
 */
const TEST_PAN_MATCH = "ABCDE1234F";
const TEST_PAN_MISMATCH = "ABCDE0000F";
const TEST_AADHAAR_LAST4 = "1234";
const TEST_BANK = { ifsc: "HDFC0000001", last4: "4321" } as const;
/** How long a DigiLocker or ₹1 payment try stays open (the test provider's 10 minutes). */
const TRY_TTL_MS = 10 * 60_000;

const PAN_NAME_REASON = "The name on your PAN doesn't match the name on your account. A person will check it.";
const PAN_NOT_FOUND = "We couldn't find that PAN. Check it and try again.";
const PREVIOUS: Partial<Record<KycStepName, KycStepName>> = { aadhaar: "pan", bank: "aadhaar" };
const ORDER_MESSAGE: Partial<Record<KycStepName, string>> = { aadhaar: "Check your PAN first.", bank: "Connect DigiLocker first." };

/** The server gives the steps to India accounts only (src/lib/kyc/checks/config.ts flowFor). */
const flowNow = (): KycFlow => (S.me.user.jurisdiction === "IN" ? "steps" : "photo");

/**
 * Saves from before plan 07 have no steps: the "state" slice lays the saved identity over a fresh
 * one as a whole (state.ts), so the missing parts are filled in here, and a damaged step starts over.
 */
function ensureSteps() {
  const id = S.identity as DemoIdentity & { steps?: unknown; open?: unknown };
  if (!id.steps || typeof id.steps !== "object") id.steps = freshSteps();
  for (const name of STEP_ORDER) {
    const s = id.steps[name] as Partial<DemoStep> | undefined;
    if (!s || typeof s !== "object" || !STEP_STATUSES.includes(s.status as KycStepStatus)) id.steps[name] = freshStep();
    else if (!Array.isArray(s.reasons)) id.steps[name] = { ...freshStep(), ...s, reasons: [] } as DemoStep;
  }
  if (!id.open || typeof id.open !== "object") id.open = { aadhaar: null, bank: null };
}

function assertStepsFlow() {
  if (flowNow() !== "steps") throw new ApiError("This account verifies with a photo of your ID instead.", 409, "kyc_flow_off");
}

function assertNotDecided() {
  const k = S.identity.kyc;
  if (k.status === "verified") throw new ApiError("Your ID is already verified.", 409, "kyc_done");
  if (k.status === "needs_review" || (k.status === "pending" && k.docType))
    throw new ApiError("We're already checking your ID. We'll let you know when it's done.", 409, "kyc_in_review");
}

/** Same refusals as the server's assertCanStart: wrong flow, already decided, out of order, or done. */
function assertCanStart(step: KycStepName) {
  assertStepsFlow();
  assertNotDecided();
  const prev = PREVIOUS[step];
  const prevStatus = prev ? S.identity.steps[prev].status : "done";
  if (prevStatus !== "done" && prevStatus !== "review") throw new ApiError(ORDER_MESSAGE[step]!, 409, "kyc_step_order");
  if (S.identity.steps[step].status === "done") throw new ApiError("This step is already done.", 409, "kyc_step_done");
}

/**
 * Practice lets a verified person run the steps again, so the flow can be shown (the server answers
 * 409 kyc_done). Like a person's rejection on the server, every step starts over, and the check is
 * open again until all three are finished.
 */
function restartIfVerified() {
  if (S.identity.kyc.status !== "verified") return;
  S.identity.kyc = { status: "not_started", docType: null, idLast4: null, reasons: [], updatedAt: null, decideAt: null };
  S.identity.steps = freshSteps();
  S.identity.open = { aadhaar: null, bank: null };
}

/** The open try a finish names, or "settled" when it already finished (a repeat call just answers). */
function openTry(step: "aadhaar" | "bank", requestId: string): "open" | "settled" {
  const t = S.identity.open[step];
  if (t?.requestId === requestId) {
    if (t.expiresAt < Date.now()) {
      S.identity.open[step] = null;
      throw new ApiError("This request has expired. Start again.", 409, "kyc_request_expired");
    }
    return "open";
  }
  if (S.identity.steps[step].requestId === requestId) return "settled";
  throw new ApiError("We couldn't find that request. Start again.", 404, "kyc_request_not_found");
}

/**
 * After each step, like the server's conclude(): all three done → verified; all three finished with
 * one for a person → needs_review, which the pretend person approves PRACTICE_REVIEW_MS later.
 */
function concludeSteps(now: number) {
  const k = S.identity.kyc;
  if (k.status === "verified" || k.status === "needs_review") return;
  const steps = S.identity.steps;
  if (STEP_ORDER.some((name) => steps[name].status === "todo" || steps[name].status === "failed")) return;
  const review = STEP_ORDER.some((name) => steps[name].status === "review");
  const reasons = [...new Set(STEP_ORDER.flatMap((name) => (steps[name].status === "review" ? steps[name].reasons : [])))];
  S.identity.kyc = review
    ? { status: "needs_review", docType: "pan", idLast4: steps.pan.last4, reasons, updatedAt: now, decideAt: now + PRACTICE_REVIEW_MS }
    : { status: "verified", docType: "pan", idLast4: steps.pan.last4, reasons: [], updatedAt: now, decideAt: null };
  settleIdentity(now);
}

/** The onboarding steps in Practice: the same methods as identityLive's, answering like the test provider. */
const stepsDemo = {
  submitPan: async (pan: string): Promise<KycView> => {
    settleIdentity();
    const v = validateIdNumber("pan", pan);
    if (!v.ok) throw new ApiError(v.reason, 400, "invalid_id");
    assertStepsFlow();
    restartIfVerified();
    assertCanStart("pan");
    await wait(1400);
    const now = Date.now();
    const base = { ...freshStep(), last4: last4(v.number), updatedAt: now };
    S.identity.steps.pan =
      v.number === TEST_PAN_MATCH
        ? { ...base, status: "done" }
        : v.number === TEST_PAN_MISMATCH
          ? { ...base, status: "review", reasons: [PAN_NAME_REASON] }
          : { ...base, status: "failed", reasons: [PAN_NOT_FOUND] };
    concludeSteps(now);
    return kycView();
  },
  /** The URL is never opened: the Practice screen comes straight back (".invalid" can't be a real site). */
  startDigiLocker: async (): Promise<DigiLockerStart> => {
    settleIdentity();
    assertCanStart("aadhaar");
    await wait(600);
    const requestId = newId("dl");
    S.identity.open.aadhaar = { requestId, expiresAt: Date.now() + TRY_TTL_MS };
    return { url: `https://digilocker.practice.invalid/?id=${requestId}`, requestId };
  },
  /** Finishes with the account name, so it always passes: Aadhaar ending 1234. */
  finishDigiLocker: async (requestId: string): Promise<KycView> => {
    settleIdentity();
    assertStepsFlow();
    if (openTry("aadhaar", requestId) === "settled") return kycView();
    assertNotDecided();
    await wait(1200);
    // Another finish for the same try got there first.
    if (S.identity.open.aadhaar?.requestId !== requestId) return kycView();
    const now = Date.now();
    S.identity.open.aadhaar = null;
    S.identity.steps.aadhaar = { ...freshStep(), status: "done", last4: TEST_AADHAAR_LAST4, updatedAt: now, requestId };
    concludeSteps(now);
    return kycView();
  },
  /** A UPI link to a payee that doesn't exist; the Practice screen never opens it, and nothing is paid. */
  startBankCheck: async (): Promise<BankCheckStart> => {
    settleIdentity();
    assertCanStart("bank");
    await wait(600);
    const requestId = newId("rpd");
    const expiresAt = Date.now() + TRY_TTL_MS;
    S.identity.open.bank = { requestId, expiresAt };
    const upiLink = `upi://pay?pa=practice-only@vaultwise&pn=Vaultwise%20Practice&am=1.00&cu=INR&tr=${requestId}&tn=Practice%20only`;
    return { upiLink, requestId, expiresAt };
  },
  /** Finishes with the account name: IFSC HDFC0000001, account ending 4321. */
  finishBankCheck: async (requestId: string): Promise<KycView> => {
    settleIdentity();
    assertStepsFlow();
    if (openTry("bank", requestId) === "settled") return kycView();
    assertNotDecided();
    await wait(1200);
    if (S.identity.open.bank?.requestId !== requestId) return kycView();
    const now = Date.now();
    S.identity.open.bank = null;
    S.identity.steps.bank = { ...freshStep(), status: "done", last4: TEST_BANK.last4, ifsc: TEST_BANK.ifsc, updatedAt: now, requestId };
    concludeSteps(now);
    return kycView();
  },
};

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

/**
 * The server's ID gate (`customer({ money })` for an action marked `kyc: true` in
 * src/lib/money-routes.ts): money out, investing and money in from the bank need a verified ID,
 * 403 `kyc_required`. Checked first, before the device cap and the MPIN, as on the server; it also
 * refuses while a recovery request waits (assertPracticeCanMove). The contract test
 * (__tests__/contract-money-actions.test.ts) holds every Practice money move to the server's table.
 */
export function assertPracticeIdVerified() {
  assertPracticeCanMove();
  const kyc = S.me.user.kycStatus;
  if (kyc && kyc !== "verified") throw new ApiError("Verify your ID to move money.", 403, "kyc_required");
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
        kycLevel: kycLevelFor(kyc.status),
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
  ...stepsDemo, // kyc-checks
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
    // kyc-checks: Practice can show the photo check although it verifies with the steps; a photo
    // check replaces any steps from before, so the status shows the ID it was decided on.
    S.identity.steps = freshSteps();
    S.identity.open = { aadhaar: null, bank: null };
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
