import { getAuthState } from "../auth/firebase"; // identity

/** Every failed call, live or demo, throws this. `message` is safe to show to the customer. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** identity: the server's machine-readable reason (`{ error, code }`), e.g. "kyc_required". */
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * identity: what each sign-in, ID-check and recovery code means, in plain words. These win over the
 * server's own message, so the same situation always reads the same way.
 */
const BY_CODE: Record<string, string> = {
  signed_out: "You're signed out. Sign in again to carry on.",
  no_wallet: "There's no Vaultwise account for this login yet. Set one up first.",
  kyc_required: "Verify your ID to move money. It's in Profile & settings, under Identity verification.",
  recovery_restricted: "Your account is being checked. Money can't move until a person confirms it's you.",
  has_wallet: "This login already has a Vaultwise account.",
  demo_taken: "The sample history is already in use on this server. Turn off \"Start with demo history\" and try again.",
};

/**
 * Some server messages were written for the web app or the ledger and use internal terms.
 * They are rewritten into plain words (DESIGN.md section 5) before anyone sees them.
 */
const PLAIN: [RegExp, string][] = [
  [/insufficient funds/i, "There isn't enough money there for this."],
  [/complete the risk profile first/i, "Finish the short risk quiz first. It's in Vaultwise on the web for now."],
  [/^request failed \(5\d\d\)$/i, "Something went wrong on our side. Try again in a moment."],
  [/^request failed \(4\d\d\)$/i, "That didn't go through. Check the details and try again."],
  [/attestation/i, "Confirm this is a genuine emergency to continue."],
  [/velocity|guardrail/i, "That's past one of your safety limits."],
];

/**
 * identity: true when something can't be shown because a recovery request is waiting for a person
 * (the server answers most reads with 403 recovery_restricted then). Screens show ON_HOLD calmly
 * instead of an error.
 */
export function isRecoveryHold(e: unknown) {
  return e instanceof ApiError && e.code === "recovery_restricted";
}

/** identity: what a screen says while a recovery request waits. */
export const ON_HOLD = {
  title: "Available once a person confirms it's you",
  body: "Your account is being checked, usually within a day. This part opens when they're done.",
};

export function errorMessage(e: unknown, fallback = "Something went wrong. Try again.") {
  // identity: a server that wants sign-in, reached by an app that has no sign-in set up.
  if (e instanceof ApiError && e.code === "signed_out" && !getAuthState().enabled) return "This server needs sign-in, which this app isn't set up for.";
  if (e instanceof ApiError && e.code && BY_CODE[e.code]) return BY_CODE[e.code]; // identity
  const raw = e instanceof Error && e.message ? e.message : "";
  if (!raw) return fallback;
  for (const [re, plain] of PLAIN) if (re.test(raw)) return plain;
  if (e instanceof TypeError) return "Can't reach Vaultwise. Check your connection.";
  return raw;
}
