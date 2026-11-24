/**
 * The onboarding checks (KYC_FLOW=steps): PAN, then Aadhaar through DigiLocker, then a bank account by
 * reverse penny drop. Each check has its own small interface, so each can come from a different provider
 * (`providers/test.ts` for development, `providers/setu.ts` for Setu's sandbox).
 *
 * Providers return only what this module may keep: names, year of birth, last 4 characters and an IFSC.
 * A full Aadhaar or bank account number never leaves the provider file; a full PAN is passed in only so
 * the provider can look it up.
 */

export type CheckStep = "pan" | "aadhaar" | "bank";

/** What a step looks like to the customer (GET /api/v1/kyc → steps). */
export type StepStatus = "todo" | "done" | "review" | "failed";

export interface StepView {
  status: StepStatus;
  last4?: string;
}

export type KycSteps = Record<CheckStep, StepView>;

/** Who a check is for. Providers that match names on their side may use `name`; the test provider echoes it. */
export interface CheckSubject {
  userId: string;
  name: string;
}

/* ---------- PAN ---------- */

export interface PanResult {
  /** valid: the Income Tax Department knows this PAN. invalid: it exists but isn't valid (e.g. not linked to Aadhaar). */
  status: "valid" | "invalid" | "not_found";
  /** The name registered with the PAN, when valid. Compared with the account name by `compareNames`. */
  registeredName: string | null;
  /** The provider's reference for support, if any. */
  reference?: string | null;
  /**
   * A published test PAN that every tester shares (the test provider, Setu's sandbox). The "same PAN on
   * another account" check is skipped for it, or every second test account would go to a person.
   */
  sample?: boolean;
}

export interface PanVerifier {
  name: string;
  /** `pan` is normalised and format-checked already. Kept in memory only. */
  verify(pan: string, subject: CheckSubject): Promise<PanResult>;
}

/* ---------- DigiLocker (Aadhaar) ---------- */

export interface DigiLockerStart {
  requestId: string;
  /** The provider's hosted DigiLocker page. The person signs in there and allows sharing their Aadhaar. */
  url: string;
  expiresAt: number | null;
}

export type DigiLockerResult =
  | { status: "done"; name: string; yearOfBirth: number | null; last4: string | null; reference?: string | null }
  /** The person hasn't finished on DigiLocker yet. */
  | { status: "waiting" }
  /** A plain sentence the customer may see. */
  | { status: "failed"; reason: string };

export interface DigiLockerClient {
  name: string;
  /** `redirectUrl` is where DigiLocker sends the person back, with `success`, `id` and `scope` in the query. */
  start(input: { redirectUrl: string; subject: CheckSubject }): Promise<DigiLockerStart>;
  finish(requestId: string, subject: CheckSubject): Promise<DigiLockerResult>;
}

/* ---------- Bank account (reverse penny drop) ---------- */

export interface PennyDropStart {
  requestId: string;
  /** A `upi://pay` link for a ₹1 payment from the account to check. The provider refunds it. */
  upiLink: string;
  expiresAt: number;
}

export type BankResult =
  | { status: "done"; holderName: string; ifsc: string; last4: string; reference?: string | null }
  | { status: "waiting" }
  | { status: "failed"; reason: string };

export interface BankVerifier {
  name: string;
  /** Opens a reverse penny drop: the person pays ₹1 from their bank account, the provider reads the account. */
  reversePennyDrop(subject: CheckSubject): Promise<PennyDropStart>;
  /** The outcome of a reverse penny drop opened by `reversePennyDrop`. */
  result(requestId: string, subject: CheckSubject): Promise<BankResult>;
}

export interface CheckProviders {
  pan: PanVerifier;
  digilocker: DigiLockerClient;
  bank: BankVerifier;
}
