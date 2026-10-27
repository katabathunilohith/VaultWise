# Account recovery (identity)

Ways back into an account, built on sign-in (`features/auth`) and the ID check (`features/kyc`). Touch points are marked `// identity`.

| Situation | Screen | What happens |
|---|---|---|
| Forgot the password | `auth/forgot` (in `features/auth`) | Firebase emails a reset link. Always "If an account uses this email, a reset link is on its way." |
| Forgot which email | `auth/find` | Show the verified ID (photo or number). The answer is the account's email, masked (`s***k@outlook.com`). "Send a reset link" uses the short-lived `findToken`, so the phone never sees the full email. 5 tries an hour per phone (`x-device-id`) and per network. |
| Can't get into the email any more | `auth/recover` → create a new login → `recovery/claim` | Show the same ID. On a match the old email is told and a person decides (usually within a day; requests run out after 7 days). The claim's `access` says what the new login can do meanwhile. |
| Waiting, read-only (`access: "read_only"`: the ID passed the automatic checks) | bar across the top + `recovery/status` | "Account being checked. Money can't move until a person confirms it's you." Only Home and Vaults load; every other screen says "Available once a person confirms it's you" instead of an error. |
| Waiting, no access (`access: "after_approval"`) | set-up shows the request + `recovery/status` | "A person is checking your ID. You can sign in to your account once they confirm it's you." Never onboarding. |
| Decided | status screen | Approved: full access, the old login stops working. Rejected or cancelled: back to set-up. The status screen lets the person cancel while it waits. |

The bar sits above the app while the account is read-only and steps aside for full-screen screens (modals, sign-in). Below it, screens measure their top inset from the bar, not the status bar. Money moves are refused by the server (`403 recovery_restricted`); the message is in `lib/api/errors.ts`.

Right after a request is sent the status screen opens (live: straight from the request screen; Practice: once the preview has closed, through `intent.ts`). A repeat send that the server answers with `claim_pending` or `has_wallet` (the first try timed out but went through) counts as sent. After "Recover with an ID" makes the new login, set-up goes straight to the ID step. Set-up and the status screen check a waiting request every 30 seconds and follow the decision.

## Practice

Find my account always finds the Practice account; reset links are never sent (the screen says so). A recovery request (Settings, Sign-in and recovery, Recover with an ID, Continue): with "Use a sample ID" it passes the automatic checks, the Practice account turns read-only with the bar, /me shows the first name only and a masked email, and Practice wallet moves are refused (the older Practice money flows don't check it). With any other photo it's "after_approval": the status screens show the no-access wait, while Practice keeps you in the sample account. Either way a pretend person approves about 20 seconds later.

## API

`api.findAccount`, `api.resetPassword` (`{ email }` or `{ findToken }`), `api.recoveryClaim` (`GET { claim | null }`), `api.submitClaim` (`201 { claim }`; 404 `no_match`, 409 `has_wallet` / `claim_pending`), `api.cancelClaim` (`DELETE`; 404 `no_claim`). `x-device-id` is a random id kept in `vw.deviceId`.

## Switch it off

Set `RECOVERY_ENABLED` to `false` in `config.ts`: Find my account, Recover with an ID and "Get my old account back" are hidden. If the server says a request is already waiting, the bar and status still show, since that is the account's real state.

## Touch points

| Where | What |
|---|---|
| `src/app/_layout.tsx` | `RecoveryChrome` around the stack; `recovery/status` (in the app, or signed in with no wallet) and `recovery/claim` (signed in with no wallet, or Practice) |
| `src/features/auth/SetupScreen.tsx` | the waiting request instead of onboarding |
| `src/features/account/settings/SettingsHome.tsx` | `RecoveryRow` while a request waits |
| `src/lib/api/demo/wallet.ts` | `assertPracticeCanMove()` |
| `src/app/auth/find.tsx`, `src/app/auth/recover.tsx`, `src/app/recovery/*` | the routes |

Removing it completely is part of removing sign-in: see `features/auth/README.md`.
