import { parseJson } from "../db";
import { maskEmail } from "../kyc/ids";
import { CLAIM_TTL_MS, type ClaimRow, type ClaimStatus } from "./claims";
import { userById } from "./id-form";

/** A claim as the claimant sees it (routes and `GET /me`). */

export interface ClaimView {
  id: string;
  status: ClaimStatus;
  /**
   * What the claimant can do while it waits: "read_only" when the automated checks passed (a summary of the
   * account, no money moves); "after_approval" when a person must check first (no access until approved).
   */
  access: "read_only" | "after_approval";
  docType: string;
  idLast4: string | null;
  /** The account's email we told about this claim, masked. */
  notifiedEmail: string | null;
  reasons: string[];
  createdAt: number;
  expiresAt: number;
  decidedAt: number | null;
}

export function claimView(c: ClaimRow): ClaimView {
  // The address stored when the claim was made; older claims fall back to the account's email now
  // (which, after an approval, is the new sign-in's).
  const notified = c.notified_email ?? userById(c.user_id)?.email;
  return {
    id: c.id,
    status: c.status,
    access: c.provisional ? "read_only" : "after_approval",
    docType: c.doc_type,
    idLast4: c.id_last4,
    notifiedEmail: maskEmail(notified),
    reasons: parseJson<string[]>(c.reasons, []),
    createdAt: c.created_at,
    expiresAt: c.created_at + CLAIM_TTL_MS,
    decidedAt: c.decided_at,
  };
}
