/**
 * identity: shapes for sign-in, ID checks (KYC) and account recovery, as the server answers them
 * (build plan, "Server contracts"). ID numbers never come back whole: only the last 4 digits.
 */
import type { Millis, UploadFile } from "./types";

/** Where an account's ID check is. "pending" without a document means nothing was sent yet. */
export type KycStatus = "not_started" | "pending" | "needs_review" | "verified" | "rejected";

/** India: aadhaar, pan, passport, driving_licence, voter_id. Other markets: passport, national_id. */
export type IdDocType = "aadhaar" | "pan" | "passport" | "driving_licence" | "voter_id" | "national_id";

/**
 * How this account verifies (plan 07): "photo" (a photo of an ID, the default) or "steps" (PAN,
 * then Aadhaar through DigiLocker, then a bank account by reverse penny drop; India accounts only).
 */
export type KycFlow = "photo" | "steps";

/** The three onboarding checks, in the order they are done. */
export type KycStepName = "pan" | "aadhaar" | "bank";

/** todo: not done yet. review: a person will check it (a name didn't match). failed: try it again. */
export type KycStepStatus = "todo" | "done" | "review" | "failed";

export interface KycStep {
  status: KycStepStatus;
  /** PAN: its last 4 characters. Aadhaar and bank account: their last 4 digits. Never more. */
  last4: string | null;
}

export type KycSteps = Record<KycStepName, KycStep>;

/** GET/POST /api/v1/kyc. */
export interface KycView {
  status: KycStatus;
  docType: IdDocType | null;
  /** Last 4 characters of the ID number, never more. */
  idLast4: string | null;
  /** Plain-words reasons for needs_review or rejected. */
  reasons: string[];
  updatedAt: Millis | null;
  /** "photo" when the server doesn't say (servers from before plan 07). */
  flow: KycFlow;
  /** Where each step is, in the "steps" flow; null in the "photo" flow. */
  steps: KycSteps | null;
}

/** POST /api/v1/kyc/digilocker/start: the provider's DigiLocker page to open, and the try it belongs to. */
export interface DigiLockerStart {
  url: string;
  requestId: string;
}

/** POST /api/v1/kyc/bank/start: a ₹1 UPI payment from the account to check (refunded). */
export interface BankCheckStart {
  /** A `upi://pay` link. */
  upiLink: string;
  requestId: string;
  /** When the link stops working; null from servers that don't say. */
  expiresAt: Millis | null;
}

/** An ID to check: the photo, and the number if the person typed it (it helps when the photo is hard to read). */
export interface IdSubmission {
  docType: IdDocType;
  file?: UploadFile;
  idNumber?: string;
}

/** POST /api/v1/kyc needs the photo. */
export type KycInput = IdSubmission & { file: UploadFile };

/** POST /api/v1/recovery/find: a photo, a typed number, or both. */
export type FindAccountInput = IdSubmission;

export interface FindAccountResult {
  found: boolean;
  /** For example "s***k@outlook.com". The full email never reaches the phone. */
  maskedEmail?: string;
  canReset: boolean;
  /** Short-lived token for /recovery/reset, so the phone never needs the full email. */
  findToken?: string;
}

/** POST /api/v1/recovery/reset: by email (Forgot password) or by findToken (Find my account). */
export type ResetInput = { email: string } | { findToken: string };

export interface ResetResult {
  ok: true;
  /** True when nothing was really sent (prototype server, or Practice). */
  simulated?: boolean;
}

export type ClaimStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired";

/**
 * What the new login can do while a person decides: "read_only" when the ID passed the automatic
 * checks (the account opens read-only now), "after_approval" when it didn't (no access until a
 * person approves; /me still says there's no account). Null from servers that don't say.
 */
export type ClaimAccess = "read_only" | "after_approval";

/** A recovery claim, as the person who made it sees it. */
export interface RecoveryClaim {
  id: string;
  status: ClaimStatus;
  access: ClaimAccess | null;
  docType: IdDocType | null;
  idLast4: string | null;
  reasons: string[];
  /** The account's own email, masked, which was told about this request. */
  notifiedEmail: string | null;
  createdAt: Millis;
  decidedAt: Millis | null;
  /** Claims nobody decides in 7 days expire. */
  expiresAt: Millis | null;
}

/** POST /api/v1/recovery/claim needs the photo. */
export type ClaimInput = IdSubmission & { file: UploadFile };

/* ---------- additions to /api/v1/me ---------- */

export interface MeAuth {
  mode: "prototype" | "firebase";
  /** "recovery" while a recovery claim is waiting for a person: the account is read-only. */
  access: "full" | "recovery";
  email: string | null;
}

export interface MeKyc {
  status: KycStatus;
  docType?: IdDocType | string;
  idLast4?: string;
}

export interface MeRecovery {
  claimId: string;
  status: ClaimStatus;
  createdAt: Millis;
}
