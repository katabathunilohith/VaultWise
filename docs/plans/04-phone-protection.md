# 04. Phone-side protection

**Status:** built 22 November 2026 (phone only; this plan has no server half); the native parts still need a check on a real phone · **Owner:** Claude · **Size:** M

## Goal

Close the known phone gaps: app lock off by default, no idle timeout, balances visible in screenshots and the app switcher, the login token in unencrypted storage, biometric shortcuts that bypass the PIN, and no root check ([security overview](../security.md), gaps 8 to 11).

## Scope

- **In:** app lock defaults and idle timeout; app-switcher cover; screenshot blocking on sensitive screens; a "hide balances" toggle; the Firebase session in secure storage; biometric rules; a root and jailbreak warning; a stronger phone-side PIN guard.
- **Out:** blocking rooted phones outright, and Play Integrity / App Attest (plan 08 decides).

## Design

| Protection | How |
|---|---|
| App lock on by default | New installs turn app lock on once an MPIN exists. Settings can still turn it off, after the MPIN. |
| Idle timeout | Lock after 5 minutes without a touch, using a root-level touch listener and a timer (`lib/auth/app-lock.ts`). Background locking stays immediate. |
| App-switcher cover | On iOS, a blurred cover appears whenever the app isn't active. On Android, `expo-screen-capture` (added in plan 02) hides the preview. |
| Screenshot blocking | A `useSensitiveScreen()` hook, via the `lib/screen-capture.ts` adapter, on: withdraw, emergency, wallet, MPIN entry, ID check and Settings → Security. |
| Hide balances | A toggle on Home that masks amounts until tapped. Stored as a preference. |
| Session in secure storage | Give Firebase's `getReactNativePersistence` a SecureStore-backed adapter instead of AsyncStorage. The Keychain has a small size limit, so the adapter splits large values into chunks. |
| Biometric rules | A biometric never replaces the current MPIN when changing it or turning lock off. Onboarding only turns on biometric unlock when the check succeeds. |
| Root / jailbreak warning | A banner on Home and before money moves, via `lib/device-integrity.ts`. Practice only warns. |
| Stronger phone PIN guard | After 5 wrong tries: 1 minute, then 5, 30 and 60 minutes. After 10, sign out (live) or require Delete account (Practice). |

## Changes

| File | Change |
|---|---|
| `mobile/src/lib/auth/app-lock.ts`, `lib/session.ts` | Default on; idle timer |
| `mobile/src/components/PrivacyCover.tsx` | **New.** The iOS app-switcher cover |
| `mobile/src/lib/screen-capture.ts`, `lib/device-integrity.ts` | Use the plan 02 adapters |
| Sensitive screens (listed above) | Call `useSensitiveScreen()` |
| `mobile/src/features/home/*` | Hide-balances toggle; integrity banner |
| `mobile/src/lib/auth/firebase.ts`, `lib/storage.ts` | SecureStore persistence adapter |
| `mobile/src/features/account/pin-guard.ts`, `onboarding/ProtectStep.tsx`, `settings/security/SecurityFlow.tsx` | PIN guard and biometric rules |

## Tests

- Manual on Android and iOS: screenshots are blocked on listed screens; the app switcher shows the cover; the app locks after 5 idle minutes; signing in still works after restarting the phone (session in SecureStore); a biometric can't change the MPIN.
- Pure functions (guard timings, chunking) get unit tests once the phone has a test runner.

## Acceptance criteria

- [ ] New installs have app lock on after choosing an MPIN.
- [ ] Idle for 5 minutes, the app locks.
- [ ] No balance is visible in the app switcher or in a screenshot of a sensitive screen.
- [ ] The Firebase session isn't in AsyncStorage.
- [ ] Rooted and jailbroken phones see a warning.

## Risks and rollback

- Moving the session to SecureStore signs everyone out once. That's acceptable before launch.
- Each protection has its own switch in `features/account/config.ts`, so one can be turned off by update if it misbehaves.

## What was built (phone)

Built 22 November 2026. The feature doc is [features/phone-security.md](../features/phone-security.md); the module's notes, with a removal table per protection, are in [mobile/src/features/protection/README.md](../../mobile/src/features/protection/README.md).

### Files

