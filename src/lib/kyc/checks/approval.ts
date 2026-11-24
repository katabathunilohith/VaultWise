import { verifyBankAccount } from "../../bank";
import { latestCheck, resetAt } from "./store";

/**
 * What a reviewer's approval of a steps-flow check means for the steps' own records. Called by
 * `decideKyc()` in src/lib/kyc/service.ts (marked `// kyc-checks`); it imports only the store and the
 * bank module, so the KYC service can call it without importing checks/service.ts back.
 */

/**
 * The person approved a steps-flow check (`kyc_records.provider` starting `checks:`): the bank account
 * from the bank step that went with it is now verified. Only the newest bank try made after the last
 * rejection counts (`resetAt()`), and only one made before the record was written, so an account from a
 * try that started before a rejection is never marked verified. Returns the bank account id it marked, or null.
 */
export function confirmBankOnApproval(userId: string, record: { provider: string | null; created_at: number }, now = Date.now()): string | null {
  if (!record.provider?.startsWith("checks:")) return null;
  const row = latestCheck(userId, "bank", resetAt(userId));
  if (!row || !row.bank_account_id || row.created_at > record.created_at) return null;
  if (row.status !== "done" && row.status !== "review") return null;
  return verifyBankAccount(row.bank_account_id, now) ? row.bank_account_id : null;
}
