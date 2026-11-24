# 06. Registered devices, alerts and phone OTP

**Status:** server, web and phone built (22 November 2026); SMS through Twilio not yet tried against Twilio; phone push and a real remote sign-out not yet tried on a build · **Owner:** Claude (code), Shaik (SMS account) · **Size:** L

## Goal

Work like UPI apps: the account knows which phone it's on, a new phone has to prove itself, and every login and money move sends an alert. Add phone number verification by OTP ([security overview](../security.md), gaps 13 and 14).

## Scope

- **In:** device registration, new-device verification and a 24-hour cool-down on large transfers, alerts (in the app and by push), phone OTP at sign-up and for MPIN reset, a "devices" screen with sign-out.
- **Out:** UPI-style SIM binding by SMS from the phone (Android-only and needs NPCI-level integration), and SMS transaction alerts in production (they need DLT registration in India).

## Design

### Devices: `src/lib/devices/` (new module)

- Table `devices (id, user_id, install_id, name, platform, first_seen, last_seen, trusted_at, revoked_at)`.
- On sign-in, the phone sends its install id (already in `mobile/src/lib/api/identity.ts`) and model. A new device starts **untrusted**.
- Trusting a device needs an OTP to the verified phone number plus the MPIN. Until then: read-only access, and transfers above a set amount wait 24 hours.
- Any device can sign out the others. Recovery approval and account closing already disable other identities; they also revoke devices.
- Later, plan 08 can add Play Integrity / App Attest so the server knows the app is genuine.

### Alerts: `src/lib/alerts/` (new module)

- Table `alerts (id, user_id, kind, title, body, created_at, read_at)`. Kinds: new login, new device, money out, limit change, MPIN locked.
- Senders sit behind an interface: in-app (the table), push (`expo-notifications`, added in plan 02), and email or SMS later. Open/closed: a new channel is a new sender.
- Recovery notices (`src/lib/recovery/notify.ts`) move onto the same senders.

### Phone OTP

- An `OtpSender` interface with two implementations: **test mode** (fixed codes for test numbers, for the capstone) and an SMS provider (MSG91 or Twilio), chosen by env var. Codes are 6 digits, valid 5 minutes, at most 3 tries, with a rate limit per number.
- Used for: adding a phone number at sign-up, trusting a new device, and resetting a forgotten MPIN.
- Firebase phone sign-in is an alternative, but on React Native it usually needs a native module and a billing account. Decide when starting this step.

## Changes

| File | Change |
|---|---|
| `src/lib/devices/*`, `src/lib/alerts/*`, `src/lib/otp/*` | **New** modules with tests |
| `src/lib/auth/session.ts` | Attach the device; apply untrusted-device rules |
| Money routes | The 24-hour rule for untrusted devices, through the plan 03 policy map |
| `mobile/src/features/devices/*`, `features/alerts/*` | **New.** Devices screen, alerts inbox, OTP entry |
| `mobile/src/lib/notify.ts` | Push registration, using the plan 02 adapter |

## Tests

- Unit tests: device trust states, the 24-hour rule, OTP expiry and attempt limits, alert creation for each kind.
- Manual: sign in on a second phone, see an alert on the first, trust it with OTP + MPIN, and check large transfers wait 24 hours before that.

## Acceptance criteria

- [ ] A new phone can't move large amounts for 24 hours unless trusted with OTP + MPIN.
- [ ] Every login and money move creates an alert, and push works on Android.
- [ ] People can see and sign out their devices.
- [ ] A forgotten MPIN can be reset with an OTP.

## Who does what

- **You:** pick an SMS provider, or stay in test mode for the capstone; set up Firebase Cloud Messaging for Android push.
- **Claude:** the modules, screens and tests.

## What was built (server)

Built 22 November 2026. The feature doc is [features/devices-alerts-otp.md](../features/devices-alerts-otp.md); differences from the contract are in [contracts.md](contracts.md), "Deviations as built".

### Files

