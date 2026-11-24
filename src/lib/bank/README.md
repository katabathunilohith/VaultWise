# Bank accounts

The bank account a person links during the onboarding checks (plan 07): the provider reads it from a ₹1 reverse
penny drop (`src/lib/kyc/checks`). This module only stores and shows it.

## Switch

None of its own. Only the KYC steps flow writes here, so with `KYC_FLOW` unset (the photo flow) the table stays
empty and nothing reads it.

## Data

`bank_accounts (id, user_id, ifsc, account_last4, holder_name, verified_at, provider_ref, created_at)`, created on
first use. **Never the full account number**: providers cut it to the last 4 before it reaches this module, and
`saveBankAccount()` refuses anything longer.

- `verified_at`: when the account was confirmed. Set when the bank step passed (the payment came from it and the
  holder's name matches). When the name went to a person, the account is saved with `verified_at = NULL`, and
  `verifyBankAccount()` sets it when the person approves the whole check (`src/lib/kyc/checks/approval.ts`). A
  rejected check's account stays unverified.
- `provider_ref`: the provider's request id, for support.

## API (`index.ts`)

| Export | What it does |
|---|---|
| `linkedBankAccount(userId)` | The newest account as `{ id, ifsc, last4, masked, holderName, verified, verifiedAt }`, or null |
| `bankAccountById(id)` | The same view for one account |
| `saveBankAccount({ userId, ifsc, last4, holderName, verifiedAt, providerRef })` | Stores an account (IFSC upper-cased) |
| `verifyBankAccount(id, at?)` | Marks an unverified account verified (once); false if it already was |

No route yet: the KYC view shows the last 4 under `steps.bank`.

## Touch points

- `src/lib/kyc/checks/service.ts` saves the account when the bank step finishes.
- `src/lib/kyc/checks/approval.ts` verifies it when a person approves a check whose bank holder name differed.

## Remove

Delete this folder and drop `bank_accounts`. Remove the KYC steps flow first (it saves here).

## Next

The server's "Linked bank" ledger account (`src/lib/ledger.ts`, `src/app/api/v1/accounts/route.ts`) and the phone's
simulated bank still show a placeholder; they can read `linkedBankAccount()` for the name, IFSC and last 4.
