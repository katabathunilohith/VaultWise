# Phone security

> What protects the Vaultwise phone app: one PIN (the MPIN) that unlocks the app and approves money, a slow hash for its copy on the phone, a wrong-PIN guard that gets stricter, app lock on by default with an idle lock, biometric rules, screenshot blocking, a cover in the app switcher, "Hide balances", a root warning, and secure storage for the sign-in session and personal Practice data.

**Status:** built ([plan 04](../plans/04-phone-protection.md), with the MPIN from [plan 03](../plans/03-mpin.md)). Tested in the browser preview on Practice data; the native parts (screen capture, secure store, biometrics, root check) still need a check on a real phone. · **Switch:** one per protection in `PROTECTION` ([features/protection/config.ts](../../mobile/src/features/protection/config.ts)); the slow PIN hash, the Practice-save split and the iOS fresh-install wipe are always on. Fixes from the two phone security reviews of 22 November 2026 are included ([security.md](../security.md#security-review-2026-11-22)).

This page is the phone side only. The server's MPIN check and lock are in [mpin.md](mpin.md); registered devices, alerts and texted codes are in [devices-alerts-otp.md](devices-alerts-otp.md); sign-in tokens are in [identity.md](identity.md). Screen-by-screen settings flows are in [account-and-settings.md](account-and-settings.md). The module's own notes, with a removal table, are in [mobile/src/features/protection/README.md](../../mobile/src/features/protection/README.md).

## What it does

| Protection | What a person sees | Switch | Checked where |
|---|---|---|---|
| One PIN | The 6-digit MPIN unlocks the app and approves money moves. A 4-digit PIN from before keeps unlocking until it is changed. | always on | Unlock: on the phone. Money: on the server |
| Slow PIN hash | Nothing. The phone's copy of the PIN is a PBKDF2 hash. | always on | On the phone |
| Wrong-PIN guard | 4 free wrong tries, then waits of 1, 5, 30 and 60 minutes. The 10th wrong try in a row signs out whenever a Firebase login is on the phone (in Practice too), or asks for Start Practice over (Practice, nobody signed in). | `escalatingPinGuard` | On the phone |
| App lock on by default | Once an MPIN is on the phone, the app asks for it (or Face ID) when it opens, unless the person turned lock off. | `lockByDefault` | On the phone |
| Idle lock | The app locks after 5 minutes without a touch while it is open. | `idleLock` | On the phone |
| Biometric rules | Face ID or fingerprint unlocks only if the onboarding check passed. It never changes the MPIN or turns lock off. | `biometricRules` | On the phone |
| Payments shortcut | "Use Face ID / fingerprint for payments": the phone hands the stored MPIN to the server after a biometric. Live only ("Live only" in Practice). See [mpin.md](mpin.md#on-the-phone). | `MPIN_ENABLED` | Keychain / Keystore, then the server |
| App-switcher cover | iOS: a blur over the app whenever it isn't active. | `appSwitcherCover` | On the phone |
| Screenshot blocking | Screenshots and recordings come out black on money-out, MPIN and ID screens, and on every screen with a PIN pad (Unlock included). Android also blanks the app-switcher preview there. | `screenshotBlocking` | On the phone |
| Hide balances | An eye next to "Safe in vaults" on Home turns amounts into `₹••••`. A tap shows them for 30 seconds. Until the saved choice has loaded, amounts count as hidden, so they never flash. | `hideBalances` | On the phone |
| Root warning | A banner on Home: "This phone may be rooted" (or jailbroken). It only warns. | `integrityWarning` | On the phone |
| Secure session | Nothing. The Firebase sign-in session sits in the Keychain / Keystore, not AsyncStorage. | `secureSession` | On the phone |
| Fresh install wipe (iOS) | A reinstalled app opens signed out, with no PIN, lock or old install id, though the iOS Keychain outlived the app. | always on | On the phone |
| Practice save privacy | Nothing. The typed name, email, member names, the Practice MPIN and the phone number go to secure storage; the alerts in the plain save never carry the phone number or a payee's name. | always on | On the phone |
| https only | The Data source screen refuses an `http://` address outside development builds, and a saved `http://` address falls back to the build's default. | `httpsOnly` | On the phone |
| Device headers | Nothing. Every request says which install sent it. See [devices-alerts-otp.md](devices-alerts-otp.md#on-the-phone). | `DEVICES_ENABLED` (sign-out only) | On the server |
| Consents | The age answer, the AI assistant switch and "Can an AI read what you send?". Unchanged; see [ai.md](ai.md). | always on | Phone and server |

## How it works

### One PIN, and its copy on the phone

- The MPIN is chosen at onboarding step 2 (6 digits, the policy in `features/mpin/policy.ts`, typed twice) and sent to the server in `POST /onboarding`. The same digits are saved on the phone with `setDevicePin()`.
- Changing it (Settings → Security → Change MPIN) goes to the server first (`POST /mpin`), then updates the phone's copy. An MPIN typed in the MPIN sheet for a money move becomes the phone's copy (if it differs) only when the server's acceptance proves it: live, with `/me` saying `mpin.enforced: true` (`mpinCheckedByServer()` and `rememberMpin()` in `features/mpin/sync.ts`). A rollback-mode server accepts a wrong MPIN and Practice checks its own `246810`, so neither ever changes the unlock PIN. Unlocking keeps working offline.
- The phone's copy is stored under `vw.devicePin` as `pbkdf2:<iterations>:<salt>:<hash>:<digits>`: PBKDF2-HMAC-SHA256 from `@noble/hashes` (pure JavaScript), a 16-byte random salt from `expo-crypto`, a 32-byte result. `checkDevicePin()` compares every character (`sameText()`), so the time taken doesn't say how much matched.
- **Iterations are measured per phone.** When a PIN is saved, `iterationsForThisPhone()` times short runs (starting at 250 iterations, doubled until one takes 50 ms or reaches 16,000), then picks the count that takes about 300 ms, between 1,000 and 100,000, rounded to 100. The count is stored with the hash, so the targets can change later without breaking saved PINs.
- **Why not a fixed 100,000.** Hermes runs `@noble/hashes` as plain JavaScript with no JIT. 100,000 iterations would take several seconds per unlock on a mid-range Android phone. Expect a few thousand on a phone and the 100,000 cap in the web preview. The Keychain / Keystore around the stored value is still the main protection.
- **Older values keep working.** `<salt>:<hash>:<digits>` and `<salt>:<hash>` (one SHA-256 over `<salt>:<pin>`) are still checked, and rewritten as PBKDF2 at the next right PIN.
- `readDevicePinLength()` reads the stored digit count, so pads show 4 or 6 dots and say "PIN" or "MPIN" (`pinWord()`).
- `pinVerifier()` picks which PIN confirms account actions: the phone's copy when there is one, the Practice MPIN `246810` in Practice with no copy, otherwise none.

### Wrong-PIN guard

`usePinGuard()` in [pin-guard.ts](../../mobile/src/features/account/pin-guard.ts) wraps every check against the phone's copy: Unlock, the "confirm it's you" step in Settings → Security, and the Delete account PIN. One counter, `vw.pinAttempts` (`{ fails, until }`), is shared by all of them and survives a restart. The rules are pure functions in [pin-policy.ts](../../mobile/src/features/protection/pin-policy.ts).

| Wrong tries in a row | What happens |
|---|---|
| 1 to 4 | "Wrong MPIN. 4 tries left.", counting down (the MPIN sheet's words; "PIN" for an older 4-digit PIN) |
| 5 | Wait 1 minute, with a countdown |
| 6 | Wait 5 minutes |
| 7 | Wait 30 minutes |
| 8 and 9 | Wait 60 minutes each. The text says how many tries are left before the end. |
| 10 | The end (`pinLockoutKind()` in [lockout.ts](../../mobile/src/features/protection/lockout.ts)). Whenever a Firebase login is on the phone, in live **and in Practice**, the app signs out of Vaultwise and forgets the install id (`signOutAfterWrongPins()`; in Practice the Practice data is reset first), so the next sign-in is a new device. Practice can be the fallback while the server is out of reach, and a Practice "start over" alone would clear the PIN and lock and leave the live login open. Practice with nobody signed in: only **Start Practice over** carries on; it resets Practice data and wipes the phone's PIN, and signs out a login restored meanwhile (`startPracticeOverAfterLockout()`). Live without sign-in (a prototype server): no end, each further wrong try waits 60 minutes. |

- **Each try is counted before the PIN is checked** (and cleared if it was right), so closing the app mid-check can't skip one.
- **A wait never ends later than its full length from now.** The end time is re-checked at launch and every second; if the clock was moved back, the wait is shortened to its full length, so moving the clock can't freeze it. (Moving the clock forward still ends a wait early.)
- The count is not reset by a wait ending, only by a right PIN, a PIN change (`resetPinAttempts()`) or a device wipe.
- With `escalatingPinGuard` off, the old rule applies: 5 tries, then 30 seconds, and the count restarts.
- The MPIN sheet does not use this guard. Money moves are counted and locked by the server (or the Practice simulator), on their own steps ([mpin.md](mpin.md)).

### App lock

- `vw.appLock` is `"1"` or `"0"` once the person chose. Missing means they never chose: then `lockByDefault` decides (`readLockSetting()` returns null).
- `initSession()` turns lock on when (the saved choice, or the default) is on **and** a PIN is on the phone. This also applies to existing installs that never touched the setting.
- When a PIN is saved, `setDevicePin()` calls `applyLockDefault()`: if nobody chose, the session's `lockEnabled` turns on, but the person stays in. The lock applies from the next background trip or idle timeout.
- **Background lock.** Unchanged: on `AppState` `"background"`, except while system UI the app opened is up on Android (`withSystemUi()`, at most 90 seconds) or within 5 seconds of `openAppSettings()`. iOS `"inactive"` (Control Center, a call, the app switcher) still doesn't lock; the privacy cover covers that case.
- **Idle lock.** The root layout's `GestureHandlerRootView` calls `noteActivity()` on every touch (`onTouchStartCapture`). On the web preview, `watchAppLock()` listens for `pointerdown` and `keydown` on the page instead. Every 15 seconds `checkIdle()` locks when: lock is on, the app is unlocked and active, no app-opened system UI is up (the camera, the photo picker, Face ID, DigiLocker, the UPI app), and 5 minutes have passed since the last touch. So it locks between 5:00 and 5:15. Coming back to the app, unlocking and leaving system UI all count as a touch.
- **Turning it on** with the Settings switch: at once when a PIN is on the phone (it only makes things stricter). Without one, type the MPIN twice to keep a copy (`KeepUnlockCopy` in `SecurityFlow.tsx`). **Turning it off** opens `settings/security?intent=off`, which needs the PIN; a biometric is not offered.

### Biometric rules

- `authenticateBiometric()` (unchanged) asks the OS and returns true or false, with `disableDeviceFallback: true`, inside `withSystemUi()`.
- **Onboarding** (`ProtectStep.tsx`): "Turn on app lock" asks for Face ID or fingerprint. If the check fails, lock is not turned on yet; the step offers "Try Face ID again" or "Use my MPIN only". The second saves `vw.bioUnlock = "0"` and Unlock then offers no biometric (`session.biometricUnlock`).
- **Settings**: the Face ID row shows "Off" when `biometricUnlock` is false; tapping it opens `settings/security?intent=lock`, where a passing biometric turns it back on (`setBiometricUnlock(true)`). Turning app lock off removes `vw.bioUnlock`, so the next turn-on starts fresh.
- **A biometric never replaces the MPIN** for changing it or turning lock off (`SecurityFlow.tsx`: `bioAllowed` is true only for `intent === "lock"`). Change MPIN needs the current MPIN, which the server checks.
- **Payments** use a different, key-bound biometric: the MPIN in its own Keychain / Keystore entry with `requireAuthentication: true`. That is plan 03's shortcut, described in [mpin.md](mpin.md#on-the-phone).

### App-switcher cover (iOS)

`PrivacyCover` ([PrivacyCover.tsx](../../mobile/src/features/protection/PrivacyCover.tsx)) is mounted once, above the navigator. On iOS it calls `coverAppSwitcher(true, 0.9)` in [lib/screen-capture.ts](../../mobile/src/lib/screen-capture.ts), which keeps `expo-screen-capture`'s native blur (`enableAppSwitcherProtectionAsync`) on for every screen, full-screen modals included. In a build without the native package, it draws its own `BlurView` with a lock and "Vaultwise" whenever `AppState` isn't `"active"`. Android has no always-on cover; see the next section.

### Screenshot blocking

`SensitiveRouteGuard` ([SensitiveRouteGuard.tsx](../../mobile/src/features/protection/SensitiveRouteGuard.tsx)) is mounted once in the root layout. It reads `useSegments()`, drops route groups (`routePath()`), and holds the plan 02 adapter (`useSensitiveScreen()`) while the path matches `SENSITIVE_ROUTES` exactly or as a prefix (`isSensitiveRoute()` in [routes.ts](../../mobile/src/features/protection/routes.ts)):

| Route | Screen |
|---|---|
| `withdraw` | Vault withdrawal |
| `emergency-request` | Emergency money |
| `wallet/[action]` | Wallet spend, cash out, move, daily limit |
| `checkout` | Pay with Vaultwise |
| `mpin` | The MPIN sheet |
| `verify-id` | Verify your ID |
| `recovery/claim` | Recovery request with an ID photo |
| `settings/security` | Change MPIN, app lock, payments shortcut |
| `unlock` | The app-lock screen |
| `onboarding/pin` | Choosing the MPIN at sign-up |
| `settings/reset-mpin` | Forgot your MPIN |
| `settings/trust-device` | Trust this phone (code and MPIN) |
| `settings/limits` | Your limits, with the MPIN step on a raise |
| `settings/delete-account` | Delete or close the account (PIN or MPIN) |

- **Android:** `preventScreenCaptureAsync()` sets `FLAG_SECURE`. Screenshots and recordings come out black, and the app's preview in recent apps is blank, but only while one of these routes is on screen.
- **iOS:** screenshots and recordings are blocked on the same routes.
- `lib/screen-capture.ts` holds a set of keys; capture comes back only when every key is released. It loads `expo-screen-capture` lazily and does nothing on the web or in a build without it.
- A PIN pad inside a tab has no route of its own, so it holds the adapter itself: Invest's Core buy (`invest/core/LumpSumModal.tsx` calls `useSensitiveScreen(visible)` while it's open). Every other screen is covered by adding its route to `SENSITIVE_ROUTES`.

### Hide balances

- [balances.ts](../../mobile/src/features/protection/balances.ts) keeps the choice in `vw.hideBalances` (secure store). `HideBalancesButton` is the eye in `home/Hero.tsx`. The saved choice is read as the app starts, and until it has loaded the amounts count as hidden, so they never flash before the dots.
- While on, `MaskedAmount` and `MaskedMoneyText` ([HiddenAmount.tsx](../../mobile/src/features/protection/HiddenAmount.tsx)) show `₹••••` (the currency symbol plus four dots) for Home's total, "added lately", the vault cards and the wallet card. Screen readers hear "Amount hidden".
- A tap on the hidden total calls `peekBalances()`: everything shows for 30 seconds (`PEEK_MS`), or until the app leaves the foreground.
- Other screens (vault detail, wallet, activity) and Home's coming-up, insight and recent-activity amounts always show.
- Delete account and sign-out clear the choice (`onDeviceReset`).

### Root and jailbreak warning

- `IntegrityBanner` ([IntegrityBanner.tsx](../../mobile/src/features/protection/IntegrityBanner.tsx)) sits on Home. It calls `checkDeviceIntegrity()` ([lib/device-integrity.ts](../../mobile/src/lib/device-integrity.ts)), which runs `expo-device`'s `isRootedExperimentalAsync()` once per launch: an `su` binary on Android, known jailbreak files on iOS.
- When it says rooted, a warning banner shows. The body differs: Practice says pretend money is fine; live says to take care moving money. "Got it" hides it until the next launch.
- It only warns. Nothing is blocked, in Practice or live. Plan 08 decides whether live builds should block money moves on such phones.
- On the web, or when the check fails, the answer is `null` and nothing shows.

### Sign-in session in secure storage

- With sign-in on, `createAuth()` in [lib/auth/firebase.ts](../../mobile/src/lib/auth/firebase.ts) gives Firebase's `getReactNativePersistence` a small adapter, `secureSessionStorage()`, instead of AsyncStorage.
- The adapter writes through `setSecureChunked()` in [lib/storage.ts](../../mobile/src/lib/storage.ts): the value is split into 600-character chunks (under the roughly 2 KB a Keychain entry takes on some iOS versions). **Two slots:** a write puts the new chunks in the slot the head doesn't name (`<key>_a.<i>` or `<key>_b.<i>`), switches the head under `<key>` (`chunks:<slot>:<n>`) last, then removes the old slot's chunks. So a write cut short (the app killed midway) or a failed one still reads as the old value, never a mix of the two. Heads written by older builds (`chunks:<n>`, chunks at `<key>.<i>`) still read; the next write moves them. Calls on one key run one at a time, and `setSecureChunked()` returns whether the write worked.
- Firebase's key names contain characters the secure store refuses, so `secureKeyFor("vwauth.", key)` turns each one into `_xx` hex.
- **No forced sign-out.** A session an older build kept in AsyncStorage (`firebase:*` keys) is copied into the secure store. The AsyncStorage copy wins over one already in the Keychain (it's the newer one, also after the switch is turned off and on again). Each key is deleted from AsyncStorage only once the Keychain gives the same value back, so a failed write signs nobody out.
- The web preview keeps `browserLocalPersistence`.
- The session's keys are listed under `vw.chunkedKeys`, apart from the `vw.itemKeys` index, so `wipeDeviceData()` doesn't remove them. Firebase removes them itself on sign-out; a fresh install's wipe (below) removes them too.

### Fresh install wipe (iOS)

The Keychain outlives the app on iOS, so a reinstall would find the last install's session (its refresh token), PIN, lock and install id. Android removes the secure store with the app, so this never wipes there.

- A marker in AsyncStorage, `vw.install`, goes with the app. Every storage call waits for `installReady()` ([lib/storage.ts](../../mobile/src/lib/storage.ts)) first.
- Marker missing **and** AsyncStorage empty: a fresh install. The first storage call wipes every `vw.*` secure item and every session key listed in `vw.chunkedKeys`, before anything reads them.
- Marker missing with something in AsyncStorage (the Practice save, an older build's `firebase:*` session): an upgrade from a build before the marker. Nothing is wiped.
- The marker is set to `"wiping"` and read back before the wipe, so a wipe cut short runs again, and a marker that can't be kept never wipes.
- Limit: an iOS upgrade by someone who never signed in or used Practice leaves nothing in AsyncStorage, so it looks fresh and is wiped once (PIN, lock, settings, install id).

### Practice save privacy

The Practice save ([practice-mode.md](practice-mode.md#where-the-data-lives-and-reset)) is plain AsyncStorage. A slice registered with `sensitive: true` is kept on its own in the secure store as `vw.practice.<key>` instead, through the chunked helpers, so a slice bigger than one entry (about 2 KB) still saves. A sensitive write counts as saved only once it has worked; a failed one is written again at the next save. Three slices are sensitive: `person` (the typed name, email and names typed on vault members), `mpin` (a changed Practice MPIN and its lock) and `devices` (the masked phone number, a one-way key of the whole number, and the device list). The bulk `state` slice saves the sample name and email, and blank names for typed members, in their place. The alerts inbox stays in the bulk save, so its words never carry the phone number or a typed payee ("your verified number", "the payee"); `generaliseAlert()` in `demo/alerts.ts` rewords alerts from older saves as they load.

### https only

`allowedServerAddress()` in [https.ts](../../mobile/src/features/protection/https.ts) is called by the Data source screen (`ConnectionScreen.tsx`) for both **Test** and **Save**. Outside `__DEV__` it refuses anything that doesn't start with `https://`, with "Use an https:// address…". Development builds still take `http://` for a server on the same Wi-Fi. The placeholder text follows the same rule. The screen is hidden in Practice-only builds. The same check runs whenever the connection is applied (`initConnection()`, `applyConnection()` through `usableBaseUrl()` in `lib/api/connection.ts`), so an `http://` address saved by an older build is replaced by the build's default address (`EXPO_PUBLIC_API_URL`, which comes with the build and isn't checked again).

### What each action asks for

| Action | Phone asks for | Checked by |
|---|---|---|
| Open the app (lock on) | Face ID or fingerprint (if allowed), or the PIN | Phone, with the wrong-PIN guard |
| Turn app lock on | Nothing with a PIN on the phone; without one, the MPIN twice | Phone |
| Turn Face ID unlock back on (after "Use my MPIN only") | PIN or a passing biometric | Phone, with the guard |
| Turn app lock off | PIN only | Phone, with the guard |
| Turn on the payments shortcut | PIN, then the OS biometric prompt | Phone, with the guard |
| Change MPIN | Current MPIN, then a new one twice | Server (`POST /mpin`), or Practice |
| Forgot your MPIN | A texted code, then a new MPIN twice; a trusted phone; a number on the account for 72 hours | Server (`POST /mpin/reset`) |
| Add or change the phone number | A texted code to the new number, then the MPIN | Server (`POST /me/phone`, MPIN always checked), or Practice |
| Withdraw, emergency (every tier), wallet spend, cash out, move | MPIN in the MPIN sheet | Server, or Practice |
| Raise a limit, raise or turn off the wallet's daily limit, Core buy | MPIN | Server, or Practice |
| Pay with Vaultwise | MPIN on the checkout's pad, or a biometric | The phone's simulator (there are no `/pay` routes yet) |
| Trust this phone; sign out another device | Code and MPIN; MPIN | Server, or Practice |
| Close a signed-in account | MPIN in the MPIN sheet | Server (`POST /reset`) |
| Delete account (Practice, or a server without sign-in) | PIN or biometric; press and hold with no PIN | Phone |

## Where the code is

| File | What it holds | Key exports |
|---|---|---|
| [features/protection/config.ts](../../mobile/src/features/protection/config.ts) | The switches and numbers | `PROTECTION`, `IDLE_LOCK_MS`, `PEEK_MS`, `APP_SWITCHER_BLUR`, `SENSITIVE_ROUTES` |
| [features/protection/pin-policy.ts](../../mobile/src/features/protection/pin-policy.ts) | Wrong-PIN steps, pure | `pinWaitAfter()`, `pinTriesLeft()`, `pinTriesExhausted()`, `PIN_TRIES_BEFORE_WAIT`, `PIN_TRIES_FINAL`, `PIN_WAIT_STEPS_MS` |
| [features/protection/lockout.ts](../../mobile/src/features/protection/lockout.ts) | What the 10th wrong try does | `pinLockoutKind()`, `signOutAfterWrongPins()`, `startPracticeOverAfterLockout()` |
| [features/protection/routes.ts](../../mobile/src/features/protection/routes.ts), [SensitiveRouteGuard.tsx](../../mobile/src/features/protection/SensitiveRouteGuard.tsx) | Screenshot blocking by route | `routePath()`, `isSensitiveRoute()`, `SensitiveRouteGuard` |
| [features/protection/PrivacyCover.tsx](../../mobile/src/features/protection/PrivacyCover.tsx) | iOS app-switcher cover | `PrivacyCover` |
| [features/protection/balances.ts](../../mobile/src/features/protection/balances.ts), [HiddenAmount.tsx](../../mobile/src/features/protection/HiddenAmount.tsx) | Hide balances | `useBalancesMasked()`, `useHideBalances()`, `setHideBalances()`, `peekBalances()`, `MaskedAmount`, `MaskedMoneyText`, `HideBalancesButton`, `maskedMoney()`, `MASK` |
| [features/protection/IntegrityBanner.tsx](../../mobile/src/features/protection/IntegrityBanner.tsx) | Root warning | `IntegrityBanner` |
| [features/protection/https.ts](../../mobile/src/features/protection/https.ts) | https only | `allowedServerAddress()` |
| [features/protection/index.ts](../../mobile/src/features/protection/index.ts) | The barrel (`lib/` files import `config.ts` directly) | re-exports |
| [lib/auth/device-pin.ts](../../mobile/src/lib/auth/device-pin.ts) | The phone's PIN copy | `setDevicePin()`, `checkDevicePin()`, `readHasDevicePin()`, `readDevicePinLength()` |
| [lib/auth/app-lock.ts](../../mobile/src/lib/auth/app-lock.ts) | When the app locks; biometric unlock | `watchAppLock()`, `noteActivity()`, `applyLockDefault()`, `readLockSetting()`, `setLockEnabled()`, `lockNow()`, `markUnlocked()`, `withSystemUi()`, `openAppSettings()`, `readBiometricUnlock()`, `setBiometricUnlock()` |
| [lib/auth/session-state.ts](../../mobile/src/lib/auth/session-state.ts) | The session screens read | `useSession()`, `getSession()`, `setSession()`, `SessionState` (now with `biometricUnlock`) |
| [lib/session.ts](../../mobile/src/lib/session.ts) | Start-up read and device reset | `initSession()`, `resetDevice({ forgetDevice })` |
| [lib/storage.ts](../../mobile/src/lib/storage.ts) | Secure store, bulk store, chunked secrets, the iOS fresh-install wipe | `getItem()`, `getItemStrict()`, `setItem()`, `wipeDeviceData()`, `onDeviceReset()`, `getSecureChunked()`, `setSecureChunked()`, `removeSecureChunked()`, `secureKeyFor()`, `splitChunks()`, `KEYS`; internal `installReady()`, `checkInstall()` |
| [lib/auth/firebase.ts](../../mobile/src/lib/auth/firebase.ts) | The session adapter and the AsyncStorage move | `secureSessionStorage()` (internal) |
| [lib/api/connection.ts](../../mobile/src/lib/api/connection.ts) | https only on a saved address | `usableBaseUrl()` |
| [lib/api/demo/alerts.ts](../../mobile/src/lib/api/demo/alerts.ts) | Practice alerts without personal details | `generaliseAlert()` |
| [lib/screen-capture.ts](../../mobile/src/lib/screen-capture.ts) | Plan 02 adapter | `useSensitiveScreen()`, `preventScreenCapture()`, `allowScreenCapture()`, `coverAppSwitcher()` |
| [lib/device-integrity.ts](../../mobile/src/lib/device-integrity.ts) | Plan 02 adapter | `checkDeviceIntegrity()` |
| [lib/api/demo/persist.ts](../../mobile/src/lib/api/demo/persist.ts) | Sensitive Practice slices | `registerPracticeSlice()` (`sensitive`), `restorePracticeData()` |
| [features/account/pin-guard.ts](../../mobile/src/features/account/pin-guard.ts) | The guard and which PIN counts | `usePinGuard()`, `pinVerifier()`, `resetPinAttempts()`, `useDevicePinLength()`, `pinWord()`, `useBiometricKind()`, `biometricName()` |
| [features/account/PinLayout.tsx](../../mobile/src/features/account/PinLayout.tsx) | Pad, wait text and the Practice lockout button | `PinLayout`, `PinStatus`, `GuardedPinPad`, `formatWait()` |
| [features/account/onboarding/ProtectStep.tsx](../../mobile/src/features/account/onboarding/ProtectStep.tsx) | Onboarding biometric rule | `ProtectStep` |
| [features/account/settings/security/SecurityFlow.tsx](../../mobile/src/features/account/settings/security/SecurityFlow.tsx) | Change MPIN, lock on and off, payments shortcut | `SecurityFlow`, `SecurityIntent` |
| [features/account/settings/ConnectionScreen.tsx](../../mobile/src/features/account/settings/ConnectionScreen.tsx) | Data source with https only | `ConnectionScreen` |
| [app/_layout.tsx](../../mobile/src/app/_layout.tsx) | Touches, the route guard and the cover (lines marked `// protection`) | `RootLayout` |

## Data

| Key | Store | Holds |
|---|---|---|
| `vw.devicePin` | Secure store | `pbkdf2:<iterations>:<32 hex salt>:<64 hex hash>:<digits>`; older `<salt>:<hash>[:<digits>]` until the next right PIN |
| `vw.pinAttempts` | Secure store | `{ fails, until }`: wrong tries in a row (kept through waits), and when the wait ends (ms) |
| `vw.appLock` | Secure store | `"1"`, `"0"`, or missing (never chose) |
| `vw.bioUnlock` | Secure store | `"0"` when Face ID / fingerprint may not unlock; missing otherwise |
| `vw.hideBalances` | Secure store | `"1"` or `"0"` |
| `vw.practice.person`, `vw.practice.mpin`, `vw.practice.devices` | Secure store, in chunks | Sensitive Practice slices, each `{ format, data }` |
| `vwauth.<encoded key>`, `_a.<i>` / `_b.<i>` | Secure store, listed under `vw.chunkedKeys`, not indexed | The Firebase session in chunks (sign-in on, phones only); the head says which slot holds them |
| `vw.chunkedKeys` | Secure store | The list of chunked keys outside the `vw.*` index (the session's), for the fresh-install wipe |
| `vw.install` | AsyncStorage (goes with the app) | The fresh-install marker: `"1"`, or `"wiping"` while a wipe runs |
| `vw.mpin.biometric` | Secure store | `"1"` while the payments shortcut is on ([mpin.md](mpin.md#on-the-phone)) |
| `mpin` in keychain service `vw.mpin.biometric` | Keychain / Keystore, `requireAuthentication` | The MPIN for the payments shortcut |
| `vw.deviceId` | Secure store | The install id ([devices-alerts-otp.md](devices-alerts-otp.md#on-the-phone)) |

In memory only: `lockEnabled`, `unlocked`, `biometricUnlock`, `hasDevicePin` and the consents in `session-state.ts`; the last touch time, the system-UI count and the measured iteration count in their modules. Delete account and sign-out wipe every indexed `vw.*` key except `vw.theme`, `vw.haptics`, `vw.connection` and `vw.deviceId`. The install id goes too when the device is forgotten: closing a signed-in account, a remote sign-out and the wrong-PIN lockout ([data-layer.md](../mobile/data-layer.md#sign-out-and-device-reset)).

## Rules and limits

| Rule | Value | Where |
|---|---|---|
| PIN length | 6 digits (MPIN); an older 4-digit PIN works until changed | `MPIN_LENGTH`, `readDevicePinLength()` |
| PIN hash | PBKDF2-HMAC-SHA256, 16-byte salt, 32-byte key | `device-pin.ts` |
| Iterations | measured to about 300 ms, at least 1,000, at most 100,000 | `TARGET_MS`, `MIN_ITERATIONS`, `MAX_ITERATIONS` |
| Free wrong tries | 4 | `PIN_TRIES_BEFORE_WAIT` (5: the try that starts the first wait) |
| Waits | 1, 5, 30, then 60 minutes | `PIN_WAIT_STEPS_MS` |
| The end | 10th wrong try in a row | `PIN_TRIES_FINAL` |
| Idle lock | 5 minutes without a touch, checked every 15 s | `IDLE_LOCK_MS`, `IDLE_CHECK_MS` |
| Settings trip without locking | 5 s after `openAppSettings()` | `SETTINGS_WINDOW_MS` |
| Longest hold for app-opened system UI | 90 s | `HOLD_LIMIT_MS` |
| Peek at hidden balances | 30 s | `PEEK_MS` |
| iOS blur strength | 0.9 | `APP_SWITCHER_BLUR` |
| Session chunk size | 600 characters | `CHUNK_CHARS` in `storage.ts` |
| Practice MPIN | `246810` | `PRACTICE_PIN` in `lib/api/practice.ts` |

## Configuration

- **Switches:** `PROTECTION` in [features/protection/config.ts](../../mobile/src/features/protection/config.ts). Each one can be turned off by an over-the-air update. `config.ts` has no imports, because `lib/` files read it directly.
- **Native config** (in [app.json](../../mobile/app.json), from plan 02): `expo-screen-capture` and `expo-notifications` installed; `READ_MEDIA_IMAGES` blocked (only screenshot *detection* needs it, and it isn't used); `android.allowBackup: false`, so AsyncStorage and app files stay out of Google backups and phone-to-phone transfers.
- **Face ID text:** `faceIDPermission` for `expo-local-authentication` and `expo-secure-store` in `app.json`.
- **Package:** `@noble/hashes` in `mobile/package.json` (pure JavaScript, no native code).

## How to test on a real phone

The web preview has no secure store, screen capture, root check or biometrics. Use a development build, the APK, or a store build.

1. **Screenshots.** Open each route in `SENSITIVE_ROUTES` and take a screenshot and a screen recording: both should be black. Go back to Home: screenshots work again.
2. **App switcher.** iOS: open the app switcher on Home and on a full-screen modal; both are blurred. Android: recent apps show a blank preview on a sensitive route, and Home's real content elsewhere.
3. **Idle lock.** With lock on, leave the app open for 5 minutes without touching it: it locks within 15 seconds after. Then open the camera or photo picker from a withdrawal and wait there: it must not lock.
4. **Lock by default.** On a fresh install, finish onboarding with "Not now", restart: no lock. Reinstall, onboard with "Turn on app lock": it locks after leaving the app.
5. **Biometric rules.** At the protect step cancel Face ID: "Use my MPIN only" appears; choose it, then Unlock offers no Face ID. In Settings → Security, try to turn lock off: only the pad, no biometric key.
6. **Wrong PINs.** On Unlock type five wrong PINs: a 1-minute wait. Live with sign-in: the 10th signs out, and the next sign-in shows as a new device in Your devices. Practice: the 10th shows Start Practice over.
7. **PIN hash timing.** Note how long an unlock takes after typing the 6th digit. Look for about 0.3 s on a mid-range Android phone. Read the iteration count only on a debug build (never log it in release).
8. **Session.** Sign in, kill the app, restart the phone: still signed in. Install an older build, sign in, then update over the air: still signed in (the AsyncStorage copy moved).
9. **Root warning.** A rooted phone or an Android emulator shows the Home banner; "Got it" hides it until the next launch.
10. **https only.** In a preview or tester build, type `http://…` on Data source: refused.
11. **iOS fresh install.** Sign in, delete the app, install it again: it opens signed out, with no PIN or lock, and Your devices lists it as a new device. Updating over an older build (signed in, or with Practice data) wipes nothing.
12. **Wrong-PIN guard edge cases.** Kill the app while it's checking a PIN: the try still counts. Move the phone's clock back during a wait: the wait is no longer than its full length. With a login on the phone in Practice, the 10th wrong PIN signs out.
13. **Screenshots on PIN pads.** Blocked on Unlock, onboarding's PIN step, Forgot your MPIN, Trust this phone, Limits, Delete account and Invest's Core buy.

## Tests

- **Phone** (Jest with jest-expo since 24 November 2026, `cd mobile && npm test`): `features/protection/__tests__/protection.test.ts` covers `routes.ts`, `pin-policy.ts` and `https.ts`; `features/mpin/__tests__/` covers `policy.ts` (also held to the server's copy by `tests/contract/vectors/mpin-policy.json`) and `errors.ts`; `lib/api/demo/__tests__/persist.test.ts` covers restoring a damaged Practice save. Still untested: the chunk helpers in `storage.ts` (`splitChunks()`, `parseChunkHead()`, `chunkKey()`) and `generaliseAlert()`.
- **Checked for this work:** `npm run typecheck` and `npm run lint` in `mobile/` pass, `npx expo export --platform android` bundles, and the flows were walked in the browser preview on Practice data (see [plan 04](../plans/04-phone-protection.md#what-was-built-phone)).

## How to change it safely

- **Cover another screen:** add its route path (without groups) to `SENSITIVE_ROUTES`. A prefix covers the routes under it.
- **Retune the hash:** change `TARGET_MS`, `MIN_ITERATIONS` or `MAX_ITERATIONS`. Saved PINs keep their own count, so nothing breaks; a new count applies the next time a PIN is saved. Never remove the PBKDF2 code path: saved PINs need it.
- **Change the guard:** edit `PIN_WAIT_STEPS_MS`, `PIN_TRIES_BEFORE_WAIT` or `PIN_TRIES_FINAL`. Keep the words in `PinStatus` true.
- **Turn a protection off:** set its `PROTECTION` switch to `false` and publish an update. Turning `secureSession` off signs everyone out once (the session is then looked for in AsyncStorage).
- **Remove a protection:** follow the table in the [module README](../../mobile/src/features/protection/README.md#remove-a-protection). Lines in shared files are marked `// protection`.

## Known limits

- **Android app switcher outside the sensitive routes.** `FLAG_SECURE` is only set on `SENSITIVE_ROUTES`, so Home's balances show in recent apps unless "Hide balances" is on. Setting it app-wide would block every screenshot.
- **The hash alone doesn't save a 6-digit PIN.** At a few thousand PBKDF2 iterations, someone who copies `vw.devicePin` off an unlocked, rooted phone can still try all million PINs quickly on a computer. The Keychain / Keystore around it is the real protection. A native PBKDF2 or Argon2 module would allow far more iterations.
- **The unlock biometric is still a yes/no.** Unlock's Face ID is not tied to a key; only the payments shortcut is.
- **The wrong-PIN wait still trusts the phone's clock going forward** (moving it ahead ends a wait early; moving it back can't stretch one), and its counter is on the phone only.
- **Root check is a hint.** Rooting tools can hide from it, emulators usually report rooted, and it only warns.
- **iOS `"inactive"` still doesn't lock.** The blur covers the screen, but the app stays unlocked under it.
- **The Practice save still holds** the masked email on a recovery claim, and payee names on Practice withdrawals and wallet payments (the alerts no longer repeat them).
- **The session chunk keys aren't in the `vw.*` index.** They are listed under `vw.chunkedKeys` for the fresh-install wipe, but an account wipe leaves them to Firebase's own sign-out.
- **iOS upgrades that look fresh.** An upgrade from a build before the `vw.install` marker, by someone who never signed in or used Practice, leaves nothing in AsyncStorage, so it is wiped once (PIN, lock, settings, install id) as if freshly installed. Not yet checked on an iPhone.
- **No certificate pinning.** https only stops plain-text addresses; it doesn't pin the server's key.

## Maintainability notes

- **One module, many touch points.** `features/protection` owns the rules, but the lock, hash and session changes live in `lib/` files that read `PROTECTION` from `config.ts` directly. Grep for `// protection` before changing those files.
- **Two lockouts.** The phone's guard (`pin-policy.ts`) and the server's MPIN lock (`features/mpin/policy.ts`, mirrored from `src/lib/mpin/attempts.ts`) count separately on different steps. The screen words match on purpose.
- **Module-level state.** `app-lock.ts` keeps counters (`systemUi`, `settingsAt`, `heldSince`, `lastActivity`); `balances.ts` and `pin-guard.ts` keep module stores. They clear through `onDeviceReset`, which makes them hard to test alone.
- **The biometric name is worked out in several places:** `biometricName()`, `BiometricRow` and `PaymentsBiometricRow` in `SettingsHome.tsx`, `ProtectStep.tsx` and the `PinPad` key label.
- `pin-guard.ts` still lives in `features/account` but is used by `features/mpin` and `features/protection`.