| File | What it does |
|---|---|
| `src/lib/devices/*` (`config`, `rules`, `store`, `service`, `errors`, `index`, `README.md`) | **New**: device records, trust, the new-device cap, sign-out |
| `src/lib/alerts/*` (`config`, `store`, `raise`, `senders`, `push`, `messages`, `index`, `README.md`) | **New**: the in-app inbox, Expo push, push tokens, alert wording |
| `src/lib/otp/*` (`config`, `senders`, `twilio`, `store`, `service`, `phone`, `errors`, `index`, `README.md`) | **New**: texted codes, verification tokens, the verified phone number |
| `src/lib/auth/session.ts` | `touchDevice()` on every request that finds a wallet; `Session.device` |
| `src/lib/money-routes.ts` and the money-out routes | `deviceCap` on `withdraw`, `wallet_spend`, `wallet_cash_out`, `emergency`; `assertDeviceMayMove()` before the MPIN |
| `src/app/api/v1/{devices,alerts,push/register,otp,me/phone}/**`, `mpin/reset` | **New** routes |
| Alert call sites in `src/lib/vaults.ts`, `wallet/moves.ts`, `emergency.ts`, `limits.ts`, `mpin/*`, `otp/phone.ts` | One line each (`// alerts`) |
| `src/components/devices-alerts.tsx`, `src/app/settings/page.tsx` | **New** web "Devices and alerts" card: phone number, devices with sign-out, recent alerts |
| `src/components/identity/device.ts`, `session.ts`, `src/lib/client.ts` | The web sends its own device id with sign-in on; `device_revoked` reads as a sign-out |

### Decisions

- **A per-move cap instead of read-only.** An untrusted device can still use the app and move small amounts (USD 50 equivalent per move) for 24 hours. This is closer to how UPI apps behave and less likely to lock out a real customer on a new phone.
- **New devices can't take over.** During the cool-down they also can't sign out a trusted device, replace the verified number or reset the MPIN; the owner sees the `new_device` alert in that window.
- **Unidentified requests** (no device id) are trusted only until the account registers a device, so leaving the header off can't skip the rules, while prototype mode and old clients keep working. (Changed by the review below: in firebase mode they are now always untrusted.)
- **Alerts commit with the work.** The in-app row is written inside the caller's transaction; push goes out afterwards, only if the row still exists, and never throws.
- **Push through Expo's push service**, not FCM directly, because the phone app uses `expo-notifications`.
- **OTP behind `OtpSender`**: `test` for development and demos, `twilio` written from Twilio's docs. Codes stored as an HMAC, tokens as a SHA-256, both single use.
- **Phone columns on first use** (`users.phone`, `phone_verified_at`), not in `db.ts`, so the module can be removed.

### Tests

`tests/devices.test.ts`, `tests/alerts.test.ts`, `tests/otp.test.ts` (Twilio and Expo with `fetch` mocked), plus the reset case in `tests/mpin.test.ts`.

### Acceptance criteria, server side

| Criterion | Server |
|---|---|
| A new phone can't move large amounts for 24 hours unless trusted with OTP and MPIN | Done (per move, above USD 50 equivalent) |
| Every login and money move creates an alert, and push works on Android | Partly: new-device sign-ins and money out raise alerts; a sign-in from a known device and money into vaults don't. Push is built; Android delivery needs the owner's FCM setup. |
| People can see and sign out their devices | Done (API and web card) |
| A forgotten MPIN can be reset with an OTP | Done (from a trusted device) |

### Not built from the design above

- The device's model name isn't recorded (only platform and app version).
- Recovery approval and account closing don't sign devices out.
- Recovery notices (`src/lib/recovery/notify.ts`) still don't go through the alert senders, and the `account_closed` notice is still never sent (maintainability B15).

### Left for the owner

- **SMS:** a Twilio account with a sending number or Messaging Service (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `OTP_MODE=twilio`), tried with a trial account first; DLT registration for Indian numbers in production. Or, for the capstone, `OTP_MODE=test` with `OTP_TEST_ALLOWED=true` on the demo server.
- **Push:** upload the project's Firebase Cloud Messaging credentials to Expo for Android; set `EXPO_ACCESS_TOKEN` if enhanced push security is turned on.

### Review findings and fixes

