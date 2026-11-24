import { bankAccount, insertBankAccount, latestBankAccount, markBankAccountVerified, type BankAccountRow } from "./store";

/**
 * Bank accounts: the account a person linked by reverse penny drop during the onboarding checks
 * (src/lib/kyc/checks). What routes and other modules may call.
 */

export interface BankAccountView {
  id: string;
  ifsc: string;
  last4: string;
  /** "XXXX4321": how the number is shown anywhere. */
  masked: string;
  holderName: string;
  verified: boolean;
  verifiedAt: number | null;
}

export function toBankAccountView(r: BankAccountRow): BankAccountView {
  return {
    id: r.id,
    ifsc: r.ifsc,
    last4: r.account_last4,
    masked: `XXXX${r.account_last4}`,
    holderName: r.holder_name,
    verified: r.verified_at !== null,
    verifiedAt: r.verified_at,
  };
}

export function bankAccountById(id: string): BankAccountView | null {
  const r = bankAccount(id);
  return r ? toBankAccountView(r) : null;
}

/** The person's linked bank account, or null. */
export function linkedBankAccount(userId: string): BankAccountView | null {
  const r = latestBankAccount(userId);
  return r ? toBankAccountView(r) : null;
}

/**
 * Saves an account a provider read. `last4` must already be the last 4 digits only: callers never pass
 * a full account number.
 */
export function saveBankAccount(r: { userId: string; ifsc: string; last4: string; holderName: string; verifiedAt: number | null; providerRef: string | null }): BankAccountView {
  if (!/^[0-9A-Z]{4}$/i.test(r.last4)) throw new Error("saveBankAccount takes the last 4 characters only");
  const id = insertBankAccount(r);
  return toBankAccountView(bankAccount(id)!);
}

/**
 * Marks a saved account verified, for an account whose holder name went to a person and the person approved
 * the check (src/lib/kyc/checks/approval.ts). False when it was already verified or doesn't exist.
 */
export function verifyBankAccount(id: string, at = Date.now()): boolean {
  return markBankAccountVerified(id, at);
}

export { ensureBankTables, type BankAccountRow } from "./store";
