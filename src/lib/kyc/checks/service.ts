import { get } from "../../db";
import { audit } from "../../audit";
import { HttpError, type User } from "../../users";
import { bankAccountById, saveBankAccount } from "../../bank";
import { last4 as lastFour, validateIdNumber } from "../ids";
import { compareNames, type NameMatch } from "../names";
import { assertIdentitySecret, idHash } from "../secret";
import { insertKycRecord, latestKycRecord, otherHolders } from "../store";
import { kycView, setUserKyc, type KycView } from "../service";
import type { KycCheck } from "../types";
import { digilockerRedirectUrl, flowFor, TRIES_PER_DAY } from "./config";
import { checkProviders } from "./registry";
import { checkByRequest, completeCheck, deleteCheck, expireCheck, expireOpen, insertCheck, otherPanHolders, setRequest, triesSince, type CheckRow } from "./store";
import { STEPS, stepsState } from "./view";
import type { CheckStep, CheckSubject, PanResult } from "./types";

/**
 * The onboarding checks (KYC_FLOW=steps): PAN, then Aadhaar through DigiLocker, then a bank account by
 * reverse penny drop. Each step's newest try is in kyc_checks. When all three are done the account is
 * verified; when all three are finished and a name didn't match (or the PAN is on another account),
 * the whole check goes to the existing ID review queue as one kyc_records row (needs_review), so a person
 * sees every name at once. A person's rejection starts the steps again.
 */

const LABEL: Record<CheckStep, string> = { pan: "PAN", aadhaar: "Aadhaar (DigiLocker)", bank: "Bank account" };
const PREVIOUS: Partial<Record<CheckStep, CheckStep>> = { aadhaar: "pan", bank: "aadhaar" };
const ORDER_MESSAGE: Partial<Record<CheckStep, string>> = { aadhaar: "Check your PAN first.", bank: "Connect DigiLocker first." };
const NAME_REASON: Record<CheckStep, string> = {
  pan: "The name on your PAN doesn't match the name on your account. A person will check it.",
  aadhaar: "The name on your Aadhaar doesn't match the name on your account. A person will check it.",
  bank: "The name on your bank account doesn't match the name on your account. A person will check it.",
};
const NAME_DRIFT = "The names on your documents don't all match the name on your account. A person will check it.";
/**
 * What the customer is told when their PAN is already on another account. It doesn't say why, so the PAN
 * step can't be used to find out whether a PAN belongs to someone with an account; the reviewer sees the
 * reason (DUPLICATE_PAN_NOTE) in the PAN check line.
 */
const PAN_FOR_A_PERSON = "A person needs to look at your PAN before it can be accepted. A person will check it.";
const DUPLICATE_PAN_NOTE = "this PAN is already on another open account";
const WAITING: Record<"aadhaar" | "bank", string> = {
  aadhaar: "DigiLocker hasn't finished yet. Sign in to DigiLocker and allow sharing your Aadhaar, then try again.",
  bank: "We haven't received the ₹1 payment yet. Pay with the UPI link, then try again.",
};

function reload(user: User): User {
  return get<User>("SELECT * FROM users WHERE id = ?", user.id)!;
}

const subject = (u: User): CheckSubject => ({ userId: u.id, name: u.name });

function assertStepsFlow(user: User) {
  if (flowFor(user) !== "steps") throw new HttpError(409, "This account verifies with a photo of your ID instead.", "kyc_flow_off");
}

function assertNotDecided(user: User) {
  if (user.kyc_status === "verified") throw new HttpError(409, "Your ID is already verified.", "kyc_done");
  const latest = latestKycRecord(user.id);
  if (latest && (latest.status === "needs_review" || latest.status === "pending"))
    throw new HttpError(409, "We're already checking your ID. We'll let you know when it's done.", "kyc_in_review");
}

