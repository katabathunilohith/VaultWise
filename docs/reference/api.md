# API reference (`/api/v1`)

Every HTTP route the Next.js server exposes, as of commit `012a9fc` plus the server work for plans 03, 05, 06 and 07 (2026-11-22) and the external review fixes (2026-11-24: the MPIN on SIPs and Satellite opt-in, the ID check on money in, per-customer strategies).
The web app in `src/app` and the phone app in `mobile/` both call these routes.

With the payout planner added on 27 November 2026, [the API](../../src/app/api/v1) has 83 route files and 96 method and path pairs.

## How a route works

Every route file exports one function per HTTP method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
Each function is wrapped in `handle()` from [`src/lib/api.ts`](../../src/lib/api.ts).

### `handle()`

`handle(fn)` returns an async route handler that does three things:

1. **Applies the general rate limit per client address** (`limitClient()`), before the route runs, when `clientIp()` knows the address (only behind a trusted proxy). See [running-online.md](../features/running-online.md).
2. **Keeps the request headers for the call.** If the first argument is a `Request`, it runs `fn` inside
   `withRequest(req, ...)` ([`src/lib/auth/context.ts`](../../src/lib/auth/context.ts)). This stores the headers in an
   `AsyncLocalStorage`, so library code can read `Authorization`, `x-ai-consent` and `x-device-id` without the request
   being passed down. Outside `handle()`, `requestHeaders()` falls back to `next/headers`, then to empty headers.
3. **Turns thrown errors into JSON.** Any error thrown inside `fn` is caught and mapped by `errorResponse()`:

| Error class | Status | Body |
|---|---|---|
| `HttpError` ([`src/lib/users.ts`](../../src/lib/users.ts)) and its subclasses `WalletError`, `MpinError`, `DeviceError`, `OtpError`, `RateLimitError` | the error's `status` | `{ ...extra, error, code }`: `code` when the error has one, plus any extra fields the error carries (for example `triesLeft`, `lockedUntil`, `trustableAt`, `retryAt`, `reason`). A 429 from `RateLimitError` also sets the `Retry-After` header (seconds). |
| `LedgerError` ([`src/lib/ledger.ts`](../../src/lib/ledger.ts)) | 400 | `{ error }` |
| `AiError` ([`src/lib/groq.ts`](../../src/lib/groq.ts)) | 503 | `{ error: "AI is unavailable right now: <reason>. Please try again later." }` |
| `ZodError` (bad body) | 400 | `{ error: "path: message; path: message" }` |
| anything else | 500 | `{ error: "Something went wrong. Try again.", code: "server_error", errorId }`. The exception's text is never sent; it is logged as `[vaultwise] server_error <errorId>: …`. `errorId` is 16 hex characters. |

### The common error shape

Errors always come back as JSON: `{ "error": "Plain-English message" }`, plus `"code"` when a client may need to branch on it.
Clients show `error` to people and switch on `code`. The phone app does this in [`mobile/src/lib/api/http.ts`](../../mobile/src/lib/api/http.ts).

Codes in use (grep `HttpError(`, `WalletError(`, `MpinError(`, `DeviceError(`, `OtpError(` and `RateLimitError` in `src/lib` and `src/app`):

