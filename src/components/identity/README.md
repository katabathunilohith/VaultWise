# Identity (web): sign-in, ID checks and account recovery

People sign in with an email and password (Firebase). Before money can move out, they verify an ID. If they lose their login, they can find their account with an ID or recover it with a new login. A person checks every ID the automatic check isn't sure about, and every recovery.

The server side lives in `src/lib/auth`, `src/lib/kyc` and `src/lib/recovery` (see their READMEs). This folder is only the web app.

## Switch it off

Two ways, both give back the prototype exactly as it was (no sign-in, the first user is the customer):

- Leave the `NEXT_PUBLIC_FIREBASE_*` settings unset (the default), or
- set `IDENTITY_ENABLED` to `false` in `config.ts`.

With sign-in off, the gate passes everything through, no Firebase code is loaded, and `src/lib/client.ts` sends requests exactly as before. The ID check page (`/verify`), its banner and the settings card still work, because the server can ask for an ID check without sign-in (`KYC_ENFORCED=true`). If the server's users are all verified, as in prototype mode by default, no banner shows.

## Turn it on

Set these in `.env.local` for the same Firebase project the server uses (`FIREBASE_PROJECT_ID`), then restart. `NEXT_PUBLIC_` values are built into the page, so a restart (or a new build) is needed after a change.

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web API key from the Firebase console |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Usually `<project>.firebaseapp.com` (filled in from the project id when left out) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | The project id |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | The web app id |

In the Firebase console, turn on the Email/Password sign-in method and add your web domain to the authorised domains.

The ops console only opens for emails in the server's `ADMIN_EMAILS`, and only once that email is confirmed. New logins get a confirm link by email; Settings has "Send link again" and "I've confirmed it".

## What people see

| Who | Where | What |
|---|---|---|
| Signed out | any page | Sign in, or create a login. "Forgot password?" sends a reset link (`POST /api/v1/recovery/reset { email }`). "Find my account with an ID" shows the masked email and can send a reset link with the `findToken` (`POST /api/v1/recovery/find`, then `/recovery/reset { findToken }`). "Recover with an ID" goes to `/recover`. |
| Signed out | `/recover` | How recovery works, then make a new login (or sign in to one). |
| Signed in, no wallet | `/recover` | Add an ID photo to claim an account (`POST /api/v1/recovery/claim`). Shows a rejected, cancelled or expired claim with a way to try again. |
| Signed in, no wallet, claim waiting | every page | "We're checking it's you": the claim's details and a cancel button. Checks again every 20 seconds while pending and opens the account once approved. The claim's `access` says which kind: `after_approval` (the login isn't tied to the account until a person approves) or `read_only` (the overview and vaults open now, so the screen reloads `/me`). |
| Signed in, no wallet | any other page | Onboarding as before, plus a small "signed in as" chip with "Recover an account instead" and "Sign out". |
| Signed in, no wallet | `/admin/**` | The ops pages in a plain frame (for reviewers who have no wallet of their own). |
| Recovery access | every page | A banner: the account is being checked. Only the pages in `RECOVERY_PAGES` (`config.ts`: overview, vault list, `/recover`) open, matching what the server answers; every other page shows "Available once a person confirms it's you" with See status and Sign out. `/recover` shows the claim's progress, checks again every 20 seconds while pending, reloads `/me` once it's decided, and lets them cancel. |
| ID not verified | every page | A banner: "Verify your ID to move money", or "We're checking your ID". |
| Anyone | `/verify` | Choose an ID type for their market, add a photo and (optionally) the number, then see pending, with a person, verified or rejected with reasons. |
| Anyone | Settings | "Sign-in and ID" card: signed-in email, email confirmed, access, sign out, ID check status. |
| Reviewers | `/admin/kyc`, `/admin/recovery` | Waiting and decided items with the photo, the automated checks, and approve or reject with a note. Linked from the ops overview. |

When a request answers `kyc_required`, a blocked change answers `recovery_restricted`, or (signed in) any request answers `signed_out`, a dialog explains it and offers the next step. Reads that answer `recovery_restricted` don't open the dialog; the placeholders cover them.

If someone is signed in but a token can't be had (offline, a refresh blip), the request fails like a network error. It is never sent unsigned, so a blip never looks like a sign-out.

New passwords need at least 8 characters, with a letter and a number (the same rule as the mobile app). ID numbers are checked on the device with the server's formats, including the Indian passport format for the India market.

With sign-in on, Settings also: signs this browser out after "Close account"; asks for the current PIN to change it (`{ pin, currentPin }`); and, once the ID is verified, shows the name as read-only and doesn't send it (the server answers `name_locked` to a change). Server messages such as `current_pin_required`, `pin_mismatch` and `name_locked` are shown as they are.

## Files

| File | What it does |
|---|---|
| `config.ts` | The switch and the Firebase settings |
| `session.ts` | Lazy Firebase, the session store, `withIdentity()` (adds the token), API error codes, sign-in actions |
| `gate.tsx` | `useIdentityGate()` for the shell, the banners and the error dialog |
| `sign-in.tsx` | Sign in, create login, forgot password, find account, recovery intro; `/sign-in` route |
| `claim-form.tsx` | Send an ID to claim an account (signed in, no wallet) |
| `recovery.tsx` | `/recover` inside the app: claim progress and cancel |
| `kyc.tsx` | `/verify` |
| `id-form.tsx` | ID type, photo and number form shared by the three ID screens. The full number only goes in the request body. |
| `settings.tsx`, `media.tsx` | Settings card; links and images that need the token |
| `admin.tsx` | The two review queues and the links on the ops overview |
| `types.ts` | Server shapes, ID types and formats, tolerant readers |
| `index.ts` | What the shell imports (nothing here imports the shell back) |

## Touch points outside this folder

Each is marked `// identity`.

| Where | What |
|---|---|
| `src/lib/client.ts` | the import, `ApiError.code`, `withIdentity()` around `fetch`, `reportApiError()` |
| `src/components/shell.tsx` | the import, `Me extends IdentityMe`, `useIdentityGate()` and its `meUrl` and `screen()`, the "KYC verified" label, `SignedInChip`, `IdentityMain` around the page |
| `src/app/settings/page.tsx` | `IdentitySettingsCard`, `AuthedDownloadLink` for the two downloads, `signOutNow()` after closing the account, the Current PIN field, and the locked name |
| `src/app/admin/page.tsx` | `IdentityAdminLinks` in the header |
| `src/app/sign-in`, `src/app/recover`, `src/app/verify`, `src/app/admin/kyc`, `src/app/admin/recovery` | the five pages (each one line) |

## Remove it completely

Delete this folder and the five page folders above, then undo each `// identity` line in the table. No web-side storage is used, so there is nothing else to clean up.

## Known gaps

- With sign-in on, plain `<img src="/api/...">`, `<a href="/api/...">` and direct `fetch()` calls don't carry the token. Settings downloads use `AuthedDownloadLink`. Still open: the proof images in `src/components/verification.tsx` (can use `AuthedImage` from `media.tsx`), the sample download in the same file (works without the token, but isn't personalised), and the assistant's streaming `fetch` in `src/app/assistant/page.tsx` (can wrap its options with `withIdentity()`).