/** Refuses a step that can't start now: wrong flow, already decided, out of order, done, or too many tries today. */
function assertCanStart(user: User, step: CheckStep) {
  assertStepsFlow(user);
  assertNotDecided(user);
  const { steps } = stepsState(user);
  const prev = PREVIOUS[step];
  if (prev && steps[prev].status !== "done" && steps[prev].status !== "review") throw new HttpError(409, ORDER_MESSAGE[step]!, "kyc_step_order");
  if (steps[step].status === "done") throw new HttpError(409, "This step is already done.", "kyc_step_done");
  if (triesSince(user.id, step, Date.now() - 86_400_000) >= TRIES_PER_DAY) throw new HttpError(429, "Too many tries today. Try again tomorrow.", "rate_limited");
}

/**
 * The open try a finish route names. Answers "settled" when it was already finished (a repeat call
 * just returns the view).
 */
function openTry(user: User, step: "aadhaar" | "bank", requestId: string, providerName: string): CheckRow | "settled" {
  assertStepsFlow(user);
  const row = checkByRequest(user.id, step, requestId);
  if (!row) throw new HttpError(404, "We couldn't find that request. Start again.", "kyc_request_not_found");
  if (row.status === "expired") throw new HttpError(409, "This request has expired. Start again.", "kyc_request_expired");
  if (row.status !== "started") return "settled";
  assertNotDecided(user);
  if ((row.expires_at && row.expires_at < Date.now()) || row.provider !== providerName) {
    expireCheck(row.id);
    throw new HttpError(409, "This request has expired. Start again.", "kyc_request_expired");
  }
  return row;
}

function nameOutcome(step: CheckStep, onDocument: string | null, account: string): { nameMatch: NameMatch; reasons: string[] } {
  const nameMatch = compareNames(onDocument, account).result;
  return { nameMatch, reasons: nameMatch === "match" ? [] : [NAME_REASON[step]] };
}

function auditStep(user: User, row: { id: string; provider: string }, step: CheckStep, details: Record<string, unknown>) {
  audit({ userId: user.id, actor: user.id, actorType: "user", action: `kyc.step.${step}`, entityType: "kyc_check", entityId: row.id, details: { provider: row.provider, ...details } });
}

/* ---------- PAN ---------- */

export async function submitPan(input: User, rawPan: string): Promise<KycView> {
  assertIdentitySecret();
  const v = validateIdNumber("pan", rawPan);
  if (!v.ok) throw new HttpError(400, v.reason, "invalid_id");
  const user = reload(input);
  assertCanStart(user, "pan");
  const provider = checkProviders().pan;
  const id = insertCheck({ userId: user.id, step: "pan", provider: provider.name });
  let res: PanResult;
  try {
    res = await provider.verify(v.number, subject(user));
  } catch (e) {
    deleteCheck(id);
    throw e;
  }
  const last4 = lastFour(v.number);
  if (res.status !== "valid") {
    const reason =
      res.status === "not_found"
        ? "We couldn't find that PAN. Check it and try again."
        : "The Income Tax Department says this PAN isn't valid (for example, it isn't linked to Aadhaar). Sort it out with them, then try again.";
    completeCheck(id, { status: "failed", last4, reasons: [reason] });
    auditStep(user, { id, provider: provider.name }, "pan", { status: "failed", last4, result: res.status });
  } else {
    const hash = idHash("pan", v.number);
    const { nameMatch, reasons } = nameOutcome("pan", res.registeredName, user.name);
    const duplicate = !res.sample && (otherHolders(hash, user.id).length > 0 || otherPanHolders(hash, user.id).length > 0);
    if (duplicate) reasons.push(PAN_FOR_A_PERSON);
    const status = reasons.length ? "review" : "done";
    // The PAN's name is kept like the other steps' names, so conclude() can compare all three with the
    // account's name at the end (it matches the account name anyway when the step passed).
    completeCheck(id, { status, last4, idHash: hash, name: res.registeredName, nameMatch, reasons, reviewNote: duplicate ? DUPLICATE_PAN_NOTE : null });
    auditStep(user, { id, provider: provider.name }, "pan", { status, last4, nameMatch, ...(duplicate ? { duplicate: true } : {}) });
    conclude(user);
  }
  return kycView(reload(user));
}

