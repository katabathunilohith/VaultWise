# Verify your ID (identity)

Before money can move, the server checks who the person is (KYC). This module is the phone's side: the Verify your ID screen (`/verify-id`, a full-screen modal), Home's to-do card and the Settings row. Touch points are marked `// identity`.

The server says which way an account verifies (`flow` in `GET /api/v1/kyc`):

- **photo** (the default, and every account outside India): a photo of an ID.
- **steps** (plan 07, `KYC_FLOW=steps` on the server, India accounts): PAN, then Aadhaar through DigiLocker, then a bank account by reverse penny drop. Marked `// kyc-checks` where it touches shared code.

## The photo check

- **Screen.** Where the check is (verified, being checked by a person, not accepted with reasons) and the form: the type of ID (the market's list: India Aadhaar, PAN, passport, driving licence, voter ID; elsewhere passport and national ID), a photo (camera or photo library through `lib/media/pick`, so the app lock waits for them), and the number if the person wants to type it.
- **Numbers.** A typed number is checked on the phone with the server's rules (`lib/api/identity-ids.ts`: formats and Aadhaar's Verhoeff checksum; held to `src/lib/kyc/ids.ts` by `tests/contract/vectors/id-numbers.json`), sent once, then cleared. Only the last 4 characters are ever shown (`••••4821`), and screen readers hear "ending in 4 8 2 1".

## The onboarding steps (kyc-checks)

