# Contracts for plans 02 to 08

> The interfaces every part of plans 02 to 08 must follow, so the server, web app, phone app and Practice simulator agree. Change this file first if a contract has to change.

## Shared rules

- Errors keep the existing shape `{ error, code }`, plus extra fields where listed. Messages are plain English for customers.
- Money is in minor units on the server; the phone keeps sending major units where it already does.
- New server modules create their own tables on first use (the existing pattern), unless a contract below names `src/lib/db.ts`.
- Every new module has a `config.ts` switch, an `index.ts`, a `README.md`, and lines in shared files marked `// <module>` (see the [module guide](../process/module-guide.md)).
- The Practice simulator (`mobile/src/lib/api/demo`) mirrors each contract, and registers a Practice slice (`registerPracticeSlice`) for any new state.

## Headers the phone sends (plan 06)

| Header | Value | Sent |
|---|---|---|
| `x-device-id` | The install id (`installId()` in `mobile/src/lib/api/device.ts`); the web sends its own random id with sign-in on (`src/components/identity/device.ts`) | Every request (`request()` in `mobile/src/lib/api/http.ts`, the assistant stream, the data export) |
| `x-device-platform` | `ios`, `android` or `web` | Every request |
| `x-app-version` | `expo.version` from app config | Every request |

## MPIN (plan 03)

### Policy

- Exactly 6 digits. Refused: all one digit; straight runs up or down (`123456`, `654321`); the list in `src/lib/mpin/policy.ts` (e.g. `121212`, `112233`, `000000`, `111222`); the person's date of birth as `DDMMYY` when known.
- Existing 4-digit server PINs keep working until changed. `/me` reports `mpin.upgradeDue: true` for them.
- **Practice MPIN:** `246810` (`PRACTICE_PIN`), replacing `1234`.

### Lockout

5 wrong tries lock money moves for 1 minute. Each further 5 wrong tries lock for 5 minutes, then 30 minutes, then 24 hours (and stay at 24 hours). A right MPIN resets the count. Counted per user on the server.

### Which actions need it

`src/lib/money-routes.ts` holds the single map. Routes call `customer({ money: "<action>" })` and pass the body's `pin` to `requireMpin()`.

| Action | Route | MPIN | KYC gate (unchanged) |
|---|---|---|---|
| `withdraw` | `POST /vaults/{id}/withdrawals` | yes | yes |
| `wallet_spend` | `POST /wallet/spend` | yes | yes |
| `wallet_cash_out` | `POST /wallet/cash-out` | yes | yes |
| `wallet_move` | `POST /wallet/move` | yes | yes |
| `wallet_limit_raise` | `PUT/POST /wallet/settings` when raising or removing the daily limit | yes | no |
| `emergency` | `POST /emergency/withdrawals` (every tier) | yes | yes |
| `limits_loosen` | `PUT /limits` when any limit goes up; `POST /limits/emergency` | yes | no |
| `invest_buy` | `POST /invest/core/buy` | yes | yes |
| `close_account` | `POST /reset` in firebase mode | yes | no |
| `mpin_change` | `POST /mpin` | current MPIN | no |

Money in (deposits, top-ups) needs no MPIN. KYC gates stay as they are today.

### API

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/v1/mpin` | `{ currentPin, newPin }` | `{ ok: true }`; 400 `mpin_weak` with `reason` |
| POST | `/api/v1/mpin/reset` | `{ verificationToken, newPin }` (token from OTP, plan 06) | `{ ok: true }` |
| GET | `/api/v1/me` | | adds `mpin: { upgradeDue, lockedUntil }` |

### Errors

| Code | Status | Extra fields | When |
|---|---|---|---|
| `mpin_required` | 401 | | A money action without `pin` |
| `mpin_wrong` | 403 | `triesLeft` (before the next lock) | Wrong MPIN |
| `mpin_locked` | 423 | `lockedUntil` (ms since epoch) | Locked |
| `mpin_weak` | 400 | `reason` | Choosing a weak MPIN |

Switch: `MPIN_ENFORCED` (default on). Off: checks are skipped, attempts still recorded.

### Phone

- `ensureMpin(reason): Promise<string | null>` in `mobile/src/features/mpin`, an imperative sheet like `ensureAiAnswer()`. `null` means cancelled.
- After the first correct MPIN, the person can turn on "Use fingerprint for payments": the MPIN is stored in SecureStore with `requireAuthentication: true` and released after a biometric check.
- The app-unlock PIN is the same MPIN. Changing it updates both.

## Devices, alerts and OTP (plan 06)

### Devices

- Table `devices (id, user_id, install_id, platform, app_version, first_seen, last_seen, trusted_at, revoked_at)`.
- The first device on an account is trusted when the account is made. Any later device starts untrusted.
- An untrusted device can move money out only up to a market-scaled cap (`untrustedMoveCap`, USD 50 equivalent through `CURRENCY_SCALE`) until 24 hours after `first_seen`, or until trusted. Over the cap: 403 `device_untrusted` with `trustableAt` (ms).
- A revoked device gets 401 `device_revoked` on every request.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/v1/devices` | | `{ devices: [{ id, platform, appVersion, firstSeen, lastSeen, trusted, current }] }` |
| POST | `/api/v1/devices/trust` | `{ verificationToken, pin }` | `{ ok: true }` (trusts the calling device) |
| POST | `/api/v1/devices/{id}/revoke` | `{ pin }` | `{ ok: true }` |