/* ---------- Aadhaar through DigiLocker ---------- */

/** `origin` is the calling request's origin; DigiLocker returns the person to `<origin>/verify` unless KYC_DIGILOCKER_REDIRECT_URL is set. */
export async function startDigiLocker(input: User, origin: string): Promise<{ url: string; requestId: string }> {
  const user = reload(input);
  assertCanStart(user, "aadhaar");
  const provider = checkProviders().digilocker;
  expireOpen(user.id, "aadhaar");
  const id = insertCheck({ userId: user.id, step: "aadhaar", provider: provider.name });
  try {
    const s = await provider.start({ redirectUrl: digilockerRedirectUrl(origin), subject: subject(user) });
    setRequest(id, s.requestId, s.expiresAt);
    return { url: s.url, requestId: s.requestId };
  } catch (e) {
    deleteCheck(id);
    throw e;
  }
}

export async function finishDigiLocker(input: User, requestId: string): Promise<KycView> {
  const user = reload(input);
  const provider = checkProviders().digilocker;
  const row = openTry(user, "aadhaar", requestId, provider.name);
  if (row === "settled") return kycView(user);
  const r = await provider.finish(requestId, subject(user));
  if (r.status === "waiting") throw new HttpError(409, WAITING.aadhaar, "kyc_step_waiting");
  if (r.status === "failed") {
    if (completeCheck(row.id, { status: "failed", reasons: [r.reason] })) auditStep(user, row, "aadhaar", { status: "failed" });
    return kycView(reload(user));
  }
  const { nameMatch, reasons } = nameOutcome("aadhaar", r.name, user.name);
  const status = reasons.length ? "review" : "done";
  // Aadhaar: the name, year of birth and last 4 digits only. Never the number, address, photo or document.
  if (completeCheck(row.id, { status, last4: r.last4, name: r.name, yearOfBirth: r.yearOfBirth, nameMatch, reasons })) {
    auditStep(user, row, "aadhaar", { status, last4: r.last4, nameMatch });
    conclude(user);
  }
  return kycView(reload(user));
}

/* ---------- Bank account by reverse penny drop ---------- */

export async function startBank(input: User): Promise<{ upiLink: string; requestId: string; expiresAt: number }> {
  const user = reload(input);
  assertCanStart(user, "bank");
  const provider = checkProviders().bank;
  expireOpen(user.id, "bank");
  const id = insertCheck({ userId: user.id, step: "bank", provider: provider.name });
  try {
    const s = await provider.reversePennyDrop(subject(user));
    setRequest(id, s.requestId, s.expiresAt);
    return { upiLink: s.upiLink, requestId: s.requestId, expiresAt: s.expiresAt };
  } catch (e) {
    deleteCheck(id);
    throw e;
  }
}

export async function finishBank(input: User, requestId: string): Promise<KycView> {
  const user = reload(input);
  const provider = checkProviders().bank;
  const row = openTry(user, "bank", requestId, provider.name);
  if (row === "settled") return kycView(user);
  const r = await provider.result(requestId, subject(user));
  if (r.status === "waiting") throw new HttpError(409, WAITING.bank, "kyc_step_waiting");
  if (r.status === "failed") {
    if (completeCheck(row.id, { status: "failed", reasons: [r.reason] })) auditStep(user, row, "bank", { status: "failed" });
    return kycView(reload(user));
  }
  // Synchronous from here, so a parallel finish can't also save the account.
  if (checkByRequest(user.id, "bank", requestId)?.status !== "started") return kycView(reload(user));
  const { nameMatch, reasons } = nameOutcome("bank", r.holderName, user.name);
  const status = reasons.length ? "review" : "done";
  // Verified only when the step passed. A holder name that went to a person is saved unverified, and
  // confirmBankOnApproval() (approval.ts) marks it verified if the person approves the whole check.
  const account = saveBankAccount({
    userId: user.id,
    ifsc: r.ifsc,
    last4: r.last4,
    holderName: r.holderName,
    verifiedAt: status === "done" ? Date.now() : null,
    providerRef: r.reference ?? requestId,
  });
  completeCheck(row.id, { status, last4: r.last4, name: r.holderName, nameMatch, bankAccountId: account.id, reasons });
  auditStep(user, row, "bank", { status, last4: r.last4, nameMatch });
  conclude(user);
  return kycView(reload(user));
}

