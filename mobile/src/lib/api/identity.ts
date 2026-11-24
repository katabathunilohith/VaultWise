/**
 * Identity API (live): sign-in session, KYC and account recovery. The identity module adds its
 * methods here; client.ts spreads them into `live`, and demo/identity.ts implements them for Practice.
 *
 * ID numbers are sent once, in the request that checks them, and never kept on the phone. Answers
 * only ever carry the last 4 characters.
 */
import { installId } from "./device"; // devices: the install id lives there now and goes with every request
import { ApiError } from "./errors";
import { formWith, post, request } from "./http";
import type {
  BankCheckStart,
  ClaimInput,
  ClaimStatus,
  DigiLockerStart,
  FindAccountInput,
  FindAccountResult,
  IdDocType,
  IdSubmission,
  KycInput,
  KycStatus,
  KycStepName,
  KycSteps,
  KycStepStatus,
  KycView,
  RecoveryClaim,
  ResetInput,
  ResetResult,
} from "./identity-types";

/* ---------- this install's id (rate limits on the signed-out recovery routes) ---------- */

/**
 * devices: `x-device-id` now goes with every request (http.ts, from ./device). The recovery routes
 * below still name it, which sends the same value.
 */
export { installId };

/* ---------- forms ---------- */

/** The multipart form the KYC and recovery routes read: docType, optional file, optional idNumber. */
async function idForm({ docType, file, idNumber }: IdSubmission): Promise<FormData> {
  const fields: Record<string, string> = { docType };
  const typed = idNumber?.trim();
  if (typed) fields.idNumber = typed;
  if (file) return formWith(file, fields);
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

/* ---------- answers, read defensively ---------- */

const KYC_STATUSES: KycStatus[] = ["not_started", "pending", "needs_review", "verified", "rejected"];
const CLAIM_STATUSES: ClaimStatus[] = ["pending", "approved", "rejected", "cancelled", "expired"];

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const reasonsOf = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .map((r) => (typeof r === "string" ? r : str((r as { message?: unknown; detail?: unknown })?.message) ?? str((r as { detail?: unknown })?.detail)))
        .filter((r): r is string => !!r)
    : [];

const STEP_NAMES: KycStepName[] = ["pan", "aadhaar", "bank"];
const STEP_STATUSES: KycStepStatus[] = ["todo", "done", "review", "failed"];

/** At most the last 4 letters or digits: anything longer from a server is cut, never shown whole. */
const last4Of = (v: unknown) => {
  const s = str(v)?.replace(/[^0-9A-Za-z]/g, "");
  return s ? s.slice(-4).toUpperCase() : null;
};

/** The three steps, each one missing or unknown read as not done yet. */
export function toKycSteps(raw: unknown): KycSteps {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const steps = {} as KycSteps;
  for (const name of STEP_NAMES) {
    const s = (r[name] && typeof r[name] === "object" ? r[name] : {}) as Record<string, unknown>;
    const status = STEP_STATUSES.includes(s.status as KycStepStatus) ? (s.status as KycStepStatus) : "todo";
    steps[name] = { status, last4: status === "todo" ? null : last4Of(s.last4) };
  }
  return steps;
}

export function toKycView(raw: unknown): KycView {
  const r = (raw ?? {}) as Record<string, unknown>;
  const status = KYC_STATUSES.includes(r.status as KycStatus) ? (r.status as KycStatus) : "not_started";
  // kyc-checks (plan 07): servers from before it send neither field, which means the photo check.
  const flow = r.flow === "steps" ? "steps" : "photo";
  return {
    status,
    docType: (str(r.docType) as IdDocType | null) ?? null,
    idLast4: str(r.idLast4),
    reasons: reasonsOf(r.reasons),
    updatedAt: num(r.updatedAt),
    flow,
    steps: flow === "steps" ? toKycSteps(r.steps) : null,
  };
}

/** Only a web page is ever opened for DigiLocker, never another scheme a bad answer might carry. */
function toDigiLockerStart(raw: unknown): DigiLockerStart {
  const r = (raw ?? {}) as Record<string, unknown>;
  const url = str(r.url);
  const requestId = str(r.requestId);
  if (!url || !/^https?:\/\/\S+$/i.test(url) || !requestId) throw new ApiError("DigiLocker didn't start. Try again in a moment.", 502);
  return { url, requestId };
}

/** Only a UPI payment link is ever handed to another app. */
function toBankCheckStart(raw: unknown): BankCheckStart {
  const r = (raw ?? {}) as Record<string, unknown>;
  const upiLink = str(r.upiLink);
  const requestId = str(r.requestId);
  if (!upiLink || !/^upi:\/\/pay\?\S+$/i.test(upiLink) || !requestId) throw new ApiError("The ₹1 payment didn't start. Try again in a moment.", 502);
  return { upiLink, requestId, expiresAt: num(r.expiresAt) };
}

/** A claim from `{ claim: {...} }`, the claim itself, or null when there is none. */
export function toClaim(raw: unknown): RecoveryClaim | null {
  if (!raw || typeof raw !== "object") return null;
  const outer = raw as Record<string, unknown>;
  const r = (outer.claim !== undefined ? outer.claim : outer) as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const id = str(r.id) ?? str(r.claimId);
  if (!id) return null;
  return {
    id,
    status: CLAIM_STATUSES.includes(r.status as ClaimStatus) ? (r.status as ClaimStatus) : "pending",
    access: r.access === "read_only" || r.access === "after_approval" ? r.access : null,
    docType: (str(r.docType) as IdDocType | null) ?? null,
    idLast4: str(r.idLast4),
    reasons: reasonsOf(r.reasons),
    notifiedEmail: str(r.notifiedEmail),
    createdAt: num(r.createdAt) ?? Date.now(),
    decidedAt: num(r.decidedAt),
    expiresAt: num(r.expiresAt),
  };
}

/* ---------- the API ---------- */

export const identityLive = {
  /** Where this account's ID check is. */
  kyc: async (): Promise<KycView> => toKycView(await request<unknown>("/kyc")),
  /** Sends an ID to be checked. The answer is the check's outcome (or that a person will look). */
  submitKyc: async (input: KycInput): Promise<KycView> => toKycView(await request<unknown>("/kyc", { method: "POST", body: await idForm(input) })),
  /*
   * kyc-checks (plan 07), the "steps" flow: PAN, then Aadhaar through DigiLocker, then a bank account.
   * Each finishing call answers the same view as GET /kyc. Errors: 400 invalid_id; 409 kyc_step_order,
   * kyc_step_done, kyc_step_waiting (DigiLocker or the ₹1 payment isn't finished yet),
   * kyc_request_expired, kyc_done, kyc_in_review, kyc_flow_off; 404 kyc_request_not_found;
   * 429 rate_limited (5 tries a step a day).
   */
  /** Step 1. The PAN is sent once, here, and never kept on the phone. */
  submitPan: async (pan: string): Promise<KycView> => toKycView(await post<unknown>("/kyc/pan", { pan })),
  /** Step 2 begins: the provider's DigiLocker page, where the person allows sharing their Aadhaar. */
  startDigiLocker: async (): Promise<DigiLockerStart> => toDigiLockerStart(await post<unknown>("/kyc/digilocker/start")),
  /** Step 2 ends, once the person is back from DigiLocker. Fetching the Aadhaar can take a while. */
  finishDigiLocker: async (requestId: string): Promise<KycView> =>
    toKycView(await request<unknown>("/kyc/digilocker/finish", { method: "POST", body: JSON.stringify({ requestId }) }, { timeoutMs: 60_000 })),
  /** Step 3 begins: a ₹1 UPI payment from the account to check (reverse penny drop). */
  startBankCheck: async (): Promise<BankCheckStart> => toBankCheckStart(await post<unknown>("/kyc/bank/start")),
  /** Step 3 ends, once the person has paid. */
  finishBankCheck: async (requestId: string): Promise<KycView> =>
    toKycView(await request<unknown>("/kyc/bank/finish", { method: "POST", body: JSON.stringify({ requestId }) }, { timeoutMs: 30_000 })),
  /** Signed out: looks for the account that verified this ID. 5 tries an hour per phone. */
  findAccount: async (input: FindAccountInput): Promise<FindAccountResult> => {
    const r = await request<FindAccountResult>("/recovery/find", {
      method: "POST",
      body: await idForm(input),
      headers: { "x-device-id": await installId() },
    });
    return { found: !!r?.found, maskedEmail: r?.maskedEmail || undefined, canReset: !!r?.canReset, findToken: r?.findToken || undefined };
  },
  /** Asks for a password-reset email. Always answers ok, whether or not the account exists. */
  resetPassword: async (input: ResetInput): Promise<ResetResult> => {
    const r = await request<ResetResult | null>("/recovery/reset", {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "x-device-id": await installId() },
    });
    return { ok: true, simulated: !!r?.simulated };
  },
  /** The signed-in person's latest recovery request, if any. */
  recoveryClaim: async (): Promise<RecoveryClaim | null> => toClaim(await request<unknown>("/recovery/claim")),
  /** A new login asks for an existing account back, by showing the ID that account verified. */
  submitClaim: async (input: ClaimInput): Promise<RecoveryClaim | null> =>
    toClaim(await request<unknown>("/recovery/claim", { method: "POST", body: await idForm(input), headers: { "x-device-id": await installId() } })),
  cancelClaim: async (): Promise<{ ok: true }> => {
    await request<unknown>("/recovery/claim", { method: "DELETE" });
    return { ok: true };
  },
};
