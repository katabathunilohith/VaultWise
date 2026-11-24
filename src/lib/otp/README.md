# OTP (server)

6-digit codes texted to the person's phone: to verify the number, to trust a new device, and to reset a forgotten MPIN. Plan: [docs/plans/06-devices-alerts-otp.md](../../../docs/plans/06-devices-alerts-otp.md). Contract: [docs/plans/contracts.md](../../../docs/plans/contracts.md), "OTP".

## Switches

| Variable | Effect |
|---|---|
| `OTP_MODE=test` | No SMS: `POST /otp/send` answers the code as `testCode`. Refused (503 `otp_unavailable`) when `NODE_ENV=production`, unless `OTP_TEST_ALLOWED=true`. |
| `OTP_MODE=twilio` | SMS through Twilio's Messages API. Needs `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` (an E.164 number, or a Messaging Service SID `MG…`). Missing → 503 `otp_unavailable` and a log line. |
| unset | Off: `POST /otp/send` answers 503 `otp_unavailable`. Set `OTP_MODE=test` in `.env.local` for development. |
| `OTP_TEST_ALLOWED=true` | Lets the test sender run on a production build (a capstone demo server). |
| `IDENTITY_SECRET` | Keys the code hashes when set (see below). |

The Twilio sender is **written from Twilio's docs, not run against Twilio**; it is unit-tested with `fetch` mocked. Try it with a trial account first. Indian numbers in production also need DLT registration of the sender and template.

## Rules