/* ---------- The outcome ---------- */

function checkLine(step: CheckStep, row: CheckRow): KycCheck {
  const match = row.name_match ? `name ${row.name_match}` : "";
  let detail: string;
  if (step === "pan") detail = [`PAN XXXX${row.last4 ?? ""}`, match, row.name ? `name on PAN: ${row.name}` : ""].filter(Boolean).join("; ");
  else if (step === "aadhaar")
    detail = [`Aadhaar XXXX XXXX ${row.last4 ?? "????"}`, row.name ? `name: ${row.name}` : "", row.year_of_birth ? `born ${row.year_of_birth}` : "", match].filter(Boolean).join("; ");
  else {
    const account = row.bank_account_id ? bankAccountById(row.bank_account_id) : null;
    detail = [account ? `${account.ifsc} XXXX${account.last4}` : `XXXX${row.last4 ?? ""}`, row.name ? `holder: ${row.name}` : "", match].filter(Boolean).join("; ");
  }
  if (row.review_note) detail = [detail, row.review_note].filter(Boolean).join("; ");
  return { label: LABEL[step], status: row.status === "done" ? "pass" : "warn", detail };
}

/**
 * Runs after each step: all three done → verified; all three finished with one for a person →
 * one needs_review record in the ID review queue. Synchronous, so two finishing steps can't both decide.
 */
function conclude(input: User) {
  const user = reload(input);
  if (user.kyc_status === "verified") return;
  const latest = latestKycRecord(user.id);
  if (latest && (latest.status === "needs_review" || latest.status === "pending")) return;
  const s = stepsState(user);
  if (STEPS.some((k) => s.steps[k].status === "todo" || s.steps[k].status === "failed")) return;
  const rows = STEPS.map((k) => s.rows[k]!);
  const [pan, aadhaar] = rows;
  // Every passed step's document name must still match the account's name now. The name is held once a
  // step has compared it (assertNameChangeAllowed), so this only catches what slipped past that, such as
  // a PAN step from before its name was kept; it then goes to a person rather than passing.
  const drifted = rows.some((r) => r.status === "done" && (!r.name || compareNames(r.name, user.name).result !== "match"));
  const review = drifted || STEPS.some((k) => s.steps[k].status === "review");
  if (drifted) s.reasons.push(NAME_DRIFT);
  const status = review ? "needs_review" : "verified";
  const providers = [...new Set(rows.map((r) => r.provider))].join("+");
  const actor = `kyc:checks:${providers}`;
  const now = Date.now();
  // The reviewer sees the first name that differs; the checks list all three.
  const differing = rows.find((r) => r.status === "review" && r.name)?.name ?? null;
  const recordId = insertKycRecord({
    user_id: user.id,
    doc_type: "pan",
    id_last4: pan.last4,
    id_hash: pan.id_hash,
    name_on_doc: differing ?? aadhaar.name,
    dob: aadhaar.year_of_birth ? String(aadhaar.year_of_birth) : null,
    status,
    provider: `checks:${providers}`,
    checks: STEPS.map((k, i) => checkLine(k, rows[i])),
    reasons: review ? s.reasons : [],
    file_path: null,
    decided_by: review ? null : actor,
    decided_at: review ? null : now,
    created_at: now,
  });
  setUserKyc(user.id, status);
  audit({
    userId: user.id,
    actor,
    actorType: "system",
    action: `kyc.${status}`,
    entityType: "kyc",
    entityId: recordId,
    details: { flow: "steps", steps: Object.fromEntries(STEPS.map((k) => [k, s.steps[k].status])), reasons: review ? s.reasons : [] },
    ts: now,
  });
}