### Alerts

- Table `alerts (id, user_id, kind, title, body, created_at, read_at)`.
- Kinds: `new_device`, `device_trusted`, `device_revoked`, `money_out`, `limit_loosened`, `mpin_locked`, `mpin_changed`, `phone_verified`.
- Senders sit behind an `AlertSender` interface: in-app (always) and Expo push (when a push token exists).

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/v1/alerts` | `?unread=1` optional | `{ alerts: [...], unread }` |
| POST | `/api/v1/alerts/read` | `{ ids?: string[] }` (none = all) | `{ ok: true }` |
| POST | `/api/v1/push/register` | `{ token, platform }` | `{ ok: true }` |

### OTP

- 6 digits, valid 5 minutes, 3 tries, at most 5 sends per hour per user. Stored hashed.
- Senders behind `OtpSender`: `test` (no SMS; the code is returned as `testCode`, only when `OTP_MODE=test` and refused when `NODE_ENV=production` unless `OTP_TEST_ALLOWED=true`) and `twilio` (SMS through Twilio's Messages API, with `TWILIO_*` env vars).
- Purposes: `phone_verify`, `device_trust`, `mpin_reset`.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/v1/otp/send` | `{ purpose, phone? }` (`phone` only for `phone_verify`) | `{ otpId, expiresAt, testCode? }` |
| POST | `/api/v1/otp/verify` | `{ otpId, code }` | `{ verificationToken, purpose }` (valid 10 minutes, single use) |
| POST | `/api/v1/me/phone` | `{ verificationToken }` | `{ ok: true }` (sets `users.phone` and `phone_verified_at`) |

`/me` adds `phone: { number (masked), verified }`.

## Onboarding checks (plan 07)