| File | What it does |
|---|---|
| `mobile/src/features/protection/` (`config.ts`, `pin-policy.ts`, `lockout.ts`, `routes.ts`, `SensitiveRouteGuard.tsx`, `PrivacyCover.tsx`, `balances.ts`, `HiddenAmount.tsx`, `IntegrityBanner.tsx`, `https.ts`, `index.ts`, `README.md`) | **New** module: one switch per protection in `PROTECTION`, and the pieces below |
| `mobile/src/lib/auth/app-lock.ts` | Lock on by default (`applyLockDefault()`), the idle lock (`noteActivity()`, a 15-second check), biometric unlock (`readBiometricUnlock()`, `setBiometricUnlock()`) |
| `mobile/src/lib/auth/device-pin.ts` | PBKDF2 with a per-phone measured iteration count; older SHA-256 values rewritten at the next right PIN |
| `mobile/src/lib/auth/session-state.ts`, `lib/session.ts` | `biometricUnlock` in the session; `lockByDefault` when the person never chose |
| `mobile/src/lib/auth/firebase.ts`, `lib/storage.ts` | The sign-in session in the secure store in 600-character chunks, moved once from AsyncStorage |
| `mobile/src/lib/screen-capture.ts` | `coverAppSwitcher()` for the always-on iOS blur |
| `mobile/src/lib/api/demo/persist.ts`, `demo/state.ts`, `demo/mpin.ts` | Sensitive Practice slices in the secure store; the `person` slice |
| `mobile/src/app/_layout.tsx` | `onTouchStartCapture={noteActivity}`, `<SensitiveRouteGuard />`, `<PrivacyCover />` (`// protection`) |
| `mobile/src/features/account/pin-guard.ts`, `PinLayout.tsx` | The escalating guard, the tries-left text, the Practice "Start Practice over" button |
| `mobile/src/features/account/onboarding/ProtectStep.tsx`, `UnlockScreen.tsx`, `settings/security/SecurityFlow.tsx`, `settings/SettingsHome.tsx` | Biometric rules |
| `mobile/src/features/home/Hero.tsx`, `VaultCarousel.tsx`, `HomeScreen.tsx`, `features/wallet/WalletCard.tsx` | Hide balances; the root warning |
| `mobile/src/features/account/settings/ConnectionScreen.tsx` | https only |
| `mobile/package.json` | `@noble/hashes` (pure JavaScript) |

### Decisions and deviations

| Planned | Built |
|---|---|
| Switches in `features/account/config.ts` | In `features/protection/config.ts` (`PROTECTION`), with no imports, so `lib/` files can read it |
| New installs turn app lock on once an MPIN exists | Also existing installs where the person never chose (`vw.appLock` missing). Whoever is in the app stays in; the lock applies from the next time. |
| Idle timeout with a root touch listener and a timer | As planned: `onTouchStartCapture` on the root view, checked every 15 seconds, so it locks 5:00 to 5:15 after the last touch. App-opened system UI pauses it. The web preview listens to clicks and key presses on the page. |
| `components/PrivacyCover.tsx`, a blurred cover on iOS | In `features/protection/PrivacyCover.tsx`. It turns on `expo-screen-capture`'s native app-switcher blur for every screen (which also covers full-screen modals), and draws its own `BlurView` only in a build without the package. |
| Each sensitive screen calls `useSensitiveScreen()` | One `SensitiveRouteGuard` in the root reads the route and holds the hook while it's in `SENSITIVE_ROUTES`, so no flow calls it. The list adds `checkout` and `recovery/claim` to the planned screens. |
| A "hide balances" toggle on Home | On Home only (total, added lately, vault cards, wallet card), with a 30-second peek |
| Session in SecureStore, which signs everyone out once | Chunked as planned, but the old AsyncStorage session is copied over once, so nobody is signed out |
| Biometric rules | As planned, plus the Face ID row in Settings turns biometric unlock back on with a passing check |
| Root warning on Home and before money moves | On Home only. It warns in Practice and live alike; blocking is for plan 08. |
| PIN guard: 1, 5, 30, 60 minutes after 5 wrong tries; after 10, sign out (live) or Delete account (Practice) | Waits after the 5th, 6th, 7th, then every later wrong try (1, 5, 30, 60 minutes). The 10th: live with sign-in, sign out and forget the install id (a new, untrusted device next time); Practice, **Start Practice over**, which clears Practice data and the phone's PIN; live without sign-in (no sign-in to fall back on), keep waiting 60 minutes per try. |
| Not planned | **Slow PIN hash** (baseline finding N4): PBKDF2-HMAC-SHA256, iterations measured per phone to about 300 ms (1,000 to 100,000). A fixed 100,000 was too slow: Hermes runs the pure-JavaScript hash with no JIT, so a phone gets a few thousand in 300 ms. |
| Not planned | **Practice save privacy** (N5): `sensitive: true` slices (`person`, `mpin`, `devices`) in the secure store |
| Not planned | **https only** on the Data source screen outside development builds |

### How it was checked

- `npm run typecheck` and `npm run lint` in `mobile/` pass (re-run for these docs); `npm run doctor`; `npx expo export` for Android and web.
- The flows were tried in the browser preview on Practice data. The browser has no secure store, screen capture, root check or biometrics, so those parts do nothing there; what the browser can show is lock by default, the idle lock (it listens to clicks and key presses), the escalating guard with its Practice ending, Hide balances and the Practice save split (`vw.practice.*` in localStorage, no typed name in `vw.bulk.practice`).

