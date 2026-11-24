/**
 * identity: the Practice person's ID check and recovery request, kept in the simulator's state
 * (state.ts) so Delete account in Practice resets them with everything else, and the Practice save
 * (persist.ts, the "state" slice) keeps them across a reload. No imports from state.ts, so the two
 * files can't load each other in a loop.
 */
import type { IdDocType, KycStatus, KycStepName, KycStepStatus, RecoveryClaim } from "../identity-types";

/** kyc-checks (plan 07): one onboarding step, as the Practice test provider left it. */
export interface DemoStep {
  status: KycStepStatus;
  last4: string | null;
  /** Plain-words reasons while it's "review" or "failed". */
  reasons: string[];
  updatedAt: number | null;
  /** The DigiLocker or bank try that finished it, so finishing the same try again just answers. */
  requestId: string | null;
  /** Bank account only: the IFSC the reverse penny drop read (the view never carries it). */
  ifsc?: string | null;
}

/** An open DigiLocker or ₹1 payment try: a finish has to name it, before it expires. */
export interface DemoOpenTry {
  requestId: string;
  expiresAt: number;
}

export interface DemoIdentity {
  kyc: {
    status: KycStatus;
    docType: IdDocType | null;
    idLast4: string | null;
    reasons: string[];
    updatedAt: number | null;
    /** When the pretend reviewer decides a check that went to a person. */
    decideAt: number | null;
  };
  /** The latest recovery request; a pretend reviewer approves it at `decideAt`. */
  claim: (RecoveryClaim & { decideAt: number | null }) | null;
  /** kyc-checks: PAN, Aadhaar through DigiLocker, bank account. Saves from before plan 07 lack it. */
  steps: Record<KycStepName, DemoStep>;
  /** kyc-checks: the open DigiLocker and bank tries. */
  open: { aadhaar: DemoOpenTry | null; bank: DemoOpenTry | null };
}

const DAY = 86_400_000;

export const freshStep = (): DemoStep => ({ status: "todo", last4: null, reasons: [], updatedAt: null, requestId: null });

export function freshSteps(): Record<KycStepName, DemoStep> {
  return { pan: freshStep(), aadhaar: freshStep(), bank: freshStep() };
}

/**
 * The Practice person verified a passport when they joined (before the onboarding steps existed),
 * so their steps are all still to do. "Practice the check again" walks them through the steps.
 */
export function freshIdentity(): DemoIdentity {
  return {
    kyc: { status: "verified", docType: "passport", idLast4: "4821", reasons: [], updatedAt: Date.now() - 120 * DAY, decideAt: null },
    claim: null,
    steps: freshSteps(),
    open: { aadhaar: null, bank: null },
  };
}