- `KYC_FLOW=photo` (default, today's ID photo check) or `steps` (PAN, then Aadhaar through DigiLocker, then bank).
- Interfaces in `src/lib/kyc/checks/types.ts`: `PanVerifier`, `DigiLockerClient`, `BankVerifier`. Providers chosen by `KYC_CHECKS_PROVIDER=test|setu`.
- The `test` provider is deterministic: PAN `ABCDE1234F` matches any name; `ABCDE0000F` is a name mismatch; DigiLocker completes with the account name; reverse penny drop succeeds with the account name, IFSC `HDFC0000001`, last 4 `4321`.
- Stored: only last 4 characters plus an HMAC for PAN; name, year of birth and last 4 for Aadhaar; IFSC, last 4 and holder name for the bank.
- All three done: the KYC status becomes `verified`. A name mismatch goes to a person (`needs_review`).

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/v1/kyc` | | adds `flow` and `steps: { pan, aadhaar, bank }`, each `{ status: "todo" | "done" | "review" | "failed", last4? }` |
| POST | `/api/v1/kyc/pan` | `{ pan }` | the same view |
| POST | `/api/v1/kyc/digilocker/start` | | `{ url, requestId }` |
| POST | `/api/v1/kyc/digilocker/finish` | `{ requestId }` | the same view |
| POST | `/api/v1/kyc/bank/start` | | `{ upiLink, requestId, expiresAt }` |
| POST | `/api/v1/kyc/bank/finish` | `{ requestId }` | the same view |

## Server hardening (plan 05)

- `NODE_ENV=production` without `FIREBASE_PROJECT_ID` refuses to start, unless `ALLOW_PROTOTYPE_IN_PRODUCTION=true`.
- Unexpected errors return `{ error: "Something went wrong. Try again.", code: "server_error", errorId }` and log the details with the same `errorId`.
- `x-ai-consent`: a missing header means **no** once the web app sends it. The assistant route checks it.
- Rate limits through `src/lib/rate-limit.ts`: a general limit per user and per IP on every route (`RATE_LIMIT_PER_MINUTE`, default 120), and tighter ones on MPIN, OTP and uploads.

## Deviations as built

> Where the server and web code (22 November 2026, including the fixes from that day's security review) differ from the contracts above. Each line was checked against the code. "Added" means an addition that doesn't break a client; "Changed" means different behaviour. The phone side is recorded separately.

### Shared rules

| Contract | As built | Where |
|---|---|---|
| Every new module has a `config.ts` switch, an `index.ts` and a `README.md`. | Changed: `src/lib/bank` has no switch (only the steps flow writes to it). `src/lib/rate-limit.ts` and `src/lib/money-routes.ts` are single files. | `src/lib/bank/README.md` |
| Errors keep `{ error, code }` plus listed extra fields. | Added: extra fields are sent for every error class that carries them (`errorResponse()` spreads `extra`), including fields the contract didn't list: `retryAt` on `otp_rate_limited`, `allowedAt` on `phone_recently_changed`, `trustableAt: null` on `device_untrusted`. | `src/lib/api.ts` |
| Headers: `x-device-id` sent by the phone. | Added: the web app also sends `x-device-id` (a random `web-<uuid>`) and `x-device-platform: web` when web sign-in is on. With web sign-in off it sends none. | `src/components/identity/device.ts` |

### MPIN (plan 03)

| Contract | As built | Where |
|---|---|---|
| The action table lists ten actions. | Added: `device_trust`, `device_revoke` and `phone_change` (`POST /me/phone`, adding or replacing the verified number), each with the MPIN always checked. `mpin_change` also covers `PATCH /me` with a new `pin`. Each entry also has a `deviceCap` flag (plan 06). | `src/lib/money-routes.ts` |
| `wallet_limit_raise`: `PUT/POST /wallet/settings`. | Changed: only `PUT /wallet/settings` exists; there is no `POST`. The MPIN is asked only when a limit already exists and goes up or is turned off. | `src/app/api/v1/wallet/settings/route.ts` |
| Routes call `customer({ money: "<action>" })` and pass `pin` to `requireMpin()`. | Changed in detail: `PUT /limits` and `PUT /wallet/settings` call `customer()` without `money` (they ask for the MPIN only for some bodies; their map entries have `kyc: false`). `POST /reset` uses `resolveCustomer()` with the map's KYC flag. `POST /emergency/withdrawals` passes `pin` to `executeEmergency()`, which calls `requireMpin()` before its transaction. | the routes named |
| Switch off: checks skipped, attempts still recorded. | Added: in rollback mode a new PIN only has to be 4 to 6 digits. The `always` checks (Tier 2 emergency, changing the PIN, changing the phone number, trusting or signing out devices) behave exactly as when enforced, the lock included, with `triesLeft` and `lockedUntil`, so rollback mode can't be used to guess the PIN without limit. A PIN sent with a money move while a lock is on isn't checked at all. The lock messages and the `mpin_locked` alert say "anything that needs your MPIN" rather than claiming money moves are locked. `GET /me` reports `lockedUntil: null` and `enforced: false`. | `src/lib/mpin/verify.ts`, `change.ts`, `attempts.ts`, `src/lib/alerts/messages.ts` |
| `GET /me` adds `mpin: { upgradeDue, lockedUntil }`. | Added: `enforced`, always sent: true unless `MPIN_ENFORCED=false` (then false, and `lockedUntil` is null). The phone copies a typed MPIN into its unlock PIN only when it is true. | `src/lib/mpin/verify.ts` (`mpinStatus()`) |
| `upgradeDue: true` for existing 4-digit PINs. | Changed: true until the server has seen a 6-digit PIN for the account, so also for accounts not seen since the module shipped, whatever their PIN length. Stored in a new table `mpin_meta`, not a `users` column (plan 03 had `users.mpin_upgrade_due`). | `src/lib/mpin/meta.ts` |
| Plan 03: `mpin_attempts` in `src/lib/db.ts`. | Changed: created on first use by the module. | `src/lib/mpin/attempts.ts` |
| `POST /mpin/reset { verificationToken, newPin }`. | Added: also needs a trusted device (403 `device_untrusted` with `trustableAt`), and a verified number that was added or changed at least 72 hours ago (403 `phone_recently_changed` with `allowedAt`; `POST /otp/send` with `mpin_reset` refuses the same way before a code is sent). | `src/app/api/v1/mpin/reset/route.ts`, `src/lib/otp/phone.ts` (`assertPhoneSettled()`) |
| Lockout rules. | Added detail: tries made during a lock are refused without checking the PIN and are not counted. | `src/lib/mpin/verify.ts` |

### Devices, alerts and OTP (plan 06)

| Contract | As built | Where |
|---|---|---|
| The first device is trusted when the account is made. | Changed: the first device is trusted when it is first **seen** with a device id, and, with sign-in on, only on a wallet opened in the last hour (`NEW_ACCOUNT_WINDOW_MS`; "opened" is the wallet's first ledger account, `walletOpenedAt()`). On an older wallet with no devices the first device starts untrusted with a `new_device` alert. Prototype mode (no sign-in) trusts the first device at once whatever the wallet's age; later devices start untrusted there too. A request with no device id is "unidentified": trusted in prototype mode, and always untrusted in firebase mode (`trustableAt: null`), whatever devices the account has. | `src/lib/devices/service.ts`, `config.ts`, `store.ts` |
| Table `devices (…, trusted_at, revoked_at)`. | Added: `devices.cool_down` (0 for a device first seen after a device was signed out of the account: it never trusts itself after 24 hours, only with a texted code and the MPIN) and `users.devices_revoked_at` (the account's last device sign-out). Both added on first use. | `src/lib/devices/store.ts` |
| A revoked device gets 401 `device_revoked`. | Added: signing out any device (itself included) records `users.devices_revoked_at`. A request whose sign-in started earlier (the token's `auth_time`, else `iat`, as `signedInAt` from `verifyIdToken()`, compared in whole seconds) gets 401 `signed_out` unless it comes from a trusted, signed-in device; a new id on such a request is refused before anything is written. Firebase mode only. | `src/lib/devices/service.ts` (`touchDevice()`), `rules.ts` (`signedInBefore()`), `src/lib/auth/verify.ts` |
| (Not in the contract) | Added: a new-device limit. An account adds at most 5 device rows an hour and has at most 20 signed in. Past either, a new id isn't recorded, raises no alert and counts as unidentified and untrusted (in prototype mode too); `/me` shows `device.registered: false` and `POST /devices/trust` answers 400 `device_unknown`. | `src/lib/devices/service.ts`, `config.ts` (`NEW_DEVICES_PER_HOUR`, `MAX_ACTIVE_DEVICES`) |
| An untrusted device may move money out up to the cap. | Added: an untrusted device also can't sign out a trusted device, replace the verified phone number or reset the MPIN (403 `device_untrusted`), and can't ask for those codes. The cap is rounded to a whole currency unit. | `src/lib/devices/service.ts`, `src/app/api/v1/otp/send/route.ts`, `me/phone`, `mpin/reset` |
| No switch named for devices or push. | Added: `DEVICES_ENFORCED` (rollback: record and alert, refuse nothing; the new-device limit still applies), `ALERTS_PUSH`, `EXPO_ACCESS_TOKEN`. | `src/lib/devices/config.ts`, `src/lib/alerts/config.ts` |
| `GET /devices` items: `{ id, platform, appVersion, firstSeen, lastSeen, trusted, current }`. | Added: `trustableAt`. | `src/lib/devices/service.ts` (`listDevices()`) |
| `GET /me` adds `mpin` and `phone`. | Added: `device: { registered, trusted, trustableAt }` for the calling device (not sent for a recovery claimant, whose device isn't recorded). | `src/app/api/v1/me/route.ts` |
| `GET /alerts?unread=1`. | Added: `?limit=` (default 50, max 200). | `src/app/api/v1/alerts/route.ts` |
| `POST /alerts/read` returns `{ ok: true }`. | Added: `{ ok: true, unread }`. | `src/app/api/v1/alerts/read/route.ts` |
| `POST /push/register { token, platform }`. | Added: `DELETE /push/register { token }` for sign-out; a `push_tokens` table (10 per person, tied to the calling device). | `src/app/api/v1/push/register/route.ts`, `src/lib/alerts/store.ts` |
| `POST /otp/send` returns `{ otpId, expiresAt, testCode? }`. | Added: `sentTo` (the masked number). | `src/lib/otp/service.ts` |
| `POST /otp/verify` returns `{ verificationToken, purpose }`. | Added: `expiresAt`. | `src/lib/otp/service.ts` |
| At most 5 sends per hour per user. | Added: also 5 per hour per person to one number, and 15 `phone_verify` sends per hour to one number from all accounts together, counting and refusing only sends to a number the sending account hasn't verified (`otp_codes.new_number`), so other accounts can't block the owner's own codes. A new code replaces earlier unused ones for the same purpose. A send the provider refuses still counts. | `src/lib/otp/service.ts`, `store.ts`, `config.ts` |
| OTP senders `test` and `twilio`. | Added: with `OTP_MODE` unset, codes are off (503 `otp_unavailable`). `device_trust` and `mpin_reset` codes go only to a verified number (409 `phone_required`). | `src/lib/otp/config.ts`, `senders.ts` |
| `POST /me/phone { verificationToken }`. | Changed: `{ verificationToken, pin }`. The current MPIN is checked as `phone_change` with `always`, so also with `MPIN_ENFORCED=false`, and wrong tries count toward the lock. Replacing a verified number also needs a trusted device, checked first. A wrong MPIN leaves the token unused. The `phone_verified` alert says the number can't reset the MPIN for 72 hours. | `src/app/api/v1/me/phone/route.ts`, `src/lib/otp/phone.ts` |

### Onboarding checks (plan 07)

| Contract | As built | Where |
|---|---|---|
| `KYC_FLOW=steps` switches to PAN, DigiLocker and bank. | Changed: only for India accounts (`jurisdiction` `IN`); other markets keep the photo check. | `src/lib/kyc/checks/config.ts` (`flowFor()`) |
| `GET /kyc` adds `flow` and `steps`. | Changed: both are sent only in the steps flow. In the photo flow neither is sent (no `flow: "photo"`); a missing `flow` means photo. In the steps flow `reasons` also lists the steps' reasons. | `src/lib/kyc/service.ts` (`kycView()`) |
| A name mismatch goes to a person (`needs_review`). | Changed: the step is marked `review` at once, but the check goes to a person only when all three steps are finished, as one `needs_review` record, so the reviewer sees every name together. A PAN already on another open account also goes to `review`. A step marked `done` whose document name no longer matches the account name also sends the check to a person. | `src/lib/kyc/checks/service.ts` (`conclude()`) |
| PAN stored as last 4 plus an HMAC. | Added: the name registered with the PAN is also stored on the step, like the other steps' names, so `conclude()` can compare all three with the account name. | `src/lib/kyc/checks/service.ts` (`submitPan()`) |
| (Not in the contract) | Added: a PAN already on another open account shows the customer only a generic sentence ("A person needs to look at your PAN…"), so the step can't be used to find out whether a PAN has an account. The reason goes to the reviewer-only `kyc_checks.review_note` (shown in the PAN check line) and the audit row gets `duplicate: true`. | `src/lib/kyc/checks/service.ts`, `store.ts` |
| (Not in the contract) | Added: until the account is verified, a step whose newest try was made with another provider than the one that runs it now counts as `todo` (`currentProviderNames()`), so the test provider's sample results don't carry over to Setu. | `src/lib/kyc/checks/view.ts`, `registry.ts` |
| (Not in the contract) | Added: the bank account is saved verified only when the bank step is `done`; when its holder name went to a person it is saved unverified and marked verified when the person approves the check (`confirmBankOnApproval()`, called by `decideKyc()`). | `src/lib/kyc/checks/service.ts`, `approval.ts`, `src/lib/bank` (`verifyBankAccount()`) |
| (Not in the contract) | Added: the account name is held while an ID check uses it: `PATCH /me` with a new `name` answers 409 `name_in_check` while a check is pending or with a person, or once a steps-flow step since the last rejection has compared it (`stepsHoldName()`), and 403 `name_locked` after a real ID check verified it. | `src/lib/kyc/service.ts` (`assertNameChangeAllowed()`), `src/lib/kyc/checks/view.ts` |
| (Not in the contract) | Added: `POST /kyc` (the photo check) answers 409 `kyc_flow_steps` for a steps-flow account, before the upload is counted; the step routes answer 409 `kyc_flow_off` for a photo-flow account. Each step allows 5 tries a day. | `src/app/api/v1/kyc/route.ts`, `src/lib/kyc/service.ts`, `src/lib/kyc/checks/service.ts` |
| `KYC_CHECKS_PROVIDER=test\|setu`. | Added: `KYC_CHECKS_TEST_ALLOWED` (on production the test provider, and Setu's sandbox, are refused without it), `KYC_DIGILOCKER_REDIRECT_URL`, and the `SETU_*` keys. With `NODE_ENV=production`, `SETU_BASE_URL` must be set to an https URL (500 `server_config` otherwise, `setuBaseUrl()`). | `src/lib/kyc/checks/config.ts`, `providers/setu.ts` |
| (Not in the contract) | Added: the web `/verify` page reads DigiLocker's return link for `success`, `id` and `errCode` only; known codes map to fixed sentences (`digilockerErrorText()`), anything else to a generic one. `errMessage` is never shown. | `src/components/identity/kyc-steps.tsx` |

### Server hardening (plan 05)

| Contract | As built | Where |
|---|---|---|
| Production without `FIREBASE_PROJECT_ID` refuses to start. | Added: start-up warnings for other missing settings (`IDENTITY_SECRET`, `ADMIN_EMAILS`, `FIREBASE_WEB_API_KEY`, proxy trust, and a missing or sandbox `SETU_BASE_URL` when the steps flow uses Setu). | `src/lib/auth/config.ts` (`productionStartupWarnings()`) |
| A general limit per user and per IP. | Changed: the per-IP limit applies only when the client IP can be trusted (behind a proxy named by `TRUST_PROXY_HOPS` or `TRUST_PROXY_HEADER`); the per-user limit applies only in firebase mode. The per-user limit runs in `session()`, so it covers `GET /me` too and runs before the calling device is recorded; a recovery claimant is counted under its own sign-in, not the wallet. Added: `TRUST_PROXY_HEADER`, to believe exactly one proxy header. | `src/lib/api.ts`, `src/lib/auth/session.ts`, `src/lib/auth/context.ts` |
| Tighter limits on MPIN, OTP and uploads. | Changed: uploads have 20 per person per hour (`UPLOADS_PER_HOUR`) across bills, receipts, ID photos and limit-request documents. Only an accepted upload counts: `POST /kyc` refuses a steps-flow account before counting, `POST /limits/emergency` counts only when a file is sent, and the proof and receipt routes check `assertUploadsLeft()` before reading the body and count once the withdrawal or request is known to take the file. OTP keeps its own limits. MPIN has no separate rate limit: the escalating lock does that job. A 429 from the shared limiter carries `Retry-After`. | `src/lib/rate-limit.ts`, `src/app/api/v1/kyc/route.ts`, `src/app/api/v1/limits/emergency/route.ts` |
| The assistant route checks `x-ai-consent`. | Added: the refusal is 403 `ai_consent_required`. | `src/app/api/v1/assistant/route.ts` |
| `x-ai-consent`: a missing header means no. | Added: the same holds in storage. `proofs.ai_allowed` defaults to 0 (in `CREATE TABLE` and the migration; an older database keeps its `DEFAULT 1`, but every insert passes the value). `createProof()` requires `aiAllowed`, and only `true` lets the AI read the proof. The seed passes 1 for the bundled sample documents. | `src/lib/db.ts`, `src/lib/verification/pipeline.ts`, `src/lib/seed.ts` |

### Error codes beyond the contract

The contract lists `mpin_required`, `mpin_wrong`, `mpin_locked`, `mpin_weak`, `device_untrusted`, `device_revoked` and `server_error`. The code also uses:

| Area | Codes |
|---|---|
| Devices | `device_unknown` (400), `device_not_found` (404), `signed_out` (401: a sign-in older than the account's last device sign-out, from anything but a trusted device; the same code as a missing token) |
| Push | `push_token_invalid` (400) |
| OTP | `otp_unavailable` (503), `otp_send_failed` (502), `otp_rate_limited` (429, `retryAt`), `otp_not_found` (404), `otp_wrong` (400, `triesLeft`), `otp_exhausted` (410), `otp_expired` (410), `otp_used` (410), `verification_invalid` (400), `phone_invalid` (400), `phone_required` (409), `phone_recently_changed` (403, `allowedAt`) |
| KYC steps | `kyc_flow_off` (409), `kyc_flow_steps` (409), `kyc_step_order` (409), `kyc_step_done` (409), `kyc_step_waiting` (409), `kyc_request_expired` (409), `kyc_request_not_found` (404), `provider_unavailable` (503), `name_in_check` (409, `PATCH /me`); and the existing `invalid_id`, `kyc_done`, `kyc_in_review`, `name_locked` (403), `rate_limited`, `server_config` |
| Rate limits | `rate_limited` (429, with `Retry-After`) |
| AI | `ai_consent_required` (403) |