### Still needs a real phone

The full list is in [phone-security.md](../features/phone-security.md#how-to-test-on-a-real-phone). The main ones: screenshots blocked on each sensitive route; the iOS blur and the blank Android preview; the idle lock not firing in the camera or picker; the session surviving a phone restart and an over-the-air update from an older build; how long an unlock takes with the measured PBKDF2 count; the root warning on a rooted phone or emulator. `expo-screen-capture` is native, so this needs the plan 02 APK first.

### Acceptance criteria, phone side

| Criterion | Phone |
|---|---|
| New installs have app lock on after choosing an MPIN | Done (and existing installs that never chose) |
| Idle for 5 minutes, the app locks | Done (checked every 15 seconds) |
| No balance is visible in the app switcher or in a screenshot of a sensitive screen | iOS: done. Android: blank on the sensitive routes; Home shows in recent apps unless Hide balances is on. Needs a real phone. |
| The Firebase session isn't in AsyncStorage | Done; an older session is moved out on first use |
| Rooted and jailbroken phones see a warning | Done (Home banner); needs a rooted phone or emulator to see |

### Left for the owner and for plan 08

- Build and share the plan 02 APK; everything here then arrives by over-the-air update.
- Plan 08: decide whether live builds block money moves on rooted phones, whether Android should blank the app switcher everywhere (it would block every screenshot), and whether Play Integrity or App Attest replaces the root check.

### Review findings and fixes

The two phone security reviews of 22 November 2026 ([security.md](../security.md#security-review-2026-11-22)) found these in plan 04's work; all are fixed. The feature doc is [phone-security.md](../features/phone-security.md).

| Finding | Severity | Fix |
|---|---|---|
| **The wrong-PIN lockout could leave a live login open.** In Practice (say, as the fallback while the server was out of reach) the 10th wrong PIN only offered Start Practice over, which cleared the PIN and lock but left a restored Firebase login, so the live account could open unlocked. | High | The 10th wrong PIN signs out whenever a Firebase login exists, in Practice too (`pinLockoutKind()` in `features/protection/lockout.ts`); Start Practice over signs out a login restored meanwhile. |
| **Signing out briefly showed the app unlocked.** The phone was wiped (PIN and lock gone) before Firebase signed out. | Medium | Every sign-out runs the before-sign-out steps, then Firebase `signOutNow()`, then `resetDevice()` (`signOutOfVaultwise()` in `features/auth/gate.ts`); `startAuth()`'s own wipe stands aside meanwhile; if Firebase can't sign out, nothing is wiped. |
| **The wrong-PIN wait could be frozen or skipped.** Moving the clock back stretched a wait, and closing the app mid-check skipped the try. | Medium | A wait never ends later than now plus its full length; the wrong try is saved before the PIN is checked (`features/account/pin-guard.ts`). |
| **The session move could sign people out, and a chunked write cut short could corrupt it.** | Medium | The AsyncStorage copy is deleted only after the Keychain copy reads back equal, and wins on re-enable (`lib/auth/firebase.ts`). Chunked values use two slots (`<key>_a.<i>` / `<key>_b.<i>`) with the head (`chunks:<slot>:<n>`) switched last; older `chunks:<n>` still reads; writes per key are serialised and `setSecureChunked()` returns success (`lib/storage.ts`). |
| **iOS reinstalls found the last install's session, PIN and install id** in the Keychain. | High | A fresh install (no `vw.install` marker and empty AsyncStorage) wipes every `vw.*` secure item and the session keys listed in `vw.chunkedKeys`; upgrades wipe nothing (`installReady()` in `lib/storage.ts`). Limit: an iOS upgrade by someone who never signed in or used Practice looks fresh and is wiped once. |
| **Not every PIN pad blocked screenshots.** | Low | `SENSITIVE_ROUTES` adds `unlock`, `onboarding/pin`, `settings/reset-mpin`, `settings/trust-device`, `settings/limits` and `settings/delete-account`; `LumpSumModal` calls `useSensitiveScreen()` itself. |
| **Hide balances flashed the amounts** before the saved choice loaded. | Low | Amounts count as hidden until the choice has loaded (`features/protection/balances.ts`). |
| **An `http://` address saved by an older build was still used.** | Low | `usableBaseUrl()` in `lib/api/connection.ts` falls back to `defaultBaseUrl()` (the default itself isn't checked). |
| **The Practice save's plain part held personal details** (the phone number and payee names in alerts), and a sensitive slice over one Keychain entry failed to save. | Low | Alerts no longer carry them (`generaliseAlert()` for older saves); sensitive slices use the chunked secure writes and are retried after a failed write; the checkout restore copes with a missing `gen`. |
