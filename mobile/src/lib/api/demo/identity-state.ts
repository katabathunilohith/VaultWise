/**
 * identity: the Practice person's ID check and recovery request, kept in the simulator's state
 * (state.ts) so Delete account in Practice resets them with everything else. No imports from
 * state.ts, so the two files can't load each other in a loop.
 */
import type { IdDocType, KycStatus, RecoveryClaim } from "../identity-types";

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
}

const DAY = 86_400_000;

/** The Practice person verified a passport when they joined. */
export function freshIdentity(): DemoIdentity {
  return {
    kyc: { status: "verified", docType: "passport", idLast4: "4821", reasons: [], updatedAt: Date.now() - 120 * DAY, decideAt: null },
    claim: null,
  };
}
