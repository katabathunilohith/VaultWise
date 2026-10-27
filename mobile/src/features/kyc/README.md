# Verify your ID (identity)

Before money can move, the server checks who the person is (KYC). This module is the phone's side: the Verify your ID screen (`/verify-id`, a full-screen modal), Home's to-do card and the Settings row. Touch points are marked `// identity`.

- **Screen.** Where the check is (verified, being checked by a person, not accepted with reasons) and the form: the type of ID (the market's list: India Aadhaar, PAN, passport, driving licence, voter ID; elsewhere passport and national ID), a photo (camera or photo library through `lib/media/pick`, so the app lock waits for them), and the number if the person wants to type it.
- **Numbers.** A typed number is checked on the phone with the server's rules (`lib/api/identity-ids.ts`: formats and Aadhaar's Verhoeff checksum), sent once, then cleared. Only the last 4 characters are ever shown (`••••4821`), and screen readers hear "ending in 4 8 2 1".
- **Home.** "Verify your ID to move money" while a live account isn't verified (later: being checked, not accepted). Nothing in Practice.
- **Settings.** Identity verification, with its status.
- **Money moves.** The server answers `403 kyc_required` until the ID is verified; `errorMessage()` turns that into "Verify your ID to move money...".
- **Practice.** The Practice person is verified (passport ••••4821). "Practice the check again" shows the flow: "Use a sample ID" passes at once (a plain card drawn in code that says "SAMPLE ID · Practice only", nothing like a real ID); any other photo goes to a pretend person who approves it about 20 seconds later.

## API

`api.kyc()` → `GET /api/v1/kyc`, `api.submitKyc({ docType, file, idNumber? })` → `POST /api/v1/kyc` (multipart). Both answer `{ status, docType, idLast4, reasons, updatedAt }`. Errors: 400 `invalid_id` / `doc_type_not_accepted` / `file_required`, 409 `kyc_done` / `kyc_in_review`, 429 `rate_limited` (5 a day).

## Switch it off

Set `KYC_ENABLED` to `false` in `config.ts`: no Home card, no Settings row. The server still decides whether money can move (`KYC_ENFORCED` there).

## Touch points

| Where | What |
|---|---|
| `src/features/home/TodoCards.tsx` | `useIdentityTodo()` and its card |
| `src/features/account/settings/SettingsHome.tsx` | `IdentityRow` |
| `src/app/_layout.tsx` | the `verify-id` screen (in-app guard) |
| `src/app/verify-id.tsx` | the route |

Removing it completely is part of removing sign-in: see `features/auth/README.md`.