| Code | Status | Extra fields | Meaning |
|---|---|---|---|
| `server_error` | 500 | `errorId` | An unexpected error. Quote the `errorId` to find the details in the server log. |
| `signed_out` | 401 | | Firebase mode: no Bearer token, or the token is invalid; or a sign-in (the token's `auth_time`) older than the account's last device sign-out, from anything but a trusted signed-in device. Sign in again. |
| `no_wallet` | 401 (prototype) / 404 (firebase) | | The caller has no wallet yet. Finish onboarding. |
| `recovery_restricted` | 403 | | The sign-in has provisional recovery access, and this route doesn't allow it. |
| `kyc_required` | 403 | | A route whose KYC gate is on (money out, investing, and money in from the linked bank), and the account's ID isn't verified. |
| `admin_only` | 403 | | Firebase mode: the email isn't verified or isn't in `ADMIN_EMAILS`. |
| `name_locked` | 403 | | `PATCH /me`: the name matches a verified ID and can't change. |
| `name_in_check` | 409 | | `PATCH /me`: an ID check is using the name (a check pending or with a person, or a steps-flow step that compared it). |
| `mpin_required` | 401 | | A money action without `pin`. |
| `mpin_wrong` | 403 | `triesLeft` | Wrong MPIN. With `MPIN_ENFORCED=false` only the checks that always need the MPIN answer it. |
| `mpin_locked` | 423 | `lockedUntil` (ms) | Too many wrong MPIN tries. The message says money moves are locked, or with `MPIN_ENFORCED=false` that anything that needs the MPIN is. |
| `mpin_weak` | 400 | `reason` (`length`, `repeated`, `sequence`, `common`, `birth_date`) | Choosing a weak MPIN (sign-up, change, reset). |
| `device_untrusted` | 403 | `trustableAt` (ms, or null when waiting won't help) | A new device over the money-out cap, or trying a change only a trusted device may make. |
| `device_revoked` | 401 | | Any request from a signed-out device. |
| `device_unknown` | 400 | | Trusting a device (or asking for its code) without a recorded device id: no `x-device-id`, or one the new-device limit didn't record. |
| `device_not_found` | 404 | | Signing out a device that isn't on this account. |
| `push_token_invalid` | 400 | | Not an Expo push token. |
| `otp_unavailable` | 503 | | No SMS sender set up (`OTP_MODE`). |
| `otp_send_failed` | 502 | | The SMS provider refused or didn't answer. |
| `otp_rate_limited` | 429 | `retryAt` (ms) | 5 codes in the last hour for this person (or from this person to one number), or 15 `phone_verify` codes to this number from accounts that haven't verified it. |
| `otp_not_found` | 404 | | Not this person's code. |
| `otp_wrong` | 400 | `triesLeft` | Wrong code, or not 6 digits. |
| `otp_exhausted` / `otp_expired` / `otp_used` | 410 | | The code is used up, over 5 minutes old, or already used or replaced. |
| `verification_invalid` | 400 | | A verification token that is unknown, used, expired, another person's or for another purpose. |
| `phone_invalid` | 400 | | Not a full international number. |
| `phone_required` | 409 | | A code for `device_trust` or `mpin_reset` without a verified number. |
| `phone_recently_changed` | 403 | `allowedAt` (ms) | `POST /otp/send` (`mpin_reset`) or `POST /mpin/reset` within 72 hours of the verified number being added or changed. |
| `ai_consent_required` | 403 | | `POST /assistant` without `x-ai-consent: yes`. |
| `has_wallet` | 409 | | `POST /onboarding` or `POST /recovery/claim` (firebase): the sign-in already has a wallet. A claim checks again inside the transaction that records it, so a wallet opened while the card was being read is caught too. |
| `claim_pending` | 409 | | A recovery claim is already waiting for this sign-in (checked again inside the claim's transaction, and by a unique index). |
| `claimant_has_wallet` | 409 | | `POST /admin/recovery/[id]`: the claimant's sign-in got another wallet while the claim waited. |
| `no_claim` | 404 | | `DELETE /recovery/claim`: nothing to cancel. |
| `no_match` | 404 | | Recovery claim: no verified wallet matches the ID. |
| `not_available` | 400 | | Recovery claim routes in prototype mode. |
| `recovery_off` | 404 | | `RECOVERY_ENABLED=false`. |
| `email_required` | 400 | | `POST /recovery/reset` with neither `email` nor `findToken`. |
| `rate_limited` | 429 | `Retry-After` header from the shared limiter only | The general limit (per address or per person), photo uploads (20 an hour), recovery limits, KYC photo checks (5 a day) or KYC steps (5 tries per step a day). |
| `doc_type_not_accepted` / `bad_form` / `file_required` | 400 | | KYC and recovery ID forms. |
| `invalid_id` / `id_number_needed` | 400 | | The ID number (or PAN) is invalid or couldn't be read. |
| `kyc_done` / `kyc_in_review` | 409 | | `POST /kyc` or a KYC step when the ID is already verified or waiting for a person. |
| `kyc_flow_off` | 409 | | A KYC step route on an account that uses the photo flow. |
| `kyc_flow_steps` | 409 | | `POST /kyc` on an account that uses the steps flow. |
| `kyc_step_order` / `kyc_step_done` | 409 | | A KYC step before the previous one is finished, or one already done. |
| `kyc_step_waiting` | 409 | | KYC finish: DigiLocker not finished, or the ₹1 payment hasn't arrived. |
| `kyc_request_expired` | 409 | | KYC finish: the request expired or a newer one replaced it. |
| `kyc_request_not_found` | 404 | | KYC finish: not this account's request. |
| `provider_unavailable` | 503 | | The KYC checks provider is down or not set up. |
| `already_decided` | 409 | | Admin KYC decision on a check that is already decided. |
| `server_config` | 500 | | `IDENTITY_SECRET` is missing in firebase mode or production; the KYC test provider or Setu's sandbox is on a production server without `KYC_CHECKS_TEST_ALLOWED=true`; or Setu runs on a production server without an https `SETU_BASE_URL`. |
| `wallet_off` | 404 | | `WALLET_ENABLED=false` (top-up, move, spend, settings). |
| `bad_amount` / `bad_payee` / `insufficient_funds` / `vault_closed` / `daily_limit` | 400 | | Wallet moves. |
| `limit_raise_locked` | 409 | | Wallet daily limit raised or turned off within 30 days. |
| `bad_limit` | 400 | | `?limit=` on `/activity`, `/audit/[userId]` or `/alerts` isn't a whole number from 1 (`limitParam()` in `src/lib/api.ts`). |
| `missing_answer` | 400 | | `POST /invest/profile`: not every risk question has a valid answer. |
| `already_appealed` | 409 | | `POST /proofs/{id}/appeal`: this check was already appealed once. |
| `appeal_funds_unavailable` | 409 | | `POST /proofs/{id}/appeal`: the vault no longer has the withdrawal's amount available, so it can't be held again for another look. Add the money back, then appeal. |
| `bad_start_date` | 400 | | `POST /invest/core/sip`: `startDate` isn't a date (for example `2026-12-01`). |
| `flag_not_found` / `flag_closed` | 404 / 409 | | `POST /admin/flags/{id}`: unknown flag, or one already resolved or dismissed. |

The codes `current_pin_required` and `pin_mismatch` are gone: a PIN change now answers the MPIN codes above.

Many other `HttpError`s have no code (for example `404 "Proof not found"`, or `409` when `payoutWithdrawal()` meets a withdrawal that can't be paid). Their status still applies.

### Who can call a route

The "Who can call" column comes from the `customer({...})` and `admin()` calls in each route.
Both are in [`src/lib/api.ts`](../../src/lib/api.ts). They call `resolveCustomer()` and `requireAdmin()` in
[`src/lib/auth/session.ts`](../../src/lib/auth/session.ts).

The server runs in one of two modes ([`src/lib/auth/config.ts`](../../src/lib/auth/config.ts)):

- **Prototype mode** (`FIREBASE_PROJECT_ID` unset): no sign-in. The first user in the `users` table is the customer. Admin routes are open.
- **Firebase mode** (`FIREBASE_PROJECT_ID` set): every customer and admin request needs `Authorization: Bearer <Firebase ID token>`.
  The token's uid is looked up in the `identities` table to find the wallet.

| Label | Code | What it means |
|---|---|---|
| public | no `customer()` / `admin()` | Anyone. No sign-in and no wallet needed. |
| signed-in | `signedIn()` or `session()` only | Firebase mode needs a valid token, but no wallet. Prototype mode is open. |
| customer read | `customer({ access: "read" })` | Needs a wallet. A sign-in with provisional recovery access gets `403 recovery_restricted`. |
| customer read + recovery | `customer({ access: "read", recovery: true })` | As above, but a sign-in with provisional recovery access is let in (read-only summary). |
| customer write | `customer()` (access defaults to `"write"`) | Needs a wallet with full access. |
| KYC gate | `customer({ kyc: true })` | Customer write, plus `kyc_status = 'verified'`. The ID check is skipped only when `KYC_ENFORCED=false`. |
| money: `<action>` | `customer({ money: "<action>" })` | Customer write, plus the KYC gate when the action's entry in [`src/lib/money-routes.ts`](../../src/lib/money-routes.ts) says `kyc: true`. When the entry says `mpin: true`, the route then checks the body's `pin` with `requireMpin()` (see "The `pin` field" below). Money in from the linked bank (`moneyIn: true`) takes the KYC gate only, never the MPIN. A route that moves money on some requests only (`POST /vaults` with `initialDeposit`) applies the gate with `moneyGate(user, "<action>")` from `src/lib/api.ts` once it has read the body. |
| admin | `admin()` | Prototype: open, and the reviewer is `ops.reviewer@vaultwise`. Firebase: a verified email in `ADMIN_EMAILS`; the reviewer is that email. |

**tick** in the table means the route runs the lazy scheduler (`tick()` in [`src/lib/scheduler.ts`](../../src/lib/scheduler.ts)) before it answers.
`customer()` ticks unless the route passes `tick: false`. A tick runs due auto-saves (from the bank or the wallet), expires stale withdrawals,
reverts expired emergency limit increases, settles held emergency releases, writes the daily audit anchor when one is due (`anchorAuditIfDue()`, [`src/lib/audit-anchors`](../../src/lib/audit-anchors/README.md)) and runs due SIPs. Each auto-save run from the wallet commits together with its move of `next_run_at`.

Every request that finds a wallet with full access also records the calling device (`touchDevice()` from `session()`; not for a recovery claimant). A signed-out device gets `401 device_revoked` on every route, and in firebase mode a sign-in older than the account's last device sign-out gets `401 signed_out` unless it comes from a trusted device. In firebase mode `session()` also applies the general rate limit per person before the device is recorded, so it covers every customer route and `GET /me` (a recovery claimant is counted under its own sign-in); `admin()` applies it per reviewer.

### The `pin` field on money routes

Money routes accept the MPIN as `pin` in the JSON body (a form field on `POST /limits/emergency`). It is an optional string of at most 12 characters; `requireMpin()` decides whether it is needed and right, **before** any money moves. Without it: `401 mpin_required`; wrong: `403 mpin_wrong` with `triesLeft`; locked: `423 mpin_locked` with `lockedUntil`. With `MPIN_ENFORCED=false` money moves don't require it (and a PIN sent during a lock isn't checked); Tier 2 emergency, changing the PIN, changing the phone number, and trusting and signing out devices still check it, lock and `triesLeft` included. The full rules are in [mpin.md](../features/mpin.md).

| Action | Route | When the MPIN is asked | Also |
|---|---|---|---|
| `withdraw` | `POST /vaults/[id]/withdrawals` | always | KYC gate; new-device cap |
| `wallet_spend` | `POST /wallet/spend` | always | KYC gate; new-device cap |
| `wallet_cash_out` | `POST /wallet/cash-out` | always | KYC gate; new-device cap |
| `wallet_move` | `POST /wallet/move` | always | KYC gate |
| `wallet_limit_raise` | `PUT /wallet/settings` | raising the daily limit, or turning it off | |
| `emergency` | `POST /emergency/withdrawals` | every tier | KYC gate; new-device cap |
| `limits_loosen` | `PUT /limits`, `POST /limits/emergency` | any limit going up; every emergency limit request | |
| `invest_buy` | `POST /invest/core/buy` | always | KYC gate |
| `invest_sip` | `POST /invest/core/sip` | setting a plan up, or a change that moves more money: more per month (weekly counts as 52/12 a month) or a `startDate` before the next debit (`sipNeedsMpin()` in [`src/lib/invest/sip-rule.ts`](../../src/lib/invest/sip-rule.ts)). Lowering it needs none; nor does pausing it (`DELETE`) | KYC gate |
| `satellite_opt_in` | `POST /invest/satellite/opt-in` | always (opting in and every later allocation) | KYC gate |
| `close_account` | `POST /reset` | firebase mode only | |
| `mpin_change` | `POST /mpin` (`currentPin`), `PATCH /me` (`currentPin`) | always | |
| `device_trust` | `POST /devices/trust` | always, even in rollback mode | |
| `device_revoke` | `POST /devices/[id]/revoke` | always, even in rollback mode | |
| `phone_change` | `POST /me/phone` | always, even in rollback mode | replacing a verified number needs a trusted device |
| `wallet_top_up` | `POST /wallet/top-up` | never (money in) | KYC gate |
| `vault_deposit` | `POST /vaults/[id]/deposits`; `POST /vaults` with `initialDeposit` | never (money in) | KYC gate |
| `bank_simulate` | `POST /accounts/simulate` | never (money in) | KYC gate |
| `roundup_sweep` | `POST /accounts/sweep` | never (money in) | KYC gate |

The **new-device cap** (`assertDeviceMayMove()`, checked before the MPIN) answers `403 device_untrusted` with `trustableAt` when a device that isn't trusted yet moves more than about USD 50 in one go ([devices-alerts-otp.md](../features/devices-alerts-otp.md)).

### Request headers

| Header | Sent by | Read by | Effect |
|---|---|---|---|
| `Authorization: Bearer <token>` | Web app (firebase mode) and phone app (signed in, and only to the server the login belongs to) | `bearerToken()` in [`src/lib/auth/context.ts`](../../src/lib/auth/context.ts) | Firebase mode: identifies the caller. Ignored in prototype mode. |
| `x-ai-consent: yes \| no` | Phone app, on every request ([`mobile/src/lib/api/http.ts`](../../mobile/src/lib/api/http.ts)), and the web app, on every request ([`src/lib/client.ts`](../../src/lib/client.ts), from [`src/components/ai-consent.tsx`](../../src/components/ai-consent.tsx)). Both send `no` until the person says yes. | `aiConsented()` in [`src/lib/ai-consent.ts`](../../src/lib/ai-consent.ts) | Only `yes` lets that request's data reach the AI provider. Otherwise: proof uploads are stored with `proofs.ai_allowed = 0` and a person reads them; KYC and recovery ID photos skip AI reading; emergency limit requests skip the AI assessment; the weekly insight uses the rule-based text and isn't cached; `POST /assistant` answers `403 ai_consent_required`. **A missing header counts as no.** |
| `x-device-id` | Phone app, on every request; the web app with sign-in on (a random `web-…` id in localStorage, [`src/components/identity/device.ts`](../../src/components/identity/device.ts)) | `readDeviceHeaders()` in [`src/lib/devices/rules.ts`](../../src/lib/devices/rules.ts); `clientKeys()` in [`src/lib/auth/context.ts`](../../src/lib/auth/context.ts) | Identifies the device for the device rules (8 to 100 characters of `A-Z a-z 0-9 . _ : -`; anything else counts as no device). In firebase mode a request without one is an untrusted device that never cools down; in prototype mode it counts as trusted. An account records at most 5 new ids an hour and 20 signed in; past that a new id isn't recorded and counts as an untrusted request without a device, in both modes. Also an extra rate-limit key for the recovery routes, trimmed to 100 characters. |
| `x-device-platform` | Phone app; the web app sends `web` with sign-in on | `readDeviceHeaders()` | `ios`, `android` or `web`, stored on the device row. Anything else is stored as null. |
| `x-app-version` | Phone app | `readDeviceHeaders()` | Stored on the device row (1 to 32 characters of `0-9 A-Z a-z . + _ -`). |
| `cf-connecting-ip`, `x-real-ip`, `x-forwarded-for` | Proxies | `clientIp()` in [`src/lib/auth/context.ts`](../../src/lib/auth/context.ts) | The client IP used as a rate-limit key, only when the deployment trusts a proxy: with `TRUST_PROXY_HEADER` only the named header (`cf-connecting-ip` or `x-real-ip`); with `TRUST_PROXY_HOPS` ≥ 1, `cf-connecting-ip`, then `x-real-ip`, then the trusted `x-forwarded-for` hop. With neither set, all three are ignored. |
| `x-vercel-ip-country`, `cf-ipcountry`, `cloudfront-viewer-country`, `x-country-code`, `accept-language` | CDN, browser | `GET /region` | Region guess for onboarding. |

In development (not `NODE_ENV=production`), [`next.config.ts`](../../next.config.ts) adds CORS headers to `/api/*`.
They allow `MOBILE_DEV_ORIGIN` (default `http://localhost:8081`, the Expo web preview) and the headers
`Content-Type, Authorization, X-Device-Id, X-AI-Consent, X-Device-Platform, X-App-Version`.
In production there is no CORS, and every response carries the security headers listed in [running-online.md](../features/running-online.md).

### Money units and other conventions

- **Request amounts are major units** (for example `12.5` means 12.50). Routes convert them with `minor()` in `src/lib/api.ts`, which also rejects zero, negative and non-finite numbers.
  `PUT /limits`, `POST /limits/emergency` and `GET /invest/core/projection` do their own `× 100` and allow 0.
- **The payout planner accepts integer minor units in both directions.** For example, a ₹125.50 bill is sent as `12550`. Each saved plan belongs to a single account currency.
- **Response amounts are integer minor units** (cents, pence and so on). The `currency` field says which currency.
- Uploads are `multipart/form-data` with a `file` field. `POST /vaults/[id]/proofs`, `POST /emergency/[id]/receipt`, `POST /kyc` and `POST /limits/emergency` share a limit of 20 per person per hour (`limitUploads()`). An upload counts only once its route accepts it: the proof and receipt routes first check that one is left (`assertUploadsLeft()`, 429 before the body is read) and count once the withdrawal or request is known to take the file; `POST /kyc` refuses a steps-flow account before counting; `POST /limits/emergency` counts only when a file is sent.
- Times in new fields (`lockedUntil`, `trustableAt`, `retryAt`, `expiresAt`, `firstSeen`, `createdAt`) are Unix milliseconds.
- `maxDuration` is 90 seconds on `kyc`, `limits/emergency`, `vaults/[id]/proofs`, `emergency/[id]/receipt`, `invest/satellite/backtest`, `invest/satellite/run`,
  `recovery/find` and `recovery/claim`, 120 seconds on `onboarding`, 60 seconds on `kyc/digilocker/finish`, and 30 seconds on `kyc/pan`, `kyc/digilocker/start`, `kyc/bank/start` and `kyc/bank/finish`.
- Proof uploads answer `202` with `{ id, status: "processing" }`. Verification then runs in the background through `after(() => runPipeline(proofId))`.

## Routes

Paths below are relative to `/api/v1`.

### Session, profile and onboarding

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/me` | signed-in (uses `session()`, works without a wallet) | none | No wallet: `{ onboarded: false, aiEnabled, jurisdictions[], countries[], auth }`. With a wallet: `{ onboarded: true, auth: { mode, access, email }, kyc: { status, docType?, idLast4? }, recovery?: { claimId, status, createdAt }, aiEnabled, mpin: { upgradeDue, lockedUntil, enforced }, phone: { number (masked), verified }, device?: { registered, trusted, trustableAt }, user: { id, name, email, jurisdiction, country, currency, kycStatus, kycLevel, plan, riskProfile, satelliteOptIn, createdAt }, rules, jurisdictions[], countries[] }`. `mpin.enforced` is always sent: true unless `MPIN_ENFORCED=false` (then false, and `lockedUntil` is null). `device` is absent for a recovery claimant; `device.registered` is false for a request without a recorded device id. With recovery access: first name only, masked email, `riskProfile: null`. A signed-out device gets `401 device_revoked`; an older sign-in after a device sign-out `401 signed_out`. With a wallet, in firebase mode, it counts toward the per-person rate limit. | [me/route.ts](../../src/app/api/v1/me/route.ts) |
| PATCH | `/me` | customer write | `{ name?, email? ("" clears), jurisdiction?, pin?, currentPin? }`. A new `pin` goes through `changeMpin()`: it must pass the MPIN policy, and `currentPin` is always needed when the account has a PIN. | `{ ok: true }`. 409 if the new market uses another currency. 409 `name_in_check` while an ID check uses the name; 403 `name_locked` if the name matches a verified ID. The MPIN errors for `pin`. | [me/route.ts](../../src/app/api/v1/me/route.ts) |
| GET | `/me/export` | customer read | none | JSON download (`Content-Disposition: attachment`): `{ exportedAt, profile (no pin_hash), payoutPlans (complete history), vaults, accounts, journals, ledgerEntries, withdrawals, proofs, emergencyRequests, bankTransactions, holdings, orders, paperPositions, auditLog }`. Writes audit `privacy.data_exported`. | [me/export/route.ts](../../src/app/api/v1/me/export/route.ts) |
| POST | `/onboarding` | signed-in, with no wallet | `{ name, email?, country? or jurisdiction? (one is required), pin, demo: boolean }`. `pin` is a 6-digit MPIN that passes the policy (4–6 digits with `MPIN_ENFORCED=false`). `demo: true` seeds practice data. | `{ ok: true }`. 400 `mpin_weak` with `reason`. 409 if a wallet exists (`has_wallet` in firebase mode) or a recovery claim is pending (`claim_pending`). New users start KYC `pending` when `KYC_ENFORCED` applies, else `verified`. | [onboarding/route.ts](../../src/app/api/v1/onboarding/route.ts) |
| POST | `/reset` | Prototype: **public**. Firebase: customer write (via `resolveCustomer`), money: `close_account`. | Firebase: `{ pin }` (the MPIN). Prototype: none. | Prototype: deletes the whole database and uploads, then `{ ok: true }`. Firebase: checks the MPIN, closes this person's account, removes their planner records from the active database and retains financial audit data, then `{ ok: true, closed: true }`. | [reset/route.ts](../../src/app/api/v1/reset/route.ts) |
| GET | `/region` | public | headers only (geo headers, `accept-language`) | `{ networkCountry, languages[], guess: { country, supported, source, detail } }` | [region/route.ts](../../src/app/api/v1/region/route.ts) |

### Payout planning

All three methods use the account resolved by the session. The planner can be used with pending KYC. It avoids the money scheduler and the ledger. A plan's `createdAt` and a check-in's `recordedAt` are Unix milliseconds. The dates people enter use `YYYY-MM-DD`.

| Method | Path | Input | Success |
|---|---|---|---|
| GET | `/payout-plans` | Optional `?asOfDate=YYYY-MM-DD` for personal history. Defaults to today in the account’s time zone. | `{ plans: SavedPayoutPlan[], history: { sampleCount, lateCount, maxLateDays } }`. Plans are the latest 30 by creation time. History is calculated independently across up to six eligible distinct paydays, ordered by actual arrival. The maximum is the observed number of late days and can exceed the 14-day scenario limit. With no eligible history all three values are zero. |
| POST | `/payout-plans` | `{ id, input, isExample? }` with a client-generated UUID. `input` contains `asOfDate`, `expectedPayoutDate`, `expectedPayoutAmount`, `openingCash`, `dailyWorkCost`, `delayDays` and `bills: [{ name, dueDate, amount }]`. | `{ plan }` with its original inputs, `id`, `currency`, `createdAt`, `isExample` (defaults to false) and `actual: null` for a new plan. An identical retry returns the saved plan. |
| PATCH | `/payout-plans` | `{ id, actualDate, actualAmount }`. The date lies between the plan start and today in the account's time zone. Zero is accepted. | `{ plan }` including `actual: { date, amount, recordedAt, daysDifference, amountDifference }`. Both differences are actual minus expected. |

Invalid fields return 400. Missing or foreign plan IDs on check-in return 404. A save that reuses an ID with different inputs or an attempt to replace a recorded outcome returns 409. [Route handler](../../src/app/api/v1/payout-plans/route.ts) · [Validation limits and forecast rules](../features/payout-planner.md)

### Dashboard, insight and activity

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/dashboard` | customer read + recovery · tick | none | `{ currency, totals: { saved, bank, wallet, invested, netWorth, corePnl }, vaults[], series[] (weekly balances by category, ~17 weeks), emergency: { tier1Available, tier2Available, remainingCap, cap, receiptsDue }, nudges[], streak, badges[], roundups: { s, n }, recent[] (8 journals), reviewPending }` | [dashboard/route.ts](../../src/app/api/v1/dashboard/route.ts) |
| GET | `/badges` | customer read | none | `{ streak, badges: [{ key, label, detail, earned }], earned }` | [badges/route.ts](../../src/app/api/v1/badges/route.ts) |
| GET | `/insight` | customer read | none (reads `x-ai-consent`) | `{ headline, body, tip, source: "ai" \| "rules" }`. Cached per user per day in `ai_cache` when consented. | [insight/route.ts](../../src/app/api/v1/insight/route.ts) |
| GET | `/activity` | customer read | `?limit=` (default 200, max 500; anything but a whole number is a 400 `bad_limit`) | `{ audit: [{ id, ts, actor, actor_type, action, entity_type, entity_id, details, hash }], journals: [{ id, kind, memo, created_at, entries: [{ account, kind, amount }] }], currency }` | [activity/route.ts](../../src/app/api/v1/activity/route.ts) |
| POST | `/assistant` | customer read, with `x-ai-consent: yes` | `{ messages: [{ role: "user" \| "assistant", content (≤4000) }] (1–30), client?: "web" \| "mobile" }` | A `text/plain` stream of the reply. 403 `ai_consent_required` without a yes (checked before the body and the key). 503 when `GROQ_API_KEY` is unset. | [assistant/route.ts](../../src/app/api/v1/assistant/route.ts) |
| GET | `/reports/tax` | customer read | `?year=` (default: this year) | CSV download with rows for vault contributions, vault withdrawals, Core purchases (cost basis) and a Satellite paper-only line. | [reports/tax/route.ts](../../src/app/api/v1/reports/tax/route.ts) |

### Vaults and withdrawals

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/vaults` | customer read + recovery · tick | none | `{ vaults: VaultView[], currency }`. A `VaultView` has `id, name, category, template, customRule, target, targetDate, balance, held, available, progress, monthlyNeeded, rule { type, amount, percent, frequency, nextRunAt }, isJoint, members[], status, createdAt, lastContributionAt, currency`. | [vaults/route.ts](../../src/app/api/v1/vaults/route.ts) |
| POST | `/vaults` | customer write; with `initialDeposit`, the KYC gate of `vault_deposit` (no MPIN) | `{ name, category (health \| education \| housing \| emergency \| retirement \| custom), template?, customRule?: { uses[1–5], proof }, target, targetDate? (YYYY-MM-DD), ruleType (none \| fixed \| percent_income \| roundup), ruleAmount?, rulePercent? (1–50), ruleFrequency? (weekly \| biweekly \| monthly), initialDeposit?, isJoint?, members?[≤4] }` | `201 { id }`. With `initialDeposit` and an unverified ID: `403 kyc_required`, before anything is written. The vault, its custom rule and the opening deposit commit in one transaction, so a deposit the bank can't cover leaves no empty vault behind. | [vaults/route.ts](../../src/app/api/v1/vaults/route.ts) |
| GET | `/vaults/[id]` | customer read · tick | none | `{ vault: VaultView, history[] (100 ledger lines), series: [{ t, balance }], withdrawals[] (30, with verification decision and confidence), currency, userName }` | [vaults/\[id\]/route.ts](../../src/app/api/v1/vaults/[id]/route.ts) |
| PATCH | `/vaults/[id]` | customer write | `{ name?, target?, targetDate? (or null), ruleType?, ruleAmount?, rulePercent?, ruleFrequency? }` | `{ ok: true }`. Writes audit `vault.updated`. | [vaults/\[id\]/route.ts](../../src/app/api/v1/vaults/[id]/route.ts) |
| POST | `/vaults/[id]/deposits` | money: `vault_deposit` (KYC gate, no MPIN) | `{ amount, memo? (≤80) }` | `201 { journalId }` (bank → vault) | [vaults/\[id\]/deposits/route.ts](../../src/app/api/v1/vaults/[id]/deposits/route.ts) |
| POST | `/vaults/[id]/withdrawals` | money: `withdraw` (KYC gate, new-device cap, MPIN) | `{ amount, payee (2–80), note? (≤200), pin }` | `201 { id, status: "awaiting_proof" }`. The money is held until a proof is verified. | [vaults/\[id\]/withdrawals/route.ts](../../src/app/api/v1/vaults/[id]/withdrawals/route.ts) |
| POST | `/vaults/[id]/proofs` | KYC gate, upload limit | multipart: `file`, `withdrawalId` (reads `x-ai-consent`) | `202 { id, status: "processing" }`. 404 if the withdrawal isn't this vault's; 409 if it already has a proof (neither counts as an upload). 429 `rate_limited` after 20 uploads in the hour. | [vaults/\[id\]/proofs/route.ts](../../src/app/api/v1/vaults/[id]/proofs/route.ts) |
| DELETE | `/withdrawals/[id]` | customer write | none | `{ ok: true }`. Only a withdrawal still `awaiting_proof` can be cancelled; that releases the hold. | [withdrawals/\[id\]/route.ts](../../src/app/api/v1/withdrawals/[id]/route.ts) |

### Proofs and sample documents

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/proofs/[id]` | customer read (own proofs only) | none | `{ id, purpose, customRule, category, fileName, createdAt, hasEla, exif, extracted, vault, withdrawal, emergencyId, verification: { status, stages[], confidence, decision, finalDecision, reasons[], modelVersion, reviewer, reviewerNote, appealNote, queuedAt, decidedAt, durationMs } }` | [proofs/\[id\]/route.ts](../../src/app/api/v1/proofs/[id]/route.ts) |
| GET | `/proofs/[id]/file` | Prototype: customer read (any proof, no owner check). Firebase: admin (any proof) or customer read (own proof only). | `?kind=ela` for the error-level-analysis image, else the original | The image bytes (`Cache-Control: private, max-age=3600`). | [proofs/\[id\]/file/route.ts](../../src/app/api/v1/proofs/[id]/file/route.ts) |
| POST | `/proofs/[id]/appeal` | customer write | `{ note (5–500) }` | `{ ok: true }`: the declined withdrawal goes back on hold for a person. 409 `already_appealed` (one appeal per check); 409 if the check isn't declined; 409 `appeal_funds_unavailable` if the vault no longer has the amount available. | [proofs/\[id\]/appeal/route.ts](../../src/app/api/v1/proofs/[id]/appeal/route.ts) |
| GET | `/samples` | public | none | `{ samples: [{ key, label, category, expect }] }` (7 sample bills) | [samples/route.ts](../../src/app/api/v1/samples/route.ts) |
| GET | `/samples/[key]` | public (uses the signed-in name if there is one, else "Alex Morgan") | none | A rendered JPEG sample bill. 404 for an unknown key. | [samples/\[key\]/route.ts](../../src/app/api/v1/samples/[key]/route.ts) |

### Emergency access

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/emergency` | customer read · tick | none | `{ rules, cap, marketCap, usedThisMonth, remainingCap, requestsLast7d, requestsLast72h, requestsLast30d, friction: { level, label, detail }, tier1Available, tier2Available, healthVaults[], tier2Vaults[], history[], currency, hasPin }` | [emergency/route.ts](../../src/app/api/v1/emergency/route.ts) |
| POST | `/emergency/preview` | customer read · tick | `{ amount }` | The plan: `{ amount, items[], tier1, tier2, shortfall, needsPin, needsNote, coolingOff, releaseEstimate, checks[], blocked, risk }`. `needsPin` is true on every tier while `MPIN_ENFORCED` is on, else only with Tier 2. Moves no money. | [emergency/preview/route.ts](../../src/app/api/v1/emergency/preview/route.ts) |
| POST | `/emergency/withdrawals` | money: `emergency` (KYC gate, new-device cap, MPIN on every tier) · tick | `{ amount, reasonCode, note? (≤300), attest: boolean, pin }` | `201 { id, status (released \| processing \| cooling_off), plan, releaseAt, receiptRequired }`, or `422 { id, status: "blocked", plan }` when a guardrail blocks it. The MPIN is checked before the emergency transaction. | [emergency/withdrawals/route.ts](../../src/app/api/v1/emergency/withdrawals/route.ts) |
| POST | `/emergency/[id]/receipt` | KYC gate, upload limit | multipart: `file` (reads `x-ai-consent`) | `202 { id, status: "processing" }`. 404 if the request isn't this person's; 409 unless the receipt status is `requested`, `optional`, `overdue` or `rejected` (neither counts as an upload). 429 `rate_limited` after 20 uploads in the hour. | [emergency/\[id\]/receipt/route.ts](../../src/app/api/v1/emergency/[id]/receipt/route.ts) |

### Personal limits

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/limits` | customer read · tick | none | `{ currency, limits: { singleWithdrawal, dailyWithdrawal, monthlyEmergency }, bounds, usage: { withdrawnToday, dailyRemaining }, quota: { perMonth, used, available, lastUsedAt, nextAvailableAt, resetsAt }, emergency: { perMonth, used, increaseDays, maxIncreaseRatio }, active[], history[] }` | [limits/route.ts](../../src/app/api/v1/limits/route.ts) |
| PUT | `/limits` | customer write; MPIN (`limits_loosen`) when any limit goes up | `{ singleWithdrawal?, dailyWithdrawal?, monthlyEmergency?, pin? }` (major units, 0 to 1e9) | `{ id, kind (tighten \| standard), limits, overview }`. Tightening works any time with no MPIN; loosening uses the monthly allowance and needs the MPIN. | [limits/route.ts](../../src/app/api/v1/limits/route.ts) |
| POST | `/limits/emergency` | money: `limits_loosen` (MPIN), upload limit (only when `file` is sent) | multipart: `singleWithdrawal?`, `dailyWithdrawal?`, `monthlyEmergency?` (major units), `reasonCode`, `explanation`, `file?`, `pin` (reads `x-ai-consent`) | `201 { id, decision (approved \| denied \| in_review), reasons[], message, expiresAt, limits, overview }`. The MPIN is checked before the file is read and before the AI assessment. 429 when this month's emergency requests are used up, checked before the assessment and again in the transaction that records the request. An approved increase is applied on top of the limits as they are then ([limits.md](../features/limits.md)). | [limits/emergency/route.ts](../../src/app/api/v1/limits/emergency/route.ts) |

### Wallet

The wallet is on unless the server has `WALLET_ENABLED=false`. When it's off, top-up, move, spend and settings answer `404 wallet_off`. Reading the wallet and cashing out still work.
Bodies are validated by [`wallet/schemas.ts`](../../src/app/api/v1/wallet/schemas.ts) (amounts are positive and at most 100,000,000).

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/wallet` | customer read · tick | none | `WalletView`: `{ enabled, currency, balance, bankBalance, safeToSpendToday, daysToPayday, nextPayday, paydayBasis, dailyLimit, spentToday, limitLeftToday, limitRaiseAvailable, nextRaiseAt, autoSaveSource, upcomingFromWallet, recent[] }` | [wallet/route.ts](../../src/app/api/v1/wallet/route.ts) |
| POST | `/wallet/top-up` | money: `wallet_top_up` (KYC gate, no MPIN) | `{ amount }` | `201 { journalId, wallet: WalletView }` (bank → wallet) | [wallet/top-up/route.ts](../../src/app/api/v1/wallet/top-up/route.ts) |
| POST | `/wallet/move` | money: `wallet_move` (KYC gate, MPIN) | `{ vaultId, amount, pin }` | `201 { journalId, wallet }` (wallet → vault, one way) | [wallet/move/route.ts](../../src/app/api/v1/wallet/move/route.ts) |
| POST | `/wallet/spend` | money: `wallet_spend` (KYC gate, new-device cap, MPIN) | `{ amount, payee (2–80), note? (≤200, nullable), pin }` | `201 { journalId, wallet }`. Counts toward the daily limit. | [wallet/spend/route.ts](../../src/app/api/v1/wallet/spend/route.ts) |
| POST | `/wallet/cash-out` | money: `wallet_cash_out` (KYC gate, new-device cap, MPIN) | `{ amount, pin }` | `201 { journalId, wallet }` (wallet → bank). Counts toward the daily limit. Works with the wallet switched off. | [wallet/cash-out/route.ts](../../src/app/api/v1/wallet/cash-out/route.ts) |
| PUT | `/wallet/settings` | customer write; MPIN (`wallet_limit_raise`) when raising or turning off the daily limit | `{ dailyLimit?: number \| null (null turns it off), autoSaveSource?: "bank" \| "wallet", pin? }` | `{ wallet }`. Raising or turning off the limit works once per 30 days, else `409 limit_raise_locked`. There is no `POST` on this path. | [wallet/settings/route.ts](../../src/app/api/v1/wallet/settings/route.ts) |

### Linked accounts (simulated open banking)

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/accounts` | customer read · tick | none | `{ accounts[] (a placeholder "Linked bank" if none), transactions[] (60), roundups: { s, n }, roundupVault, spendByCategory[] (30 days), currency }` | [accounts/route.ts](../../src/app/api/v1/accounts/route.ts) |
| POST | `/accounts/simulate` | money: `bank_simulate` (KYC gate, no MPIN) | `{ type: "salary" \| "spend" }` | Salary: `{ ok: true, swept }`. Spend: `{ ok: true, created[] }` (3 random card purchases). | [accounts/simulate/route.ts](../../src/app/api/v1/accounts/simulate/route.ts) |
| POST | `/accounts/sweep` | money: `roundup_sweep` (KYC gate, no MPIN) | none | `{ swept, count, vaultId }`. 400 if no vault has the round-up rule. | [accounts/sweep/route.ts](../../src/app/api/v1/accounts/sweep/route.ts) |

### Investing: risk profile and portfolio

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/invest/profile` | customer read | none | `{ questions[], bands[], profile, portfolio }` | [invest/profile/route.ts](../../src/app/api/v1/invest/profile/route.ts) |
| POST | `/invest/profile` | customer write | `{ answers: { [questionId]: 0–3 } }` | `{ profile: { ...score, band, completedAt }, portfolio }`. Writes `users.risk_profile` and audit `invest.risk_profiled`. | [invest/profile/route.ts](../../src/app/api/v1/invest/profile/route.ts) |
| GET | `/portfolio` | customer read · tick | none | `{ currency, profile, core: { value, cash, cost, pnl, holdings[] }, satellite: { optedIn, allocated, realized, equity, mode: "paper" }, total, split: { core, satellite } }` | [portfolio/route.ts](../../src/app/api/v1/portfolio/route.ts) |

### Investing: Core sleeve

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/invest/core` | customer read · tick | none | `{ profile: null }` without a risk profile. Otherwise `{ profile, band, allocations[], quotes[] (price or null), holdings: { holdings[], total, cost, pnl, cash }, sips[], orders[] (40), currency }` | [invest/core/route.ts](../../src/app/api/v1/invest/core/route.ts) |
| POST | `/invest/core/buy` | money: `invest_buy` (KYC gate, MPIN) | `{ amount, pin }` | `201 { fills }` | [invest/core/buy/route.ts](../../src/app/api/v1/invest/core/buy/route.ts) |
| POST | `/invest/core/sip` | money: `invest_sip` (KYC gate; MPIN when `sipNeedsMpin()` says so) | `{ amount, frequency: "weekly" \| "monthly", startDate?, pin? }` | `{ ok: true }` (creates or changes the recurring SIP). 400 `bad_start_date`; the MPIN errors when setting a plan up or moving more money. Debits the scheduler makes later need no PIN. | [invest/core/sip/route.ts](../../src/app/api/v1/invest/core/sip/route.ts) |
| DELETE | `/invest/core/sip` | customer write | none | `{ ok: true }`: pauses the SIP. No MPIN (it stops money moving). | [invest/core/sip/route.ts](../../src/app/api/v1/invest/core/sip/route.ts) |
| GET | `/invest/core/history` | customer read | `?monthly=` (default 300, must be > 0), `?band=` | `{ band, allocations[], points[], sources[], totalContributed, finalValue, startMonth, currency }` (historical illustration) | [invest/core/history/route.ts](../../src/app/api/v1/invest/core/history/route.ts) |
| GET | `/invest/core/projection` | customer read | `?band=` (default: the profile's band; 400 without a profile), `?monthly=` (300), `?initial=` (0), `?years=` (15, clamped 1–40) | `{ bandName, assumptions: { expReturn, vol, paths }, years: [{ year, contributed, p10, p25, p50, p75, p90 }], currency }` (Monte Carlo) | [invest/core/projection/route.ts](../../src/app/api/v1/invest/core/projection/route.ts) |

### Investing: Satellite sleeve (paper trading)

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/invest/satellite` | customer read · tick | none | `{ optedIn, optedAt, eligibility, disclosures, rules, equity, positions[], stats, markets[], governance: { stages[] }, currency }`. When opted in, it also runs the paper engine after responding (`after()`). | [invest/satellite/route.ts](../../src/app/api/v1/invest/satellite/route.ts) |
| POST | `/invest/satellite/opt-in` | money: `satellite_opt_in` (KYC gate, MPIN always) | `{ amount, acknowledged (int ≥ 0), pin }` | `201 { ok: true }`: opts in, or adds to the allocation (bank → Satellite). The MPIN is checked first; then 400 unless every risk disclosure is acknowledged, 403 if not eligible, 400 over the allocation cap. | [invest/satellite/opt-in/route.ts](../../src/app/api/v1/invest/satellite/opt-in/route.ts) |
| POST | `/invest/satellite/opt-out` | customer write | none | `{ ok: true }` | [invest/satellite/opt-out/route.ts](../../src/app/api/v1/invest/satellite/opt-out/route.ts) |
| PATCH | `/invest/satellite/markets` | customer write | `{ symbol, enabled: boolean }` | `{ ok: true }` | [invest/satellite/markets/route.ts](../../src/app/api/v1/invest/satellite/markets/route.ts) |
| GET | `/invest/satellite/analysis` | customer read | `?symbol=` (default `BTC-USD`), `?tf=` (1h \| 4h \| 1d, default 4h), `?bars=` (60–400, default 160) | `{ symbol, name, assetClass, interval, source, currency, candles[], swings[], structure[], orderBlocks[], fvgs[], sweeps[], profile, latest, weights, signals[] }`. 404 for an unknown market. | [invest/satellite/analysis/route.ts](../../src/app/api/v1/invest/satellite/analysis/route.ts) |
| POST | `/invest/satellite/backtest` | customer write | `{ symbol, tf: "1h" \| "4h" \| "1d" }` | `{ params, risk, bars, from, to, full, oos, decay, folds, gate, buyHoldPct, equity[], trades[], ranAt, source }`. Saved as this customer's own strategy row only. `source` is the price provider's name (`yahoo`), `cache` or `synthetic`. | [invest/satellite/backtest/route.ts](../../src/app/api/v1/invest/satellite/backtest/route.ts) |
| POST | `/invest/satellite/run` | KYC gate (no MPIN: it records paper positions and moves no ledger money) | none | `{ processed, opened, closed }` | [invest/satellite/run/route.ts](../../src/app/api/v1/invest/satellite/run/route.ts) |

### Identity (KYC)

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/kyc` | customer read | none | `{ status (not_started \| pending \| needs_review \| verified \| rejected), docType, idLast4, reasons[], updatedAt }`. In the steps flow (`KYC_FLOW=steps`, India accounts) it adds `flow: "steps"` and `steps: { pan, aadhaar, bank }`, each `{ status: "todo" \| "done" \| "review" \| "failed", last4? }`; `reasons` then includes the steps' reasons. In the photo flow neither field is sent. | [kyc/route.ts](../../src/app/api/v1/kyc/route.ts) |
| POST | `/kyc` | customer write, upload limit | multipart: `docType`, `file` (required), `idNumber?` (reads `x-ai-consent`) | `201` with the same shape as `GET /kyc`. Runs the provider chosen by `KYC_PROVIDER`. 409 `kyc_flow_steps` for an account on the steps flow (before the upload is counted). | [kyc/route.ts](../../src/app/api/v1/kyc/route.ts) |
| POST | `/kyc/pan` | customer write | `{ pan }` (trimmed, ≤ 20) | Step 1 of the steps flow. Answers the `GET /kyc` shape. | [kyc/pan/route.ts](../../src/app/api/v1/kyc/pan/route.ts) |
| POST | `/kyc/digilocker/start` | customer write | none | `{ url, requestId }`. Open `url`; DigiLocker returns the person to `KYC_DIGILOCKER_REDIRECT_URL` (default `<origin>/verify`) with `success`, `id` and `scope`. | [kyc/digilocker/start/route.ts](../../src/app/api/v1/kyc/digilocker/start/route.ts) |
| POST | `/kyc/digilocker/finish` | customer write | `{ requestId }` | The `GET /kyc` shape. 409 `kyc_step_waiting` until DigiLocker is done. | [kyc/digilocker/finish/route.ts](../../src/app/api/v1/kyc/digilocker/finish/route.ts) |
| POST | `/kyc/bank/start` | customer write | none | `{ upiLink, requestId, expiresAt }`: a ₹1 UPI payment from the account to check. | [kyc/bank/start/route.ts](../../src/app/api/v1/kyc/bank/start/route.ts) |
| POST | `/kyc/bank/finish` | customer write | `{ requestId }` | The `GET /kyc` shape. 409 `kyc_step_waiting` until the payment arrives. | [kyc/bank/finish/route.ts](../../src/app/api/v1/kyc/bank/finish/route.ts) |

The steps' rules and error codes are in [identity.md](../features/identity.md), section 3a.

### MPIN

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| POST | `/mpin` | money: `mpin_change` | `{ currentPin, newPin }` | `{ ok: true }`. 400 `mpin_weak` with `reason`; the MPIN errors for `currentPin` (always checked). | [mpin/route.ts](../../src/app/api/v1/mpin/route.ts) |
| POST | `/mpin/reset` | customer write, trusted device | `{ verificationToken, newPin }` (token from an OTP with purpose `mpin_reset`) | `{ ok: true }`. Clears wrong tries and any lock. 400 `mpin_weak`, 403 `device_untrusted`, 403 `phone_recently_changed` with `allowedAt` (the verified number was added or changed less than 72 hours ago), 400 `verification_invalid`. | [mpin/reset/route.ts](../../src/app/api/v1/mpin/reset/route.ts) |

### Devices

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/devices` | customer read | none | `{ devices: [{ id, platform, appVersion, firstSeen, lastSeen, trusted, trustableAt, current }] }`, signed-in devices, most recently used first | [devices/route.ts](../../src/app/api/v1/devices/route.ts) |
| POST | `/devices/trust` | money: `device_trust` (MPIN always) | `{ verificationToken, pin }` (token from an OTP with purpose `device_trust`) | `{ ok: true }`: trusts the calling device. 400 `device_unknown` without a recorded device id (checked first); the MPIN errors; 400 `verification_invalid`. | [devices/trust/route.ts](../../src/app/api/v1/devices/trust/route.ts) |
| POST | `/devices/[id]/revoke` | money: `device_revoke` (MPIN always) | `{ pin }` | `{ ok: true }` (twice is a no-op). 404 `device_not_found`; 403 `device_untrusted` when an untrusted device tries to sign out a trusted one. | [devices/\[id\]/revoke/route.ts](../../src/app/api/v1/devices/[id]/revoke/route.ts) |

### Alerts and push

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/alerts` | customer read | `?unread=1` (or `true`), `?limit=` (default 50, max 200; 400 `bad_limit`) | `{ alerts: [{ id, kind, title, body, createdAt, readAt }], unread }`, newest first. Kinds: `new_device`, `device_trusted`, `device_revoked`, `money_out`, `limit_loosened`, `mpin_locked`, `mpin_changed`, `phone_verified`. | [alerts/route.ts](../../src/app/api/v1/alerts/route.ts) |
| POST | `/alerts/read` | customer write | `{ ids?: string[] }` (≤ 200; none = all) | `{ ok: true, unread }` | [alerts/read/route.ts](../../src/app/api/v1/alerts/read/route.ts) |
| POST | `/push/register` | customer write | `{ token, platform: "ios" \| "android" \| "web" }` (an Expo push token) | `{ ok: true }`. Tied to the calling device. 400 `push_token_invalid`. | [push/register/route.ts](../../src/app/api/v1/push/register/route.ts) |
| DELETE | `/push/register` | customer write | `{ token }` | `{ ok: true }`, also when it wasn't registered | [push/register/route.ts](../../src/app/api/v1/push/register/route.ts) |

### Texted codes (OTP) and the phone number

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| POST | `/otp/send` | customer write | `{ purpose: "phone_verify" \| "device_trust" \| "mpin_reset", phone? }` (`phone` only for `phone_verify`, ≤ 32) | `{ otpId, expiresAt, sentTo (masked), testCode? }` (`testCode` only with `OTP_MODE=test`). 400 `phone_invalid`, 409 `phone_required`, 429 `otp_rate_limited` with `retryAt`, 503 `otp_unavailable`, 502 `otp_send_failed`; 403 `device_untrusted` (replacing a verified number or `mpin_reset` from a new device); 403 `phone_recently_changed` with `allowedAt` (`mpin_reset` within 72 hours of the number changing); 400 `device_unknown` (`device_trust` without a recorded device id). These are checked before a code is sent. | [otp/send/route.ts](../../src/app/api/v1/otp/send/route.ts) |
| POST | `/otp/verify` | customer write | `{ otpId, code }` | `{ verificationToken, purpose, expiresAt }` (10 minutes, single use). 400 `otp_wrong` with `triesLeft`; 410 `otp_exhausted`, `otp_expired`, `otp_used`; 404 `otp_not_found`. | [otp/verify/route.ts](../../src/app/api/v1/otp/verify/route.ts) |
| POST | `/me/phone` | money: `phone_change` (MPIN always) | `{ verificationToken, pin }` (token purpose `phone_verify`; `pin` is the current MPIN) | `{ ok: true }`. Sets the number the code went to and raises a `phone_verified` alert; the number can't reset the MPIN for 72 hours. 403 `device_untrusted` when replacing a verified number from an untrusted device (checked first); the MPIN errors (`mpin_required`, `mpin_wrong`, `mpin_locked`; checked before the token is used, so a wrong MPIN leaves it unused); 400 `verification_invalid`. | [me/phone/route.ts](../../src/app/api/v1/me/phone/route.ts) |

### Account recovery

All recovery routes call `assertRecoveryEnabled()` first. With `RECOVERY_ENABLED=false` they answer `404 recovery_off`.
Rate limits are in [`src/lib/recovery/limits.ts`](../../src/lib/recovery/limits.ts): find 5 per key per hour (300 server-wide), reset 5 per key per hour (500), claim 3 per key per day (200).

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| POST | `/recovery/find` | public, rate-limited | multipart `{ docType, file?, idNumber? }`, or JSON `{ docType, idNumber }` | `{ found, maskedEmail?, canReset, findToken? }` | [recovery/find/route.ts](../../src/app/api/v1/recovery/find/route.ts) |
| POST | `/recovery/reset` | public, rate-limited | `{ email? }` or `{ findToken? }` (one is required) | Always `{ ok: true }`, so it never says whether the account exists. Prototype mode adds `simulated: true`. | [recovery/reset/route.ts](../../src/app/api/v1/recovery/reset/route.ts) |
| GET | `/recovery/claim` | signed-in (firebase); prototype returns `{ claim: null }` | none | `{ claim: ClaimView \| null }`. A `ClaimView` has `id, status, access (read_only \| after_approval), docType, idLast4, notifiedEmail, reasons[], createdAt, expiresAt, decidedAt`. `notifiedEmail` is the masked address the "recovery started" notice went to, stored on the claim (null when the account had none; claims from before 2026-11-24 show the account's current email). | [recovery/claim/route.ts](../../src/app/api/v1/recovery/claim/route.ts) |
| POST | `/recovery/claim` | signed-in (firebase only), rate-limited | multipart `{ docType, file (required), idNumber? }` | `201 { claim }`. 404 `no_match`; 409 `has_wallet` or `claim_pending`, checked before the card is read and again inside the transaction that records the claim (then nothing is bound and the photo is deleted). Prototype: `400 not_available`. | [recovery/claim/route.ts](../../src/app/api/v1/recovery/claim/route.ts) |
| DELETE | `/recovery/claim` | signed-in (firebase only) | none | `{ claim }` (now `cancelled`). `404 no_claim` if nothing is pending. | [recovery/claim/route.ts](../../src/app/api/v1/recovery/claim/route.ts) |

### Admin (operations console)

| Method | Path | Who can call | Body or query (key fields) | Returns (shape summary) | File |
|---|---|---|---|---|---|
| GET | `/admin/overview` | admin | none | `{ queue[] (proofs waiting for a person or appealed, with slaDueAt), limitRequests[], flags[], metrics: { total, autoApproved, autoDenied, humanReview, automationRate, reviewerAgreement, reviewedCount, appeals, overturned, falseDeclineRate, slaCompliance, avgPipelineMs, daily[] }, reconciliation, auditChain, strategies[] }`. Strategies are per customer: each row is `{ id ("<userId>:<strategyId>"), strategyId, userId, customer (name), name, stage, last_backtest }`. | [admin/overview/route.ts](../../src/app/api/v1/admin/overview/route.ts) |
| GET | `/admin/reviews/[proofId]` | admin | none | The `proofView` shape plus `{ user, history[], flags[] }` | [admin/reviews/\[proofId\]/route.ts](../../src/app/api/v1/admin/reviews/[proofId]/route.ts) |
| POST | `/admin/reviews/[proofId]` | admin | `{ decision: "approved" \| "denied", note (3–500) }` | `{ ok: true }` | [admin/reviews/\[proofId\]/route.ts](../../src/app/api/v1/admin/reviews/[proofId]/route.ts) |
| POST | `/admin/flags/[id]` | admin | `{ status: "resolved" \| "dismissed", resolution (3–300) }` | `{ ok: true }` | [admin/flags/\[id\]/route.ts](../../src/app/api/v1/admin/flags/[id]/route.ts) |
| POST | `/admin/limit-requests/[id]` | admin | `{ decision: "approved" \| "denied", note (3–500) }` | `{ ok: true }`. An approval applies the increase on top of the customer's limits as they are now. 404 unknown request; 409 not awaiting review. | [admin/limit-requests/\[id\]/route.ts](../../src/app/api/v1/admin/limit-requests/[id]/route.ts) |
| GET | `/admin/kyc` | admin | none | `{ queue[] (checks waiting for a person, oldest first, with userEmail and market), recent[] (last 20 decisions) }` | [admin/kyc/route.ts](../../src/app/api/v1/admin/kyc/route.ts) |
| POST | `/admin/kyc/[id]` | admin | `{ decision: "verified" \| "rejected", note (3–500) }`. A rejection's note is shown to the customer. | `{ ok: true, status }` | [admin/kyc/\[id\]/route.ts](../../src/app/api/v1/admin/kyc/[id]/route.ts) |
| GET | `/admin/kyc/[id]/file` | admin | none | The ID photo (`Cache-Control: private, no-store`). 404 once deleted. | [admin/kyc/\[id\]/file/route.ts](../../src/app/api/v1/admin/kyc/[id]/file/route.ts) |
| GET | `/admin/recovery` | admin | none | `{ queue[] (pending claims with accountEmail and signIns[]), recent[] (last 20 outcomes) }` | [admin/recovery/route.ts](../../src/app/api/v1/admin/recovery/route.ts) |
| POST | `/admin/recovery/[id]` | admin | `{ decision: "approved" \| "rejected", note (3–500) }` | `{ ok: true, claim }`. Approve gives the new sign-in full access and disables older sign-ins. Reject unbinds it. The account's email is told either way. | [admin/recovery/\[id\]/route.ts](../../src/app/api/v1/admin/recovery/[id]/route.ts) |
| GET | `/admin/recovery/[id]/file` | admin | none | The claim's ID photo (`private, no-store`). 404 once deleted. | [admin/recovery/\[id\]/file/route.ts](../../src/app/api/v1/admin/recovery/[id]/file/route.ts) |
| GET | `/audit/[userId]` | admin | `userId` = a user id or `all`; `?limit=` (default 300, max 1000; 400 `bad_limit` if not a whole number); `?action=` (prefix match) | `{ rows[] (full audit_log rows, details parsed), chain: { ok, checked, brokenAt, headHash } }` | [audit/\[userId\]/route.ts](../../src/app/api/v1/audit/[userId]/route.ts) |

## Related reading

- Identity modes and switches: [configuration.md](configuration.md)
- Tables behind these routes: [data-model.md](data-model.md)
- Running the server and the phone app: [commands.md](commands.md)
- Feature docs for the newer routes: [mpin.md](../features/mpin.md), [devices-alerts-otp.md](../features/devices-alerts-otp.md), [running-online.md](../features/running-online.md), [identity.md](../features/identity.md) (the KYC steps flow)
- Module notes: [`src/lib/auth/README.md`](../../src/lib/auth/README.md), [`src/lib/kyc/README.md`](../../src/lib/kyc/README.md), [`src/lib/kyc/checks/README.md`](../../src/lib/kyc/checks/README.md), [`src/lib/mpin/README.md`](../../src/lib/mpin/README.md), [`src/lib/devices/README.md`](../../src/lib/devices/README.md), [`src/lib/alerts/README.md`](../../src/lib/alerts/README.md), [`src/lib/otp/README.md`](../../src/lib/otp/README.md), [`src/lib/recovery/README.md`](../../src/lib/recovery/README.md), [`src/lib/wallet/README.md`](../../src/lib/wallet/README.md), [`src/lib/limits/README.md`](../../src/lib/limits/README.md), [`src/lib/verification/README.md`](../../src/lib/verification/README.md), [`src/lib/invest/README.md`](../../src/lib/invest/README.md)