The security review of 22 November 2026 ([security.md](../security.md#security-review-2026-11-22)) found these in plan 06's server work; all are fixed, with tests in `tests/devices.test.ts` and `tests/otp.test.ts`:

| Finding | Severity | Fix |
|---|---|---|
| **MPIN takeover.** `POST /me/phone` needed only a code to the new number, so a stolen sign-in could put its own number on the account, then reset the MPIN with it. | High | `{ verificationToken, pin }`: the current MPIN is checked as `phone_change` (always, even in rollback mode; a wrong MPIN doesn't use up the token). Replacing a number also needs a trusted device, checked first. For 72 hours after the verified number is added or changed, `POST /otp/send` (`mpin_reset`) and `POST /mpin/reset` answer 403 `phone_recently_changed` with `allowedAt` (`assertPhoneSettled()` in `src/lib/otp/phone.ts`); the `phone_verified` alert says so. |
| **Trust on first use.** Any account's first device was trusted at once, and in firebase mode a request without a device id was trusted while the account had no devices. | High | With sign-in on, only a wallet opened in the last hour (`walletOpenedAt()`, `NEW_ACCOUNT_WINDOW_MS`) trusts its first device (prototype mode still trusts the first device at once); an older account's first device starts untrusted with a `new_device` alert. In firebase mode a request without `x-device-id` is always untrusted (`trustableAt: null`); prototype mode still trusts it. |
| **Revocation didn't end the sign-in.** Signing out was keyed on the client-chosen install id, so the same Firebase sign-in carried on with a new id or none. | High | `users.devices_revoked_at` records every sign-out (a device signing itself out included). `verifyIdToken()` returns `signedInAt` (`auth_time`, falling back to `iat`); a sign-in older than the last sign-out gets 401 `signed_out` unless from a trusted signed-in device. A device first seen after a sign-out has `devices.cool_down = 0` and never trusts itself (code and MPIN only). The `device_revoked` alert no longer promises the device is out for good. |
| **Unlimited new device ids.** Rotating `x-device-id` added rows and `new_device` alerts without limit. | Medium | 5 new ids an hour and 20 signed in per account. Past it nothing is written, no alert, and the request is unidentified and untrusted; `/me` shows `device: { registered: false, … }`; `POST /devices/trust` answers 400 `device_unknown`. |
| **OTP abuse.** The 5-an-hour limit per number counted every account, so anyone could block another person's codes. | Medium | 5 an hour per person, and per person to one number; 15 `phone_verify` an hour to one number across accounts, counting and refusing only sends to a number the sender hasn't verified (`otp_codes.new_number`). |
| **Recovery claimants.** A claimant's read-only session was recorded as a device of the wallet it claimed. | Medium | Claimant sessions skip `touchDevice()`, and `/me` shows no device for them; the per-person rate limit moved into `session()` and counts a claimant under its own uid. |

The web app sends the MPIN with the phone-number form and has a "Trust this device" flow (`src/components/devices-alerts.tsx`).

## What was built (phone)

Built 22 November 2026. The phone side is described in [features/devices-alerts-otp.md](../features/devices-alerts-otp.md#on-the-phone); each module has a README with its touch points: [devices](../../mobile/src/features/devices/README.md), [alerts](../../mobile/src/features/alerts/README.md), [phone-verify](../../mobile/src/features/phone-verify/README.md).

### Files

| File | What it does |
|---|---|
| `mobile/src/features/devices/` (`config.ts`, `DevicesScreen.tsx`, `TrustDeviceScreen.tsx`, `useDeviceWatch.ts`, `model.ts`, `index.ts`, `README.md`) | **New**: Your devices, sign out a device with the MPIN, Trust this phone (code, then MPIN), sign out on `device_revoked`, the Practice tools |
| `mobile/src/features/alerts/` (`config.ts`, `AlertsBell.tsx`, `AlertsScreen.tsx`, `hooks.ts`, `push.ts`, `model.ts`, `index.ts`, `README.md`) | **New**: the bell on Home, the inbox, polling, push registration and unregistering on sign-out |
| `mobile/src/features/phone-verify/` (`config.ts`, `PhoneVerifyScreen.tsx`, `OtpCodeScreen.tsx`, `PhoneNeeded.tsx`, `useOtp.ts`, `errors.ts`, `phone.ts`, `index.ts`, `README.md`) | **New**: add or change the phone number; the code step shared with trusting and MPIN reset |
| `mobile/src/features/mpin/ResetMpinScreen.tsx`, `errors.ts` (`readDeviceError`), `MpinSheet.tsx`, `MpinPanel.tsx`, `useMpinEntry.ts` | Forgot your MPIN; `device_untrusted` in the MPIN prompt with **Trust this phone** |
| `mobile/src/app/settings/devices.tsx`, `trust-device.tsx`, `alerts.tsx`, `verify-phone.tsx`, `reset-mpin.tsx`, `settings/_layout.tsx` | **New** routes; the code and MPIN flows are full-screen modals |
| `mobile/src/lib/api/device.ts` | **New**: the install id, the three device headers, the `device_revoked` signal |
| `mobile/src/lib/api/security.ts`, `security-types.ts` | **New**: live devices, alerts, push, codes, phone number, MPIN reset, read defensively |
| `mobile/src/lib/api/http.ts`, `client.ts`, `identity.ts`, `keys.ts`, `errors.ts`, `types.ts`, `features/auth/exportData.ts` | Headers on every request (and the assistant stream and export); `securityLive`; the shared `installId()`; `qk.devices`, `qk.alerts`; plain fallbacks for the new codes; `phone` and `device` on `/me` |
| `mobile/src/lib/storage.ts`, `lib/session.ts` | `KEYS.deviceId`; `resetDevice({ forgetDevice })` |
| `mobile/src/features/auth/gate.ts`, `index.ts` | `onBeforeSignOut()`; `signOutOfVaultwise(notice, { forgetDevice })` |
| `mobile/src/features/account/settings/delete/finishDeletion.ts`, `features/protection/lockout.ts` | Forget the install id after closing a signed-in account and after the wrong-PIN lockout |
| `mobile/src/features/home/HomeHeader.tsx`, `account/settings/SettingsHome.tsx` | The bell and `useDeviceWatch()`; the Your devices, Phone number, Alerts and Forgot your MPIN? rows |
| `mobile/src/lib/api/demo/devices.ts`, `demo/alerts.ts`, and lines in `demo/index.ts`, `vaults.ts`, `wallet.ts`, `emergency.ts`, `lib/api/pay-sim.ts` | **New** Practice mirrors: one trusted device, the ₹4,000 cap, code `123456`, the inbox; `CURRENCY_SCALE` exported |

### Decisions and deviations

- **The install id is kept through a normal sign-out** and replaced after Delete account (closing a signed-in account), a remote sign-out and the wrong-PIN lockout. A revoked id stays refused on the server, so a phone signed out from elsewhere could otherwise never sign in again; a phone that may be in the wrong hands should come back as a new, untrusted device.
- **The remote sign-out listens on Home's header** (`useDeviceWatch()`), which stays mounted while the app is open. A revocation seen earlier (behind the unlock screen) is handled once Home mounts. It acts only with sign-in on.
- **Push unregisters through a seam**, `onBeforeSignOut()` in `features/auth/gate.ts`, so the auth module doesn't know about alerts. The step runs while the login still works, capped at 3 seconds, and sends the install id the token was registered from.
- **Push registers on live data only, once someone is in the app,** and never blocks: no permission or no FCM credentials just means no token, retried next launch. Practice never asks.
- **Alerts poll** every 60 seconds while the app is open, stop on a 404 (an older server), and refresh after every money move (`alerts` in `MONEY_QUERIES`).
- **Code answers are read in one table** (`phone-verify/errors.ts`), MPIN-prompt device answers in `mpin/errors.ts`, so a renamed code is a one-line change.
- **The test code is shown on screen** whenever the server (`OTP_MODE=test`) or Practice returns `testCode`, with **Use this code**.
- **Device names are platforms only;** the plan's device model isn't sent (the server doesn't record it either).
- **Practice can try the new-phone rules** without a second phone: "Pretend another phone signed in" and "Start this phone over as new" on Your devices.
- **Practice checks the MPIN before the cap;** the server checks the cap first. Noted in [practice-mode.md](../features/practice-mode.md#rules-it-mirrors). (Changed by the review below: Practice now checks the cap first, as the server does.)

### How it was checked

- `npm run typecheck` and `npm run lint` in `mobile/` pass (re-run for these docs); `npm run doctor`; `npx expo export` for Android and web.
- The flows were tried in the browser preview on Practice data, where the simulator mirrors the server's codes and rules. The browser gets no push token and Practice can't revoke the phone it runs on.
- To repeat by hand in Practice: add a phone number with code `123456`; on Your devices, "Start this phone over as new", then try a withdrawal over ₹4,000 (refused with a time) and trust the phone with the code and `246810`; "Pretend another phone signed in", then sign it out; watch the bell count go up.

### Still needs a real phone (and the live server)

- Push: a token registered on a build with `google-services.json`, an alert arriving as a notification, and `DELETE /push/register` on sign-out.
- A real remote sign-out: sign out phone A from phone B, see A sign itself out with the note, and sign in again as a new device.
- Codes by SMS once Twilio is set up; the phone's one-time-code autofill from the text.
- That the install id survives a sign-out and is new after Delete account, on Android and iOS, and that an iOS reinstall gets a new one (the fresh-install wipe added by the phone review, since Keychain entries outlive an uninstall).

### Acceptance criteria, phone side

| Criterion | Phone |
|---|---|
| A new phone can't move large amounts for 24 hours unless trusted with OTP and MPIN | The MPIN sheet explains the refusal and opens Trust this phone (code, then MPIN). Practice mirrors the cap. |
| Every login and money move creates an alert, and push works on Android | The inbox and bell show what the server raises; push registration is built, not yet tried on a build |
| People can see and sign out their devices | Done (Your devices, MPIN to sign out) |
| A forgotten MPIN can be reset with an OTP | Done (Forgot your MPIN, from a trusted phone with a verified number) |

### Left for the owner

- Add `google-services.json` before the plan 02 APK build ([steps](02-apk-rebuild-prep.md#before-you-build-push-notifications)), then upload the FCM service-account key to Expo.
- Run the live server with `OTP_MODE=test` (and `OTP_TEST_ALLOWED=true` on a production `NODE_ENV`) until Twilio is set up, or texted codes answer 503.
- A second phone, to try a real remote sign-out on `tester-live`.

### Review findings and fixes (phone)

The two phone security reviews of 22 November 2026 ([security.md](../security.md#security-review-2026-11-22)) found these in the phone's devices, alerts and codes work, and the phone then followed the server's new contract. All are fixed.

| Finding | Severity | Fix |
|---|---|---|
| **Practice device rules differed from the server's** (trust, cap rounding, the order of the cap and the MPIN, revoking). | Low | `practiceTrusted()` (trusted with a code and the MPIN, or 24 hours, never when signed out) for every rule; the cap rounded to a whole unit and checked before the MPIN; revoking checks the MPIN first (`lib/api/demo/devices.ts`). |
| **A server without sign-in that refused the install id left the phone stuck** (even Delete account was refused). | Low | With sign-in off, `device_revoked` drops the install id (`forgetInstallId()` in `lib/api/device.ts`, at most once a minute). |
| **A failed storage read made a new install id** (a new, untrusted device and an alert to the owner). | Low | The read is retried once, then `unknown` for that run; the saved id is never overwritten (`getItemStrict()` in `lib/storage.ts`). |
| **Deleting the Practice account left a live login open** with no PIN or lock. | Medium | `finishDeletion()` signs that login out too, keeping the install id. |
| **The Practice alerts in the plain save held the phone number and payee names.** | Low | Alerts say "your verified number" and "the payee"; `generaliseAlert()` rewords older saves. |

Round 2, the new server contract:

- **Phone number:** number, then code, then the MPIN (the shared `MpinPanel`, passed into `PhoneVerifyScreen` as a prop from `app/settings/verify-phone.tsx` to avoid a module cycle), then `POST /me/phone`. A wrong MPIN keeps the token; Done mentions the 72-hour reset pause. Practice mirrors `phone_change`.
- **`phone_recently_changed`:** Forgot your MPIN shows "Resetting your MPIN is paused" with the end time. Practice mirrors the hold, keeping a one-way key of the whole number in its secure slice to spot the same number.
- **`signed_out` from any request:** `lib/api/signed-out.ts`; `startAuth()` signs out once with the server's message when the request was sent after the current sign-in.
- **Trust states:** `phoneTrust()` in `features/mpin/errors.ts` (trusted, cooling, needs code, unrecognised). `trustableAt: null` shows "Trust with a code" in the sheet, Your devices and Settings, and the list label "Needs a code"; `registered: false` or `device_unknown` shows a calm explanation with no Trust button. In Practice, devices first seen after a Practice sign-out never cool down.
- **Rate limits:** queries no longer retry a 4xx (only status 0 or a 5xx, once); `/me` stays fresh 30 s; a 429's `Retry-After` is stored as `retryAt`; a 429 never signs out.
- **Not simulated in Practice:** the new-device limit and the `signed_out` for older sign-ins.
