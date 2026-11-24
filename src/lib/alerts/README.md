# Alerts (server)

A record of every security-relevant event, shown in the app's inbox and pushed to the person's phones. Plan: [docs/plans/06-devices-alerts-otp.md](../../../docs/plans/06-devices-alerts-otp.md). Contract: [docs/plans/contracts.md](../../../docs/plans/contracts.md), "Alerts".

## Switches

| Variable | Effect |
|---|---|
| `ALERTS_PUSH` | Unset or anything but `"false"`: alerts also go out as Expo push notifications to the person's registered tokens. `"false"`: in-app only. |
| `EXPO_ACCESS_TOKEN` | Optional. Sent as `Authorization: Bearer …` when the Expo project has enhanced push security on. |

In-app alerts are always on.

## How it works

- `raiseAlert(userId, kind, title, body)` writes the alert to the in-app table **inside the caller's transaction** (a money move that rolls back leaves no alert), then, once the caller's work has finished (`setImmediate`), runs the push sender, but only if the alert row still exists. It never throws: a failure is logged and the money move goes on.
- Senders sit behind `AlertSender` (`senders.ts`): `inAppSender` (`when: "now"`) and `expoPushSender` (`when: "later"`, `accepts()` only when the person has push tokens). A new channel (email, SMS) is a new sender; `setAlertSenders()` swaps the list (tests use it).
- Expo push: one `POST https://exp.host/--/api/v2/push/send` with a message per token (`{ to, title, body, sound: "default", data: { alertId, kind } }`), 10-second timeout. Tickets with `DeviceNotRegistered` remove that token. Failures are logged with `console.warn`; nothing is retried. Push receipts aren't checked.
- Wording lives in `messages.ts` (`alertMoneyOut`, `alertEmergency`, `alertLimitLoosened`, `alertMpinLocked`, `alertMpinChanged`, `alertPhoneVerified`, `alertNewDevice`, `alertDeviceTrusted`, `alertDeviceRevoked`), so each call site elsewhere is one line.
- Push tokens: at most 10 per person (newest kept). A token registered by another account moves to it. A token is tied to the calling device, so signing that device out removes it.

## Kinds and where they are raised

| Kind | Raised in |
|---|---|
| `new_device` | `src/lib/devices/service.ts` `touchDevice()`, for any device not trusted at once (every device but a new account's sign-up device); not past the new-device limit |
| `device_trusted` | `src/lib/devices/service.ts` `trustDevice()` |
| `device_revoked` | `src/lib/devices/service.ts` `revokeDevice()` (it doesn't promise the device is out for good: it can sign in again, as a limited new device) |
| `money_out` | `src/lib/vaults.ts` `payoutWithdrawal()`; `src/lib/wallet/moves.ts` `spend()` and `cashOut()`; `src/lib/emergency.ts` `executeEmergency()` (released, or started with a hold) and `settleEmergencies()` (released) |
| `limit_loosened` | `src/lib/limits.ts` `changeLimits()` (a standard raise), `requestEmergencyLimitChange()` when approved, `reviewLimitChange()` when approved; `src/lib/wallet/moves.ts` `updateWalletSettings()` (daily limit raised or turned off) |
| `mpin_locked` | `src/lib/mpin/attempts.ts` `recordFailure()` when a wrong try starts a lock (also with `MPIN_ENFORCED=false`, when the lock holds for the `always` checks; the text says so) |
| `mpin_changed` | `src/lib/mpin/change.ts` `setMpin()` (change and reset) |
| `phone_verified` | `src/lib/otp/phone.ts` `setVerifiedPhone()`, when a number is added or replaced (it says the number can't reset the MPIN for 72 hours) |

## Files

| File | What |
|---|---|
| `config.ts` | `pushEnabled()`, `expoAccessToken()`, `EXPO_PUSH_URL`, limits |
| `store.ts` | tables `alerts (id, user_id, kind, title, body, created_at, read_at)` and `push_tokens (token, user_id, platform, device_id, created_at, updated_at)`, created on first use; `ALERT_KINDS`; queries; `alertView()` |
| `raise.ts` | `raiseAlert()` |
| `senders.ts` | `AlertSender`, `inAppSender`, `expoPushSender`, `setAlertSenders()` |
| `push.ts` | `registerPushToken()`, `unregisterPushToken()` |
| `messages.ts` | the wording of every alert |
| `index.ts` | the module's public surface |

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/v1/alerts` | `?unread=1`, `?limit=` (default 50, max 200) | `{ alerts: [{ id, kind, title, body, createdAt, readAt }], unread }` |
| POST | `/api/v1/alerts/read` | `{ ids?: string[] }` (none = all) | `{ ok: true, unread }` |
| POST | `/api/v1/push/register` | `{ token, platform }` (`ios`, `android`, `web`; an Expo push token) | `{ ok: true }`; 400 `push_token_invalid` |
| DELETE | `/api/v1/push/register` | `{ token }` | `{ ok: true }` (call on sign-out) |

## Touch points outside this folder (marked `// alerts`)

The call sites in the table above, plus `src/app/api/v1/alerts/**`, `src/app/api/v1/push/register`, the web's recent-alerts list in `src/components/devices-alerts.tsx`, and `tests/alerts.test.ts`.

## Remove it

1. Delete this folder, `src/app/api/v1/alerts/`, `src/app/api/v1/push/`.
2. Remove the `// alerts` lines and the alert calls in `src/lib/devices` and `src/lib/otp/phone.ts`.
3. `DROP TABLE alerts; DROP TABLE push_tokens;`