`StepsFlow.tsx` shows one step at a time under a progress header (`StepsProgress.tsx`: "Step 2 of 3", a three-part bar, and each step done with its last 4, with a person, didn't pass, now, or still to come). The step shown is the first one not finished; one that didn't pass is shown again to retry. Once all three are finished the server decides, and the screen shows the outcome (verified, or a person is checking) with the steps and their last 4s.

| Step | File | What happens |
|---|---|---|
| PAN | `PanStep.tsx` | The format (5 letters, 4 digits, a letter) is checked with `identity-ids.ts`, the PAN is sent once and the field cleared. Done, with a person (the name didn't match: the flow carries on), or didn't pass (try again). |
| Aadhaar | `DigiLockerStep.tsx` | Says what Vaultwise gets (name, year of birth, last 4 digits; never the number, address, photo or document). Opens the provider's DigiLocker page with `expo-web-browser` `openAuthSessionAsync` (ephemeral session), and calls finish when the person is back. Not finished yet: finish again ("I've allowed sharing") or reopen it. |
| Bank account | `BankStep.tsx` | "Pay ₹1 from your UPI app to prove the account is yours; it's refunded." Opens the `upi://pay` link with `expo-linking`; with no UPI app, shows the link to copy. "I've paid" calls finish; a payment that hasn't arrived keeps the try open. The link's expiry is shown as a time. |

- **Leaving the app.** DigiLocker and the UPI app count as the app's own system UI (`withSystemUi`), so on Android the app lock waits for them (90 seconds at most). The open try (its id and the link to reopen, nothing else) is kept on the device (`open-try.ts`, key `vw.kyc.openTry`, wiped by Delete account), so if the lock or the phone closes the screen meanwhile, Verify your ID picks the same try up again and nobody pays ₹1 twice.
- **Errors.** `kyc_step_waiting` keeps the try open with the server's sentence; `kyc_request_expired` and `kyc_request_not_found` start the step again; `kyc_done`, `kyc_in_review`, `kyc_flow_off`, `kyc_step_done` and `kyc_step_order` fetch the view again so the screen catches up; `provider_unavailable` (503) says the check is down for now.
- **DigiLocker's return.** The server sends DigiLocker back to its own web page (`KYC_DIGILOCKER_REDIRECT_URL`), so the person closes the in-app browser themselves and the step finishes then. The browser is opened with the app's link to this screen (`Linking.createURL("verify-id")`) as its return address, so it would close by itself if the server ever sent people there.
- **Logic** without UI is in `steps-model.ts` (current step, PAN format, which errors mean what); the opening of DigiLocker and UPI links in `external.ts`.

## Home, Settings and money

- **Home.** "Verify your ID to move money" while a live account isn't verified (later: being checked, not accepted). Nothing in Practice.
- **Settings.** Identity verification, with its status.
- **Money moves.** The server answers `403 kyc_required` until the ID is verified; `errorMessage()` turns that into "Verify your ID to move money...".

## Practice

The Practice person (India) is verified (passport ••••4821) and verifies with the **steps**, so they can be tried in Practice on a development or preview build. Testers on the Practice-only builds (apk, store) and the tester-live build don't reach them: `KYC_ENABLED` is off there (`config.ts`). "Practice the check again" walks through them, answering like the server's test provider:

- PAN `ABCDE1234F` passes, `ABCDE0000F` has another name on it (a pretend person checks it), any other well-formed PAN isn't found. "Use the sample PAN" fills in the first.
- DigiLocker never opens: the sample answer comes back at once (Aadhaar ending 1234).
- The ₹1 payment never opens a UPI app and nothing is paid: "I've paid" finishes with IFSC HDFC0000001, account ending 4321.
- All three done: verified. With a step in review: a pretend person approves about 20 seconds after the last step.
- Starting again unverifies the Practice person until all three are done (the screen says so), as a person's rejection does on the server.

The photo check stays available in Practice ("Practice the photo check instead"): "Use a sample ID" passes at once (a plain card drawn in code that says "SAMPLE ID · Practice only", nothing like a real ID); any other photo goes to a pretend person who approves it about 20 seconds later. A Practice photo check replaces any steps from before. The steps and open tries are part of the Practice save (`demo/identity-state.ts`, inside the "state" slice), so they survive a reload; saves from before plan 07 get empty steps.

## API

`api.kyc()` → `GET /api/v1/kyc`, `api.submitKyc({ docType, file, idNumber? })` → `POST /api/v1/kyc` (multipart). Both answer `{ status, docType, idLast4, reasons, updatedAt, flow, steps }`; the phone reads a missing `flow` as `"photo"` (then `steps` is null). Errors: 400 `invalid_id` / `doc_type_not_accepted` / `file_required`, 409 `kyc_done` / `kyc_in_review`, 429 `rate_limited` (5 a day).

The steps (each finish answers the same view):

| Call | Route |
|---|---|
| `api.submitPan(pan)` | `POST /api/v1/kyc/pan` `{ pan }` |
| `api.startDigiLocker()` | `POST /api/v1/kyc/digilocker/start` → `{ url, requestId }` (only an http(s) URL is accepted) |
| `api.finishDigiLocker(requestId)` | `POST /api/v1/kyc/digilocker/finish` (60 s timeout) |
| `api.startBankCheck()` | `POST /api/v1/kyc/bank/start` → `{ upiLink, requestId, expiresAt }` (only a `upi://pay` link is accepted) |
| `api.finishBankCheck(requestId)` | `POST /api/v1/kyc/bank/finish` |

## Switch it off

Set `KYC_ENABLED` to `false` in `config.ts`: no Home card, no Settings row. The server still decides whether money can move (`KYC_ENFORCED` there) and which flow an account gets (`KYC_FLOW`).

## Touch points

| Where | What |
|---|---|
| `src/features/home/TodoCards.tsx` | `useIdentityTodo()` and its card |
| `src/features/account/settings/SettingsHome.tsx` | `IdentityRow` |
| `src/app/_layout.tsx` | the `verify-id` screen (in-app guard) |
| `src/app/verify-id.tsx` | the route |
| `src/lib/api/identity.ts`, `identity-types.ts` | the KYC view (`flow`, `steps`) and the five step calls (`// kyc-checks`) |
| `src/lib/api/demo/identity.ts`, `identity-state.ts` | the steps in Practice |

Removing it completely is part of removing sign-in: see `features/auth/README.md`. Removing only the steps: delete `StepsFlow.tsx`, `StepFrame.tsx`, `StepsProgress.tsx`, `PanStep.tsx`, `DigiLockerStep.tsx`, `BankStep.tsx`, `steps-model.ts`, `external.ts` and `open-try.ts`, then the `// kyc-checks` lines in `VerifyIdScreen.tsx`, `lib/api/identity*.ts` and `lib/api/demo/identity*.ts`.