- Codes are 6 random digits, valid **5 minutes**, **3 tries** (the third wrong try uses the code up). A new code replaces the person's earlier unused codes for the same purpose.
- **Send limits** (each 429 `otp_rate_limited` with `retryAt`; a send the provider refuses still counts):
  - **5 an hour per person**, and 5 an hour per person to one number;
  - **15 `phone_verify` codes an hour to one number from all accounts together**, counting only sends to a number the sending account hasn't verified (`otp_codes.new_number = 1`) and refusing only those. So other accounts can slow down new sign-ups to a number, but can never block the owner's own `device_trust` and `mpin_reset` codes (or re-verifying) on their verified number. (Before, one 5-an-hour limit per number counted every account, so anyone could block someone else's codes.)
- **Stored hashed:** `HMAC-SHA256(IDENTITY_SECRET or a fixed dev key, "otp:<id>:<random salt>:<code>")`. The code is never stored or logged.
- **Purposes:** `phone_verify` (to the number in the body), `device_trust` and `mpin_reset` (to the verified number; 409 `phone_required` without one).
- **Verification tokens:** a right code gives a random 32-byte token, stored as its SHA-256, valid **10 minutes**, **single use**, bound to the person, the purpose and the number the code went to. `consumeVerification()` is called inside the action's transaction, so a failed action leaves it unused.
- **The phone number** lives on `users` (`phone`, `phone_verified_at`), columns this module adds on first use. A number is stored only once a code proved it. `/me` shows it masked (`+91••••••3210`). Proving the number that is already verified changes nothing.
- **Adding or replacing the number needs the MPIN** (`POST /me/phone` with `pin`), checked by `requireMpin(..., "phone_change", { always: true })`, so whatever `MPIN_ENFORCED` says, and wrong tries count toward the lock. The number receives the codes that trust devices and reset the MPIN, so a stolen sign-in alone must not be able to put its own number on the account.
- **72-hour hold on MPIN reset.** For 72 hours after the verified number was added or changed (`phone_verified_at`), it can't reset the MPIN: `POST /otp/send` (`mpin_reset`) and `POST /mpin/reset` answer 403 `phone_recently_changed` with `allowedAt` (ms). The `phone_verified` alert says so. (`assertPhoneSettled()` in `phone.ts`.)
- **Device rules** (from `src/lib/devices`, applied by the routes): replacing a verified number and resetting the MPIN need a trusted device; a `device_trust` code needs a device id. Checked before a code is sent.

## Files

| File | What |
|---|---|
| `config.ts` | `otpMode()`, `otpTestAllowed()`, purposes and the fixed numbers (`OTP_SENDS_PER_HOUR`, `OTP_NEW_NUMBER_SENDS_PER_HOUR`, `PHONE_RESET_HOLD_MS`) |
| `senders.ts` | `OtpSender`, `testOtpSender`, `otpSender()` (picks by `OTP_MODE`) |
| `twilio.ts` | `twilioConfig()`, `twilioSender()` |
| `store.ts` | tables `otp_codes` (with `new_number`, added to older tables) and `otp_verifications`, created on first use |
| `service.ts` | `sendOtp()`, `verifyOtp()`, `consumeVerification()`, `smsText()` |
| `phone.ts` | the `users.phone` columns, `normalisePhone()`, `maskPhone()`, `verifiedPhone()`, `phoneStatus()`, `phoneChangedAt()`, `assertPhoneSettled()`, `setVerifiedPhone()` |
| `errors.ts` | `OtpError` (an `HttpError` with `extra`) |
| `index.ts` | the module's public surface |

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/v1/otp/send` | `{ purpose, phone? }` (`phone` only for `phone_verify`) | `{ otpId, expiresAt, sentTo, testCode? }` (`sentTo` is the masked number) |
| POST | `/api/v1/otp/verify` | `{ otpId, code }` | `{ verificationToken, purpose, expiresAt }` |
| POST | `/api/v1/me/phone` | `{ verificationToken, pin }` (purpose `phone_verify`; `pin` is the current MPIN) | `{ ok: true }`; the MPIN errors (401 `mpin_required`, 403 `mpin_wrong`, 423 `mpin_locked`); replacing a number also needs a trusted device (checked first) |
| POST | `/api/v1/mpin/reset` | `{ verificationToken, newPin }` (purpose `mpin_reset`) | `{ ok: true }`; applies the MPIN policy, needs a trusted device and a number older than 72 hours, clears wrong tries and the lock, audits `mpin.changed` `{ by: "reset" }` |
| GET | `/api/v1/me` | | adds `phone: { number, verified }` |

| Code | Status | Extra | When |
|---|---|---|---|
| `otp_unavailable` | 503 | | no sender set up (see switches) |
| `otp_send_failed` | 502 | | the SMS provider refused or didn't answer |
| `otp_rate_limited` | 429 | `retryAt` (ms) | 5 sends in the last hour for this person (or to this number by this person), or 15 `phone_verify` sends to this number by accounts that haven't verified it |
| `phone_invalid` | 400 | | not a full international number |
| `phone_required` | 409 | | `device_trust` / `mpin_reset` without a verified number |
| `phone_recently_changed` | 403 | `allowedAt` (ms) | `mpin_reset` (send or reset) within 72 hours of the verified number being added or changed |
| `otp_not_found` | 404 | | not this person's code |
| `otp_wrong` | 400 | `triesLeft` | wrong code (or not 6 digits, which isn't counted) |
| `otp_exhausted` | 410 | | the third wrong try, and any try after it |
| `otp_expired` | 410 | | over 5 minutes old |
| `otp_used` | 410 | | already used, or replaced by a newer code |
| `verification_invalid` | 400 | | token unknown, used, expired, another person's or another purpose's |

## Touch points outside this folder

| File | What |
|---|---|
| `src/app/api/v1/otp/**`, `src/app/api/v1/me/phone` | the routes |
| `src/app/api/v1/mpin/reset/route.ts` | `assertPhoneSettled()`, `consumeVerification()` (marked `// otp`) |
| `src/lib/money-routes.ts` | the `phone_change` action (MPIN always checked, marked `// otp`) |
| `src/app/api/v1/me/route.ts` | `phone` on GET (marked `// otp`) |
| `src/lib/devices/service.ts` | `trustDevice()` uses a `device_trust` token |
| `src/components/devices-alerts.tsx` | the web's phone verification (code, then the MPIN) |
| `tests/otp.test.ts` | tests |

## Remove it

1. Delete this folder, `src/app/api/v1/otp/`, `src/app/api/v1/me/phone/`; put `mpin/reset` back to its 501 answer; remove the `// otp` lines (including `phone_change` in `money-routes.ts`) and the token use in `src/lib/devices`.
2. `DROP TABLE otp_codes; DROP TABLE otp_verifications;` (the `users.phone` columns can stay).
