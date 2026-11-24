import type { KycStatus } from "./types";

/**
 * The KYC level stored with each status: 2 verified, 1 waiting (a new sign-up, or a check with a
 * person), 0 rejected. The one place this mapping lives; account creation, the KYC service and the
 * phone's Practice data all follow it.
 */
const LEVEL: Record<KycStatus, number> = { verified: 2, pending: 1, needs_review: 1, rejected: 0 };

export function kycLevelFor(status: KycStatus): number {
  return LEVEL[status];
}
