# Devices (phone)

The account knows which phones are signed in, and a new phone has to prove itself before it can move large amounts ([plan 06](../../../../docs/plans/06-devices-alerts-otp.md), contract in [contracts.md](../../../../docs/plans/contracts.md#devices-alerts-and-otp-plan-06)). The server decides; this module shows the devices, signs others out, trusts this phone, and signs out when another device signed this one out.

## What people see

- **Settings → Security → Your devices** (`app/settings/devices.tsx`): every install signed in to the account, this one first ("iPhone · This phone"; a browser is "This device"), with the app version, when it was last seen, when it first signed in, and Trusted / Not trusted yet (an icon and a word, never colour alone). Every other device has **Sign out** (the MPIN sheet is the confirmation: `withMpin`, `POST /devices/{id}/revoke`). This phone has no Sign out (that's Settings → Sign out).
- **Which phones are trusted** (the server decides; the phone reads `/me`'s `device` and each device's `trustableAt`): the sign-up device of a new account (wallet opened in the last hour) is trusted at once (on a server without sign-in, prototype mode, the account's first device is trusted whatever its age); any other new phone, an older account's first one included, is untrusted for 24 hours (`trustableAt = firstSeen + 24 h`) with a `new_device` alert; a phone first seen after any device was signed out of the account never trusts itself (`trustableAt: null`): only a code and the MPIN do. `phoneTrust()` in `features/mpin/errors.ts` names the four states (`trusted`, `cooling`, `needs_code`, `unrecognised`) for every screen.
- **While this phone isn't trusted**: a banner says when large amounts can move ("from 3:40 pm tomorrow", from `trustableAt`), with **Trust this phone**. When it won't trust itself (`trustableAt: null`) the banner says so, with **Trust with a code** instead of a time; the device list says "Needs a code" for such a device and Settings' Your devices row says the phone needs a code.
- **A phone the account couldn't add** (past 5 new devices an hour or 20 signed in: `/me` says `registered: false`, and trusting answers 400 `device_unknown`): a calm note on Your devices, in Settings and in the MPIN sheet (`UNRECOGNISED_TEXT`), and Trust this phone says why instead of sending a code. No Trust button anywhere, since it would be refused.
- **Trust this phone** (`app/settings/trust-device.tsx`, full-screen modal): a 6-digit code to the verified number (purpose `device_trust`, from `features/phone-verify`), then the MPIN (the MPIN prompt itself, so wrong tries and locks read the same as everywhere), then `POST /devices/trust`. With no verified number it asks for one first and carries on when the person comes back. A token that ran out sends them back for a new code.
- **A money move over the cap** (403 `device_untrusted`, from withdraw, wallet spend and cash-out, and emergency): the MPIN sheet says "This phone isn't trusted yet. Large amounts can move from it from …, or trust it now" with **Trust this phone** (with `trustableAt: null`: that waiting won't do it, with **Trust with a code**), which closes the sheet (the move counts as cancelled) and opens the trust flow; for a phone the account couldn't add it explains that, with no button (`deviceProblemFor()`). The mapping is `readDeviceError()` in `features/mpin/errors.ts`, next to the MPIN answers; `errorMessage()` has a plain fallback.
- **Signed out from another device** (401 `device_revoked` on any request): `http.ts` tells `lib/api/device.ts`, and `useDeviceWatch()` (mounted on Home's header) signs out of Vaultwise with a note on the sign-in screen. Only with sign-in on; a revocation seen before Home mounts (behind the unlock screen) is handled when it does. That sign-out also drops the install id (`forgetDevice`), so the phone can sign in again as a new, untrusted device. Firebase signs out first and the phone is cleared after (`signOutOfVaultwise`, features/auth), so no request goes out signed in with a fresh id (a phantom device and an alert to the owner). A server without sign-in has nobody to sign out and refuses the old id for good, so only the id goes (`forgetInstallId()` in `lib/api/device.ts`, at most once a minute) and the next request comes from a new device; without that the phone could never recover (even Delete account is refused).
- **Older sign-ins end too** (identity): after a device is signed out, the server answers 401 `signed_out` ("A device was signed out of your account since you signed in here. Sign in again to continue.") to any request whose sign-in is older, unless it comes from a trusted device. Refreshing the token doesn't help, so `http.ts` reports every `signed_out` (`lib/api/signed-out.ts`, not only /me) and features/auth signs out with the server's words (`startAuth`).

## Headers

Every request carries `x-device-id` (the install id, `installId()` in `lib/api/device.ts`, kept in `vw.deviceId`), `x-device-platform` (`ios`, `android`, `web`) and `x-app-version` (`expo.version`): `request()` in `lib/api/http.ts` and the assistant stream in `client.ts`. The install id stays through a normal sign-out (same, still trusted device). It is new after Delete account, a remote sign-out (`device_revoked`) and the wrong-PIN lockout: those call `resetDevice({ forgetDevice: true })` (`lib/session.ts`); `deviceId` is re-read on `onDeviceReset`. It's new after a reinstall too: Android removes it with the app, and on iOS (where the Keychain outlives the app) the first launch after a fresh install wipes it (`lib/storage.ts`, features/protection). A new id is made only when none is saved: a read that fails is tried once more, and if it still fails the phone sends `unknown` for that run and keeps the saved id (a new id would be a new, untrusted device and an alert).

## Practice

`lib/api/demo/devices.ts`: one trusted device ("This phone", the sign-up device of a fresh Practice account); a device is trusted once trusted with a code and the MPIN or 24 hours after it was first seen (never by itself when first seen after a Practice sign-out: `coolsDown: false`, `trustableAt: null`), for every rule (`practiceTrusted`, the server's `isTrusted`: `/me`, the list, signing out, changing the number, resetting the MPIN, the cap); the untrusted cap (USD 50 scaled with `CURRENCY_SCALE` and rounded to a whole unit like the server's `untrustedMoveCap`, ₹4,000, €48) on withdraw, wallet spend and cash-out, and emergency, checked on the amount asked for before the MPIN, as the server does (`assertPracticeDeviceCap`, lines marked `// devices`); trust with the MPIN, then a `device_trust` token (the server's order); sign out with the MPIN (it records the account's last sign-out); the same codes as the server (`device_untrusted` with `trustableAt`, `device_not_found`, `verification_invalid`). The slice is `sensitive` (secure storage; it holds the masked phone number). **Try it in Practice** on Your devices: "Pretend another phone signed in" (an untrusted iPhone or Android phone and a new-device alert, to sign out) and "Start this phone over as new" (untrusted for 24 hours, to try the cap and the trust flow). Sign the pretend phone out first and "Start this phone over as new" gives a phone first seen after a sign-out: no 24-hour wait, only Trust with a code. Not simulated: the new-device limit (`registered: false`) and the 401 `signed_out` for older sign-ins. These go through `practiceDeviceTools`, exported from `lib/api/client.ts`.

## Files

| File | What it holds |
|---|---|
| `config.ts` | `DEVICES_ENABLED`, the route |
| `DevicesScreen.tsx` | The list, Sign out, the untrusted banner, the Practice tools |
| `TrustDeviceScreen.tsx` | Code, then MPIN, then trusted |
| `useDeviceWatch.ts` | Sign out on `device_revoked` (without sign-in: a new install id) |
| `model.ts` | Names, "last seen" lines and `trustLabel` (Trusted, Not trusted yet, Needs a code), pure |

## Switch

`DEVICES_ENABLED` in `config.ts`. Off: no Your devices row and no sign-out (or new install id) on `device_revoked` (errors then say what happened). The server's rules still apply (`DEVICES_ENFORCED` there).

## Touch points outside this folder

| File | What |
|---|---|
| `src/app/settings/devices.tsx`, `trust-device.tsx`, `src/app/settings/_layout.tsx` (`// devices`) | Routes; the trust flow is a full-screen modal |
| `src/lib/api/device.ts` | **New.** Install id (read with `getItemStrict` from `lib/storage.ts`, so a failed read never makes a new one), `forgetInstallId()`, the three headers, the `device_revoked` signal |
| `src/features/auth/gate.ts` | `signOutOfVaultwise()`: Firebase first, then `resetDevice({ forgetDevice })` |
| `src/lib/api/http.ts` (`// devices`) | Headers on every request; `noteDeviceRevoked()` on 401 `device_revoked` |
| `src/lib/api/identity.ts` (`// devices`) | Uses the shared `installId()` |
| `src/lib/api/security.ts`, `security-types.ts` | **New.** `devices`, `trustDevice`, `revokeDevice` (and alerts, OTP, push, MPIN reset) |
| `src/lib/api/client.ts` (`// devices`) | `...securityLive`, device headers on the assistant stream, `practiceDeviceTools` |
| `src/lib/api/types.ts` (`// devices`) | `phone`, `device` on `/me` |
| `src/lib/api/keys.ts` (`// devices`) | `qk.devices` |
| `src/lib/api/errors.ts` (`// devices`) | Plain fallbacks for `device_untrusted`, `device_revoked`, `device_unknown`, `phone_required`, `verification_invalid`, `otp_unavailable`, `otp_send_failed` |
| `src/lib/api/pay-sim.ts` (`// devices`) | `CURRENCY_SCALE` exported |
| `src/lib/api/demo/devices.ts`, `demo/index.ts`, `vaults.ts`, `wallet.ts`, `emergency.ts` (`// devices`) | The simulator |
| `src/features/mpin/errors.ts`, `useMpinEntry.ts`, `MpinPanel.tsx`, `MpinSheet.tsx`, `config.ts` (`// devices`) | `device_untrusted` in the MPIN prompt, Trust this phone (or Trust with a code) from the sheet; `phoneTrust`, `UNRECOGNISED_TEXT`, `isDeviceUnknown`, `deviceProblemFor` |
| `src/lib/api/signed-out.ts`, `http.ts`, `client.ts` (assistant stream) | 401 `signed_out` from any request, for features/auth |
| `src/features/home/HomeHeader.tsx` (`// devices`) | `useDeviceWatch()` |
| `src/features/account/settings/SettingsHome.tsx` (`// devices`) | Your devices row |
| `src/components/icons.ts` (`// devices`) | `PhoneIcon`, `ShieldWarningIcon`, `DesktopIcon` |

## Removing it

Delete this folder and the two routes, `lib/api/demo/devices.ts` (and its spread and the `// devices` lines in the demo money moves), then the `// devices` lines above. Keep `lib/api/device.ts` if the headers should stay.

## Known limits

- Device names are platforms only ("iPhone", "Android phone"): the phone sends no model name.
- With an embedded MPIN prompt (Core buy, limit raises in a React Native `Modal`), `device_untrusted` says where to trust the phone instead of opening the flow. The server doesn't send it for those actions.
- Needs the live server and two phones to see a real revocation and sign-out; Practice can't revoke the phone it runs on.
