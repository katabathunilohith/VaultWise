# Alerts (phone)

A sign-in from a new device, a device trusted or signed out, a verified phone number, every money move out, a limit raise and an MPIN change or lock make an alert on the server ([plan 06](../../../../docs/plans/06-devices-alerts-otp.md), contract in [contracts.md](../../../../docs/plans/contracts.md#devices-alerts-and-otp-plan-06)). This module shows them and registers the phone for push.

## What people see

- **The bell** on Home's header, next to Ask (R6: one leading, two trailing), with the unread count ("9+" above nine; "Alerts, 3 unread" for screen readers). Its in-content twin is **Settings → Notifications → Alerts**.
- **The inbox** (`app/settings/alerts.tsx`): newest first, an icon per kind, title, body and when ("12 min ago"). Unread ones have a dot (and say "Unread" to screen readers); opening one marks it read; **Mark all as read** does the rest (`POST /alerts/read`, shown at once, then confirmed).
- **Polling**: one React Query (`qk.alerts`) for the bell and the inbox, fetched again when the app or a screen comes back into focus and every 60 s while the app is open (React Query pauses the interval in the background). A server without `/alerts` (404) stops the polling. After a money move, `useInvalidateMoney()` refreshes it too (`alerts` is in `MONEY_QUERIES`).
- **Push**: on live data, once someone is in the app (Home mounted), `usePushRegistration()` calls `registerForPushNotifications()` (`lib/notify.ts`, which asks for permission if it hasn't been refused for good) and sends the token to `POST /push/register` with the platform. Fire and forget: no permission, Expo Go, the web, no FCM credentials or no network just mean no token, and it's tried again next launch. Sign-out and Delete account send `DELETE /push/register` from `onBeforeSignOut` (`features/auth/gate.ts`), while the login still works; the sign-out waits for it, capped at 3 seconds. Practice never asks and never registers.

## Practice

`lib/api/demo/alerts.ts`: an inbox slice (saved with the Practice data; Start over and Delete account put it back to the one read sample alert it starts with), and `practiceAlert()` called by the simulator: withdraw, wallet spend and cash-out, emergency (`money_out`), limit raises and the wallet's daily limit (`limit_loosened`), Change MPIN and MPIN reset (`mpin_changed`), phone verified, device trusted, signed out and new sign-ins (from `demo/devices.ts`). Lines in the money moves are marked `// alerts`. Nothing is pushed.

The inbox is in the Practice bulk save (plain AsyncStorage), so no alert's words carry a personal detail: "your verified number" instead of the masked number, "the payee" instead of a name someone typed. Alerts from an older save are reworded that way as they load (`generaliseAlert`), so the next save drops those details (protection, baseline N5).

## Files

| File | What it holds |
|---|---|
| `config.ts` | `ALERTS_ENABLED`, the poll interval, the route |
| `AlertsBell.tsx` | The bell and badge; starts push registration |
| `AlertsScreen.tsx` | The inbox |
| `hooks.ts` | `useAlerts` (polling), `useMarkAlertsRead` |
| `push.ts` | `usePushRegistration`, unregister on sign-out |
| `model.ts` | Icons per kind, the badge text, pure |

## Switch

`ALERTS_ENABLED` in `config.ts`. Off: no bell, no Alerts row, no push permission prompt. The server still records alerts (`ALERTS_PUSH` there turns push off).

## Touch points outside this folder

| File | What |
|---|---|
| `src/app/settings/alerts.tsx` | The route |
| `src/features/home/HomeHeader.tsx` (`// alerts`) | `<AlertsBell />` |
| `src/features/account/settings/SettingsHome.tsx` (`// alerts`) | The Alerts row |
| `src/lib/api/security.ts`, `security-types.ts` | `alerts`, `markAlertsRead`, `registerPush`, `unregisterPush` |
| `src/lib/api/keys.ts` (`// alerts`) | `qk.alerts`; `alerts` in `MONEY_QUERIES` |
| `src/lib/api/demo/alerts.ts`, `demo/index.ts`, `vaults.ts`, `wallet.ts`, `emergency.ts` (`// alerts`) | The simulator |
| `src/components/icons.ts` (`// alerts`) | `ChecksIcon` |

## Removing it

Delete this folder, the route and `lib/api/demo/alerts.ts`, then the `// alerts` lines above and the alert methods in `security.ts`.

## Known limits

- Tapping a push notification opens the app, not the inbox (no response listener yet; `lib/notify.ts` would get one).
- Push needs a development or store build with FCM credentials (Android) and an EAS project id; the web preview and Expo Go never get a token.
- Alerts aren't grouped by day and there's no paging (the server sends the newest 50).
