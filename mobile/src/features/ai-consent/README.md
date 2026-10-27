# AI consent ("Can an AI read what you send?")

Apple's App Store rule 5.1.2(i) (since November 2025) says an app must name the third-party AI and get the person's permission before sending them personal data. Vaultwise sends bills, receipts, ID photos and a savings summary for the weekly tip to Groq. The assistant has its own question (`features/assistant`).

## How it works

- Just before the first bill, receipt or ID photo is sent, `ensureAiAnswer()` opens the `/ai-consent` sheet. It names Groq and lists what goes to it. Closing the sheet sends nothing.
- The answer is kept on the phone (`lib/consents.ts`, `aiChecks` in the session) and changeable in the Trust centre.
- Every request carries `x-ai-consent: yes | no` (`lib/api/http.ts`). The header says "no" until the person says yes.
- With "no", the server (`src/lib/ai-consent.ts`) keeps that request's data away from Groq. A person reads bills and IDs, limit requests use the rules, and the weekly tip is the rule-based one. Recovery requests read by a person don't get early read-only access.
- The question isn't asked in Practice, where nothing leaves the phone, or when the server has no AI key.

## Where it is used

| Where | What |
|---|---|
| `features/proof/withdraw/useWithdrawalSubmission.ts` | before a withdrawal's bill is sent |
| `features/emergency/receipt/ReceiptUpload.tsx` | before an emergency receipt is sent |
| `features/kyc/VerifyIdScreen.tsx` | before an ID is sent for checking |
| `features/recovery/ClaimScreen.tsx`, `FindAccountScreen.tsx` | before an ID photo is sent for recovery |
| `features/account/settings/TrustScreen.tsx` | the "AI reads bills and IDs" switch |
| `app/_layout.tsx`, `app/ai-consent.tsx` | the sheet's route |

Server side: `src/lib/ai-consent.ts`, read in `src/lib/verification/pipeline.ts` (via the `proofs.ai_allowed` column), `src/lib/kyc/analyse.ts`, `src/lib/limits.ts` and `src/lib/engagement.ts`. A client that sends no header (the web app) keeps the old behaviour. Test: `tests/ai-consent.test.ts`.
