# Devices (server)

Which phones use an account. A new phone is untrusted: for its first 24 hours it can move money out only up to a small amount per move, unless the person trusts it with a texted code and their MPIN. Any device can sign out the others; a signed-out device is refused on every request, and so is any sign-in that started before the sign-out, except on a trusted device. Plan: [docs/plans/06-devices-alerts-otp.md](../../../docs/plans/06-devices-alerts-otp.md). Contract: [docs/plans/contracts.md](../../../docs/plans/contracts.md), "Devices, alerts and OTP".

## Switch

| Variable | Effect |
|---|---|
| `DEVICES_ENFORCED` | Unset or anything but `"false"` (the default): the rules below are enforced. |
| `DEVICES_ENFORCED=false` | Rollback mode: devices are still recorded and alerts still raised, but nothing is refused (no cap, signed-out devices and older sign-ins get in, new devices may change the phone number and reset the MPIN). The new-device limit still applies (it only stops recording). |

## Rules

- **Headers.** The phone sends `x-device-id` (its install id), `x-device-platform` (`ios`, `android`, `web`) and `x-app-version` on every request. An id must be 8 to 100 characters of `A-Z a-z 0-9 . _ : -`; a missing, malformed or `"unknown"` id counts as no id. A bad platform or version is stored as null.
- **Recording.** `session()` (lib/auth/session.ts) calls `touchDevice()` on every request that resolves a wallet with full access (not for a recovery claimant's read-only access: a claimant never becomes a device of the wallet it claims). It runs after the per-person rate limit. First sight adds a row (audited `device.registered`); `last_seen` is written at most once a minute, the platform and app version whenever they change.
- **New-device limit.** An account adds at most **5 device rows an hour** and has at most **20 signed in** at once. Past either, a new id is not recorded, raises no alert and is treated as unidentified and **untrusted** (in prototype mode too), so rotating `x-device-id` can't fill the table or flood the inbox.
- **First device.** The account's first device (no rows yet) is trusted at once **only on a wallet opened in the last hour** (the device that signed up). "Opened" is the wallet's first ledger account's `created_at` (`walletOpenedAt()`), because the practice data back-dates `users.created_at` by months. On an older wallet with no devices, the first device starts untrusted like any other. **Prototype mode** (no sign-in) keeps trusting the first device whatever the wallet's age, so the local demo phone isn't capped; later devices still start untrusted. Every device not trusted at once raises a `new_device` alert. Signed-out rows still count, so signing out every phone doesn't make the next one "first".
- **Trusted** means trusted with a texted code and the MPIN (or the sign-up device), or 24 hours after first seen (`trustableAt = first_seen + 24 h`). A signed-out device is never trusted. A device **first seen after a device was signed out of the account** (`devices.cool_down = 0`) never trusts itself: only a texted code and the MPIN do (`trustableAt: null`).
- **Untrusted cap.** Money out (actions marked `deviceCap` in `src/lib/money-routes.ts`: `withdraw`, `wallet_spend`, `wallet_cash_out`, `emergency`) above `untrustedMoveCap(user)` = USD 50 × `CURRENCY_SCALE`, rounded to a whole unit (₹4,000, €48, £40), is refused with 403 `device_untrusted` and `trustableAt`. The cap is **per move** (the account's own limits still apply on top). Moves into a vault and investing aren't money out and aren't capped.
- **Signed out (revoked).** 401 `device_revoked` on every request, `GET /me` included, so the phone can sign itself out. Its push tokens are removed. The same install id stays signed out; reinstalling the app gives a new id, which is a new (untrusted) device.
- **Older sign-ins end too.** Revocation is keyed on the client-chosen install id, so on its own the same Firebase sign-in could carry on with a new id or none. So signing a device out also records the time on the account (`users.devices_revoked_at`, the latest sign-out). After that, a request whose sign-in started earlier (the token's `auth_time`, compared in whole seconds) is refused with **401 `signed_out`** unless it comes from a trusted, signed-in device of the account. A new id on such a request is refused before anything is written (no row, no alert). Signing in again gives a fresh `auth_time`; the device is then new, and (rule above) waits for a texted code and the MPIN.
  - **Why `auth_time`:** it is when the person last signed in (typed their password, etc.) and stays the same when the app refreshes its one-hour ID token, so a stolen refresh token can't outlive the sign-out by refreshing. `iat` (when this ID token was issued) changes on every refresh, so it would let a stolen session back in within the hour; it is used only if a token has no `auth_time` (Firebase always sends it). `verify.ts` returns it as `signedInAt`.
  - The owner's other devices: a trusted one keeps working; an untrusted one (say, a browser under 24 hours old) must sign in again, and then cools down as before, since it was first seen before the sign-out.
- **Account changes during the cool-down.** An untrusted device can't sign out a trusted device, replace the verified phone number, or reset the MPIN (403 `device_untrusted` with `trustableAt`). It can sign itself out and sign out other untrusted devices. This stops a stolen sign-in on a new phone from locking the owner out or taking over the codes during the 24 hours in which the owner can see the `new_device` alert and act.

### Requests without a device id

Every current client sends `x-device-id`: the phone always, and the web app with sign-in on (its own random id and `x-device-platform: web`, kept in localStorage: `src/components/identity/device.ts`; it follows the same rules as a phone). The web app with sign-in off, scripts and tests send none. Such a request is **unidentified**: it isn't recorded and can't be trusted or signed out.

- In **prototype mode** (no sign-in, one customer) it counts as trusted, so the web demo keeps working.
- In **firebase mode** it is an untrusted device that never cools down (`trustableAt: null`), whatever devices the account has, so moves over the cap need a registered device. Without this, leaving the header off would skip every device rule (and a stolen token on an account with no devices yet would count as trusted).

Firebase-mode tests that move more than the cap send a device id.

## Files

| File | What |
|---|---|
| `config.ts` | `devicesEnforced()`, `UNTRUSTED_CAP_USD`, `COOL_DOWN_MS`, `NEW_ACCOUNT_WINDOW_MS`, `NEW_DEVICES_PER_HOUR`, `MAX_ACTIVE_DEVICES`, `LAST_SEEN_EVERY_MS` |
| `rules.ts` | pure: `readDeviceHeaders()`, `isTrusted()`, `trustableAtOf()`, `coolDownEnds()`, `signedInBefore()`, `untrustedMoveCap()` |
| `store.ts` | table `devices (id, user_id, install_id, platform, app_version, first_seen, last_seen, trusted_at, revoked_at, cool_down)`, unique on `(user_id, install_id)`, and the column `users.devices_revoked_at`, created on first use (`cool_down` is added to older tables); `walletOpenedAt()` reads the wallet's first ledger account |
| `service.ts` | `touchDevice()`, `currentDevice()`, `assertDeviceMayMove()`, `assertTrustedDevice()`, `assertRegisteredDevice()`, `trustDevice()`, `revokeDevice()`, `listDevices()`, `deviceStatus()` |
| `errors.ts` | `DeviceError` (an `HttpError` with `extra`, spread into the JSON by `errorResponse()`), `sessionEndedError()` (401 `signed_out`) |
| `index.ts` | the module's public surface |

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/v1/devices` | | `{ devices: [{ id, platform, appVersion, firstSeen, lastSeen, trusted, trustableAt, current }] }` (signed-in devices, most recently used first) |
| POST | `/api/v1/devices/trust` | `{ verificationToken, pin }` | `{ ok: true }`; trusts the calling device (token from an OTP with purpose `device_trust`; MPIN always checked) |
| POST | `/api/v1/devices/{id}/revoke` | `{ pin }` | `{ ok: true }` (MPIN always checked; signing out twice is a no-op) |
| GET | `/api/v1/me` | | adds `device: { registered, trusted, trustableAt }` for the calling device |

| Code | Status | Extra | When |
|---|---|---|---|
| `device_untrusted` | 403 | `trustableAt` (ms, or null for an unidentified request or a device first seen after a sign-out) | over the cap; signing out a trusted device, replacing the phone number or resetting the MPIN from an untrusted device |
| `device_revoked` | 401 | | any request from a signed-out device |
| `signed_out` | 401 | | firebase mode: a sign-in older than the account's last device sign-out, from anything but a trusted device (sign in again) |
| `device_unknown` | 400 | | trusting (or asking for a `device_trust` code) without a device id |
| `device_not_found` | 404 | | revoking a device that isn't on this account |

## Touch points outside this folder (marked `// devices`)

| File | What |
|---|---|
| `src/lib/auth/session.ts` | `touchDevice()` in `session()` with the token's `signedInAt` (not for recovery access); `Session.device` |
| `src/lib/auth/verify.ts` | `VerifiedToken.signedInAt` (`auth_time`, else `iat`) |
| `src/lib/money-routes.ts` | `deviceCap` on the money-out actions; `device_trust` and `device_revoke` actions (for the MPIN check) |
| `src/app/api/v1/vaults/[id]/withdrawals`, `wallet/spend`, `wallet/cash-out`, `emergency/withdrawals` | `await assertDeviceMayMove(user, minor(b.amount), "<action>")` before `requireMpin()` |
| `src/app/api/v1/devices/**` | the routes above |
| `src/app/api/v1/otp/send`, `me/phone`, `mpin/reset` | `assertTrustedDevice()` / `assertRegisteredDevice()` |
| `src/app/api/v1/me/route.ts` | `device` on GET |
| `src/app/api/v1/push/register` | ties a push token to the calling device |
| `src/components/devices-alerts.tsx`, `src/app/settings/page.tsx` | the web's devices list with sign-out, and "Trust this device" (texted code and MPIN) |
| `tests/devices.test.ts` | tests |

## Remove it

1. Delete this folder, `src/app/api/v1/devices/` and the web section in `src/components/devices-alerts.tsx` (or just its devices part).
2. Remove the `// devices` lines above.
3. `DROP TABLE devices;` (the `users.devices_revoked_at` column can stay).
