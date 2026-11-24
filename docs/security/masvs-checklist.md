# OWASP MASVS checklist

> Where the Vaultwise phone app and its server stand against every OWASP MASVS control. This is the **baseline**: the "before" picture for [plan 08](../plans/08-security-review.md).

## What this measures

- **Standard:** OWASP MASVS v2.1.0, the current release on [mas.owasp.org/MASVS](https://mas.owasp.org/MASVS/). It has 24 controls in 8 groups. The control wording below is copied from that site.
- **Profiles:** MASVS v2 has no levels inside the standard. The MASTG puts each control in a testing profile instead: **L1** (essential, every app), **L2** (defence in depth, for apps that move money), **R** (resilience against tampering) and **P** (privacy). Plan 08 asks for L1 now and L2 once real money is involved. All 24 controls are checked here, so the final report can show progress on L2, R and P too.
- **Code measured:** commit `012a9fc`, plus the uncommitted work that was already in the tree when this review started on 22 November 2026 (plan 01's Practice save, "Start Practice over", query-parameter validation and new tests).
- **Code not measured:** plans 02 to 07 started on 22 November 2026, while this review ran. Their changes are left out, so this page describes the baseline, not the target. That includes `src/instrumentation.ts`, `src/lib/rate-limit.ts`, `src/lib/mpin/`, `src/lib/kyc/checks/`, the production headers in `next.config.ts`, the start-up guard in `src/lib/auth/config.ts`, the `money:` policy on routes, `mobile/src/features/updates/`, `mobile/src/lib/screen-capture.ts`, and the `expo-notifications` and `expo-screen-capture` packages.
- **Evidence:** read in the code for this review, not copied from other docs. Where a file has changed since, the evidence describes it at `012a9fc`. Items marked "confirm in MobSF" are expected from the build settings and need the APK scan to prove. See [baseline-2026-11-22.md](baseline-2026-11-22.md) for how to run it.

### Status meanings

| Status | Meaning |
|---|---|
| **Pass** | Meets the control for this app today. |
| **Partial** | Some parts meet it, some don't. The gaps are listed. |
| **Fail** | Doesn't meet it. |
| **N/A** | The app has nothing the control applies to. |

## Summary

| Status | All 24 controls | L1 (11) | L2 extra (5) | R (4) | P (4) |
|---|---|---|---|---|---|
| Pass | 5 | 3 | 0 | 0 | 2 |
| Partial | 9 | 6 | 1 | 0 | 2 |
| Fail | 9 | 1 | 4 | 4 | 0 |
| N/A | 1 | 1 | 0 | 0 | 0 |

The **Final** column is filled in after plans 03 to 07, using the same method.

**As built, 22 November 2026 (phone).** The Final column below now holds the status read from the code after the phone side of plans 02, 03, 04, 06 and 07, and after the fixes from that day's security reviews ([security.md](../security.md#security-review-2026-11-22)), for each control that work touches. It is not yet the full plan 08 final pass: MobSF on the new APK, `npm audit` and the live-server checks are still to run, so "confirm" marks a status that depends on one of them. A blank Final cell means the control wasn't re-checked. The summary counts above stay the baseline until the full pass. Each control below has an **As built** note with the evidence.

| Control | Profile | Baseline | Final | Fixed in |
|---|---|---|---|---|
| [MASVS-STORAGE-1](#masvs-storage-1) | L1 | Partial | Partial (as built): session and personal Practice data in the secure store, safe chunked writes, iOS fresh-install wipe; two small Practice leftovers open | [04](../plans/04-phone-protection.md); part not planned |
| [MASVS-STORAGE-2](#masvs-storage-2) | L1 | Partial | Pass (as built; confirm `allowBackup` in MobSF) | [02](../plans/02-apk-rebuild-prep.md), [04](../plans/04-phone-protection.md) |
| [MASVS-CRYPTO-1](#masvs-crypto-1) | L1 | Partial | Partial (as built): PBKDF2 with a per-phone count, still low on phones | [03](../plans/03-mpin.md), [04](../plans/04-phone-protection.md) |
| [MASVS-CRYPTO-2](#masvs-crypto-2) | L1 | Pass | Pass (as built) | |
| [MASVS-AUTH-1](#masvs-auth-1) | L1 | Partial | Phone: Pass (as built), with session revocation handled. Server part: re-check on the live server | [05](../plans/05-server-online.md), [06](../plans/06-devices-alerts-otp.md) |
| [MASVS-AUTH-2](#masvs-auth-2) | L2 | Fail | Partial (as built): unlock biometric still a yes/no; the guard's wait can't be stretched by the clock, but a clock moved forward still ends it early | [03](../plans/03-mpin.md), [04](../plans/04-phone-protection.md) |
| [MASVS-AUTH-3](#masvs-auth-3) | L2 | Fail | Pass in code (as built; confirm on the live server, Twilio and push untried) | [03](../plans/03-mpin.md), [06](../plans/06-devices-alerts-otp.md) |
| [MASVS-NETWORK-1](#masvs-network-1) | L1 | Partial | Phone: Pass (as built). Server TLS and HSTS: check on the live server | [04](../plans/04-phone-protection.md), [05](../plans/05-server-online.md) |
| [MASVS-NETWORK-2](#masvs-network-2) | L2 | Fail | Fail (open) | Not planned |
| [MASVS-PLATFORM-1](#masvs-platform-1) | L1 | Pass | Pass (as built) | |
| [MASVS-PLATFORM-2](#masvs-platform-2) | L1 | N/A | N/A (as built) | |
| [MASVS-PLATFORM-3](#masvs-platform-3) | L2 | Fail | Partial (as built; confirm on a phone): every PIN pad now blocks screenshots; Android blanks the switcher only on sensitive routes | [02](../plans/02-apk-rebuild-prep.md), [04](../plans/04-phone-protection.md) |
| [MASVS-CODE-1](#masvs-code-1) | L1 | Pass | | |
| [MASVS-CODE-2](#masvs-code-2) | L2 | Partial | Partial (as built): update prompt built; no forced minimum, unsigned updates | [02](../plans/02-apk-rebuild-prep.md) in part; part not planned |
| [MASVS-CODE-3](#masvs-code-3) | L1 | Fail | Not re-checked: new phone packages, re-run `npm audit` | [08](../plans/08-security-review.md) step 3 |
| [MASVS-CODE-4](#masvs-code-4) | L1 | Partial | Phone: Pass (as built). Server part: re-check (plan 05) | [05](../plans/05-server-online.md) |
| [MASVS-RESILIENCE-1](#masvs-resilience-1) | R | Fail | Partial (as built): a warning, not enforcement | [02](../plans/02-apk-rebuild-prep.md), [04](../plans/04-phone-protection.md), [08](../plans/08-security-review.md) |
| [MASVS-RESILIENCE-2](#masvs-resilience-2) | R | Fail | | [08](../plans/08-security-review.md) step 5 |
| [MASVS-RESILIENCE-3](#masvs-resilience-3) | R | Fail | | Not planned |
| [MASVS-RESILIENCE-4](#masvs-resilience-4) | R | Fail | | Not planned |
| [MASVS-PRIVACY-1](#masvs-privacy-1) | P | Pass | Pass (as built) | |
| [MASVS-PRIVACY-2](#masvs-privacy-2) | P | Pass | Pass (as built; confirm trackers in MobSF) | |
| [MASVS-PRIVACY-3](#masvs-privacy-3) | P | Partial | Partial (as built): placeholders replaced; Play data safety answers not written | [05](../plans/05-server-online.md) |
| [MASVS-PRIVACY-4](#masvs-privacy-4) | P | Partial | Partial (as built): Practice still has no export | [05](../plans/05-server-online.md) |

### L1 gaps that no plan covers yet

Plan 08's acceptance needs every L1 item passed, planned or accepted. These L1 gaps have no plan:

| Gap | Control | Suggested home |
|---|---|---|
| `android.allowBackup` isn't set, so it defaults to on and AsyncStorage goes into Android backups | STORAGE-2 | [02](../plans/02-apk-rebuild-prep.md) (needs the native rebuild) |
| The Practice save keeps the name and email typed at onboarding in unencrypted AsyncStorage | STORAGE-1 | [04](../plans/04-phone-protection.md) |
| The device PIN is checked against one round of SHA-256, so a 4- or 6-digit PIN falls in under a second | CRYPTO-1 | [03](../plans/03-mpin.md) or [04](../plans/04-phone-protection.md) |
| Release builds accept a typed `http://` server address | NETWORK-1 | [05](../plans/05-server-online.md) |

**As built (22 Nov 2026):** all four now have code. `android.allowBackup: false` is in `app.json` (plan 02). The typed name and email moved to the sensitive `person` Practice slice in the secure store (plan 04). The device PIN uses PBKDF2 with a per-phone iteration count, still low on phones (plan 04; CRYPTO-1 stays Partial). The Data source screen refuses `http://` outside development builds (plan 04).

## MASVS-STORAGE

### MASVS-STORAGE-1

> The app securely stores sensitive data.

**Profile:** L1 · **Baseline:** Partial · **Fixed in:** [04](../plans/04-phone-protection.md) for the sign-in session; the Practice save is not planned.

| Finding | Result | Evidence |
|---|---|---|
| PIN hash, app-lock setting, consents and other `vw.*` keys | Pass | Stored with `expo-secure-store` (Keychain on iOS, Keystore-backed on Android) in [storage.ts](../../mobile/src/lib/storage.ts) `rawSet()`. The web preview uses `localStorage`, which is expected. |
| Firebase sign-in session and refresh token | Fail | `getReactNativePersistence(AsyncStorage)` in [firebase.ts](../../mobile/src/lib/auth/firebase.ts) `createAuth()`. AsyncStorage isn't encrypted. Only when sign-in is on, so not in today's Practice APK. |
| Practice save | Fail (minor) | [persist.ts](../../mobile/src/lib/api/demo/persist.ts) writes the whole simulator state to AsyncStorage key `vw.bulk.practice`. That state includes the name and email typed at onboarding ([demo/index.ts](../../mobile/src/lib/api/demo/index.ts) `onboarding()` sets `S.me.user.name` and `email`; [state.ts](../../mobile/src/lib/api/demo/state.ts) saves all of `S`). This breaks the rule written in [storage.ts](../../mobile/src/lib/storage.ts): "never put a PIN, token or personal detail here". Reaches phones with the next build or update that includes plan 01. |
| Secrets in the app package | Pass | Only `EXPO_PUBLIC_*` values are built in: the Firebase web config and the PostHog project key ([.env.example](../../mobile/.env.example), [tester/config.ts](../../mobile/src/features/tester/config.ts)). Both are public by design. MobSF will flag the Firebase API key; that is expected. |

**As built (22 Nov 2026): Partial.**

| Finding | As built | Where |
|---|---|---|
| Firebase session and refresh token | Pass: in the secure store in 600-character chunks (`vwauth.*`). Since the phone review, a write goes to the other of two slots and switches the head last, so a write cut short reads as the old value; the move from AsyncStorage deletes each key only once the Keychain gives the same value back | [firebase.ts](../../mobile/src/lib/auth/firebase.ts) `secureSessionStorage()`, [storage.ts](../../mobile/src/lib/storage.ts) `setSecureChunked()` |
| Practice save | Mostly fixed: the typed name, email and member names (`person`), a changed Practice MPIN (`mpin`) and the phone number (`devices`) are `sensitive` slices in the secure store, saved through the chunked helpers; the alerts in the bulk save no longer carry the phone number or payee names (`generaliseAlert()`). **Open (minor):** the masked email on a Practice recovery request and payee names on Practice withdrawals and wallet payments stay in the AsyncStorage bulk save. | [persist.ts](../../mobile/src/lib/api/demo/persist.ts), [demo/state.ts](../../mobile/src/lib/api/demo/state.ts), [demo/alerts.ts](../../mobile/src/lib/api/demo/alerts.ts) |
| Payments biometric shortcut | Pass: the MPIN in its own Keychain / Keystore entry with `requireAuthentication: true`; live only | [mpin/biometric.ts](../../mobile/src/features/mpin/biometric.ts) |
| New keys | Pass: `vw.hideBalances`, `vw.bioUnlock`, `vw.kyc.openTry` (an id and a link, no number), `vw.deviceId` in the secure store | [phone-security.md](../features/phone-security.md#data) |
| Session chunk keys on a wipe | Pass for reinstalls: listed under `vw.chunkedKeys`, which the fresh-install wipe reads. An account wipe still leaves them to Firebase's own sign-out (minor) | [storage.ts](../../mobile/src/lib/storage.ts) |
| iOS reinstall finds the last install's data | Pass in code (confirm on an iPhone): a fresh install (no `vw.install` marker in AsyncStorage and AsyncStorage empty) wipes every `vw.*` secure item and the listed session keys before anything reads them; upgrades wipe nothing. Limit: an iOS upgrade by someone who never signed in or used Practice is wiped once | [storage.ts](../../mobile/src/lib/storage.ts) `installReady()`, `checkInstall()` |

### MASVS-STORAGE-2

> The app prevents leakage of sensitive data.

**Profile:** L1 · **Baseline:** Partial · **Fixed in:** [04](../plans/04-phone-protection.md) moves the session out of AsyncStorage; switching off Android backup is not planned.

| Finding | Result | Evidence |
|---|---|---|
| Logs on the phone | Pass | Three `console` calls in all of `mobile/src`: two warnings in [firebase.ts](../../mobile/src/lib/auth/firebase.ts) and one dev-only debug line in `lib/haptics/engine.ts`. None print personal data. |
| Logs on the server | Pass | Emails are masked in [recovery/notify.ts](../../src/lib/recovery/notify.ts) and AI provider text is redacted in [groq.ts](../../src/lib/groq.ts). Unexpected errors are logged in full by [api.ts](../../src/lib/api.ts), which is fine for a server log. |
| Android backups | Fail (confirm in MobSF) | [app.json](../../mobile/app.json) doesn't set `android.allowBackup`. Expo's prebuild then writes `android:allowBackup="true"` (default `true` in `@expo/config-plugins` `AllowBackup`). `expo-secure-store` adds backup rules that exclude only its own data. So AsyncStorage (the Practice save from plan 01, and the Firebase session when sign-in is on) goes into Google backups and phone-to-phone transfers. |
| Screenshots and the app switcher | See [PLATFORM-3](#masvs-platform-3) | |

**As built (22 Nov 2026): Pass (confirm in MobSF).**

| Finding | As built | Where |
|---|---|---|
| Android backups | Pass in config: `"allowBackup": false` under `expo.android`. MobSF's manifest section should now show `android:allowBackup="false"`. | [app.json](../../mobile/app.json) (plan 02) |
| Session out of AsyncStorage | Pass | See STORAGE-1 |
| Logs on the phone | Pass: still three `console` calls (two warnings in `firebase.ts`, one dev-only line in `lib/haptics/engine.ts`). The PBKDF2 iteration count and PINs are never logged. | `mobile/src` |
| Screenshots and the app switcher | See [PLATFORM-3](#masvs-platform-3) | |

## MASVS-CRYPTO

### MASVS-CRYPTO-1

> The app employs current strong cryptography and uses it according to industry best practices.

**Profile:** L1 · **Baseline:** Partial · **Fixed in:** [03](../plans/03-mpin.md) moves to a 6-digit MPIN, which helps but doesn't fix the hash. A slow hash or a Keystore-bound check is not planned.

| Finding | Result | Evidence |
|---|---|---|
| Server PIN hash | Pass | `crypto.scryptSync` with a 16-byte random salt, compared with `timingSafeEqual` ([users.ts](../../src/lib/users.ts) `hashPin()`, `checkPin()`). |
| ID numbers | Pass | HMAC-SHA256 with `IDENTITY_SECRET` ([kyc/secret.ts](../../src/lib/kyc/secret.ts) `idHash()`), constant-time compare in `safeEqual()`. |
| Server random IDs | Pass | `crypto.randomBytes(9)` in [db.ts](../../src/lib/db.ts) `newId()`. |
| Sign-in tokens | Pass | `jose` with RS256 only, issuer and audience checked ([auth/verify.ts](../../src/lib/auth/verify.ts)). |
| Device PIN salt | Pass | 16 bytes from `expo-crypto` `getRandomBytes()` ([device-pin.ts](../../mobile/src/lib/auth/device-pin.ts)). |
| Device PIN hash | Fail | One SHA-256 over `<salt>:<pin>` ([device-pin.ts](../../mobile/src/lib/auth/device-pin.ts) `hash()`). A 4-digit PIN has 10,000 options, so anyone who can read `vw.devicePin` gets the PIN at once. The check uses `===`, not a constant-time compare (minor on a phone). |
| Practice IDs | Not security | `Math.random()` in [demo/state.ts](../../mobile/src/lib/api/demo/state.ts) `newId()` names pretend records only. |

**As built (22 Nov 2026): Partial.**

| Finding | As built | Where |
|---|---|---|
| Device PIN hash | Improved, still Partial. PBKDF2-HMAC-SHA256 (`@noble/hashes`), 16-byte salt, 32-byte key, stored as `pbkdf2:<iterations>:<salt>:<hash>:<digits>`. The iteration count is measured on each phone to about 300 ms, between 1,000 and 100,000. Hermes runs the pure-JavaScript hash with no JIT, so a phone gets a few thousand, far below current guidance for PBKDF2-SHA256. With a 6-digit PIN, someone who copies `vw.devicePin` can still try every PIN quickly on a computer; the Keychain / Keystore is the real protection. A native PBKDF2 or Argon2 would fix it. | [device-pin.ts](../../mobile/src/lib/auth/device-pin.ts) `slowHash()`, `iterationsForThisPhone()` |
| Compare | Pass: `sameText()` compares every character, not `===` | device-pin.ts |
| Older hashes | Still accepted, rewritten as PBKDF2 at the next right PIN | device-pin.ts `checkDevicePin()` |
| Server PIN hash (MPIN) | Pass: unchanged scrypt, now with a server lock ([mpin.md](../features/mpin.md)) | `src/lib/users.ts`, `src/lib/mpin/` |

### MASVS-CRYPTO-2

> The app performs key management according to industry best practices.

**Profile:** L1 · **Baseline:** Pass · **Fixed in:** nothing needed.

| Finding | Result | Evidence |
|---|---|---|
| Keys on the phone | Pass | The app makes no keys of its own. Secrets go to the platform store through `expo-secure-store`, which manages the key in the Keychain or Keystore ([storage.ts](../../mobile/src/lib/storage.ts)). |
| Server secret | Pass | `IDENTITY_SECRET` comes from the environment. With sign-in on, or in production, a missing secret stops ID checks with a setup error ([kyc/secret.ts](../../src/lib/kyc/secret.ts) `secret()`). A fixed development key in the source is used only in prototype mode and tests. |
| Token signing keys | Pass | Google's published keys, fetched and cached by `createRemoteJWKSet` ([auth/verify.ts](../../src/lib/auth/verify.ts)). |

**As built (22 Nov 2026): Pass.** Still no app-made keys. The payments shortcut adds one platform-managed entry bound to the phone's biometrics (`requireAuthentication: true`, own keychain service `vw.mpin.biometric`); enrolling a new fingerprint or face invalidates it ([mpin/biometric.ts](../../mobile/src/features/mpin/biometric.ts)).

## MASVS-AUTH

### MASVS-AUTH-1

> The app uses secure authentication and authorization protocols and follows the relevant best practices.

**Profile:** L1 · **Baseline:** Partial · **Fixed in:** [05](../plans/05-server-online.md) (refuse to start in production without sign-in, rate limits), [06](../plans/06-devices-alerts-otp.md) (registered devices).

| Finding | Result | Evidence |
|---|---|---|
| Sign-in mode (Firebase) | Pass | Every request needs a verified Firebase ID token ([auth/session.ts](../../src/lib/auth/session.ts) `signedIn()`). The phone only sends a token to the server its login belongs to ([http.ts](../../mobile/src/lib/api/http.ts) `authHeaders()`). |
| Prototype mode (the default) | Fail | Without `FIREBASE_PROJECT_ID` there is no sign-in: the first user is everyone's account, admin routes are open (`requireAdmin()` returns at once), and `POST /api/v1/reset` wipes the database ([reset/route.ts](../../src/app/api/v1/reset/route.ts)). At `012a9fc` nothing stops a production server from starting this way ([auth/config.ts](../../src/lib/auth/config.ts) only picks the mode). |
| Authorization | Pass | Records are looked up with the owner's id, for example `getVaultRow()` and `cancelWithdrawal()` in [vaults.ts](../../src/lib/vaults.ts). Proof photos need the owner or an admin in sign-in mode ([proofs/[id]/file/route.ts](../../src/app/api/v1/proofs/[id]/file/route.ts)). Admins need a verified email listed in `ADMIN_EMAILS`. |
| Password autofill | Pass | Password fields set `secureTextEntry`, `autoComplete` and `textContentType` ([auth/fields.tsx](../../mobile/src/features/auth/fields.tsx)). |
| Rate limits on server routes | Fail | Only the unauthenticated recovery routes have a limiter (`recovery_attempts` in `src/lib/recovery/claims.ts`). Client IP headers are trusted without a proxy ([auth/context.ts](../../src/lib/auth/context.ts) `clientIp()` takes `cf-connecting-ip` and `x-real-ip` from anyone). |

**As built (22 Nov 2026): phone Pass; the server part is for the live-server check.**

| Finding | As built | Where |
|---|---|---|
| Device binding (phone) | Pass: every request carries `x-device-id`, `x-device-platform` and `x-app-version`; the server registers devices and caps new ones ([devices-alerts-otp.md](../features/devices-alerts-otp.md)) | [lib/api/device.ts](../../mobile/src/lib/api/device.ts), [http.ts](../../mobile/src/lib/api/http.ts) |
| Remote sign-out (phone) | Pass: a 401 `device_revoked` signs the phone out and drops its install id (with sign-in off, only the id goes, at most once a minute) | [devices/useDeviceWatch.ts](../../mobile/src/features/devices/useDeviceWatch.ts), [lib/session.ts](../../mobile/src/lib/session.ts) `resetDevice({ forgetDevice })`, [lib/api/device.ts](../../mobile/src/lib/api/device.ts) `forgetInstallId()` |
| Session revocation | Pass in code (server review): a device sign-out ends sign-ins that started before it (401 `signed_out` unless from a trusted device). The phone signs out once on `signed_out` from any request sent since the current sign-in; a 429 never signs out | `src/lib/devices/service.ts`; [lib/api/signed-out.ts](../../mobile/src/lib/api/signed-out.ts), [features/auth/gate.ts](../../mobile/src/features/auth/gate.ts) `startAuth()` |
| Sign-out clean-up (phone) | Pass: the push token is unregistered while the login still works (`onBeforeSignOut`), then Firebase signs out, then every account key is wiped, so a live account is never on screen unlocked; if Firebase can't sign out, nothing is wiped | [features/auth/gate.ts](../../mobile/src/features/auth/gate.ts) `signOutOfVaultwise()` |
| Prototype mode, rate limits, proxy trust | Server side, see [running-online.md](../features/running-online.md); re-check with the AUTH-1 step below on the live server | |

### MASVS-AUTH-2

> The app performs local authentication securely according to the platform best practices.

**Profile:** L2 · **Baseline:** Fail · **Fixed in:** [04](../plans/04-phone-protection.md) (lock defaults, idle timeout, biometric rules, longer lockouts), [03](../plans/03-mpin.md) (biometric shortcut bound to SecureStore `requireAuthentication`).

| Finding | Result | Evidence |
|---|---|---|
| Biometric is a yes/no answer | Fail | `LocalAuthentication.authenticateAsync` returns a boolean in JavaScript ([biometrics.ts](../../mobile/src/lib/auth/biometrics.ts)). Nothing is unlocked in the Keystore; [storage.ts](../../mobile/src/lib/storage.ts) never passes `requireAuthentication`. |
| A biometric alone can change the PIN or turn lock off | Fail | `tryBiometric()` calls `verified()`, which turns lock off or moves to "choose a new PIN" ([SecurityFlow.tsx](../../mobile/src/features/account/settings/security/SecurityFlow.tsx)). |
| Onboarding ignores the Face ID result | Fail | `await authenticateBiometric(...)` then `setLockEnabled(lock)` whatever it returned ([ProtectStep.tsx](../../mobile/src/features/account/onboarding/ProtectStep.tsx)). |
| App lock is optional and off by default | Fail | `lockEnabled = lockOn && hasDevicePin`, and nothing sets `lockOn` on a new install ([session.ts](../../mobile/src/lib/session.ts)). No idle timeout; iOS `"inactive"` never locks ([app-lock.ts](../../mobile/src/lib/auth/app-lock.ts)). |
| Wrong-PIN guard | Fail | 5 tries, then 30 seconds, forever, timed by the phone's clock (`MAX_TRIES`, `WAIT_MS` in [pin-guard.ts](../../mobile/src/features/account/pin-guard.ts)). All 10,000 PINs fit in about 17 hours. |
| Device passcode fallback | Pass | `disableDeviceFallback: true`, so a phone passcode can't stand in for a biometric. |

**As built (22 Nov 2026): Partial (confirm on a phone).**

| Finding | As built | Where |
|---|---|---|
| Biometric is a yes/no answer | Partial: the payments shortcut is bound to a Keystore / Keychain entry with `requireAuthentication: true`. **Open:** unlocking the app with Face ID is still a boolean in JavaScript. | [mpin/biometric.ts](../../mobile/src/features/mpin/biometric.ts); [biometrics.ts](../../mobile/src/lib/auth/biometrics.ts) |
| A biometric alone can change the PIN or turn lock off | Pass: a biometric is offered only for turning lock on; changing the MPIN needs the current one (checked by the server), turning lock off needs the PIN | [SecurityFlow.tsx](../../mobile/src/features/account/settings/security/SecurityFlow.tsx) (`bioAllowed`) |
| Onboarding ignores the Face ID result | Pass: a failed check doesn't turn on biometric unlock; "Use my MPIN only" saves `vw.bioUnlock = "0"` | [ProtectStep.tsx](../../mobile/src/features/account/onboarding/ProtectStep.tsx), [app-lock.ts](../../mobile/src/lib/auth/app-lock.ts) |
| App lock optional and off by default | Pass: on by default once a PIN exists (unless the person chose off), and locks after 5 minutes without a touch. iOS `"inactive"` still doesn't lock, but the app-switcher blur covers it. | [app-lock.ts](../../mobile/src/lib/auth/app-lock.ts) `applyLockDefault()`, `checkIdle()`; [session.ts](../../mobile/src/lib/session.ts) |
| Wrong-PIN guard | Improved: 4 free tries, then 1, 5, 30, 60 minutes; the 10th in a row signs out whenever a Firebase login is on the phone (Practice too), or needs Start Practice over (Practice, nobody signed in). Each try is saved before the PIN is checked, and a wait never ends later than its full length from now, so moving the clock back or closing the app mid-check can't help. **Open:** moving the clock forward still ends a wait early; the guard lives on the phone only; on a live server without sign-in it keeps waiting 60 minutes per try. | [pin-policy.ts](../../mobile/src/features/protection/pin-policy.ts), [lockout.ts](../../mobile/src/features/protection/lockout.ts), [pin-guard.ts](../../mobile/src/features/account/pin-guard.ts) |
| Device passcode fallback | Pass (unchanged) | |

### MASVS-AUTH-3

> The app secures sensitive operations with additional authentication.

**Profile:** L2 · **Baseline:** Fail · **Fixed in:** [03](../plans/03-mpin.md) (MPIN on every money route, escalating lockout), [06](../plans/06-devices-alerts-otp.md) (registered devices, OTP, alerts).

| Finding | Result | Evidence |
|---|---|---|
| Server PIN on money moves | Fail | Only emergency Tier 2 checks a PIN ([emergency.ts](../../src/lib/emergency.ts) `executeEmergency()`, `needsPin: tier2 > 0`). At `012a9fc` the withdrawal, wallet spend, cash-out, move and limits routes call `customer()` with no PIN. |
| Server PIN attempts | Fail | `checkPin()` has no attempt limit ([users.ts](../../src/lib/users.ts)). A failed Tier 2 PIN writes its audit row inside `tx()` and then throws, so the row is rolled back ([emergency.ts](../../src/lib/emergency.ts), lines 238 to 243 at `012a9fc`). |
| Pay with Vaultwise | Simulated | The phone simulator accepts only the Practice PIN `1234` ([pay-sim.ts](../../mobile/src/lib/api/pay-sim.ts)). There are no `/pay` routes on the server. |
| Device binding, OTP, alerts | Fail | No devices or alerts tables in [db.ts](../../src/lib/db.ts). A copied token works from any phone. |

**As built (22 Nov 2026): Pass in code (confirm on the live server).** The server rules are in [mpin.md](../features/mpin.md) and [devices-alerts-otp.md](../features/devices-alerts-otp.md); the phone side:

| Finding | As built | Where |
|---|---|---|
| MPIN on money moves | Pass: every phone money flow sends the MPIN (`withMpin()` / `MpinPanel`); the server checks it on every money route, with an escalating lock | [features/mpin](../../mobile/src/features/mpin/README.md) |
| MPIN attempts | Pass on the server (5 wrong: 1, 5, 30 minutes, 24 hours); the phone shows the lock from `lockedUntil` | `src/lib/mpin/attempts.ts`, [mpin/errors.ts](../../mobile/src/features/mpin/errors.ts) |
| Device binding, OTP, alerts | Pass in code: a new device is capped for 24 hours unless trusted with a texted code and the MPIN; the phone shows devices (with four trust states, `phoneTrust()`), trusts itself, and has an alerts inbox and push registration. **Not yet run live:** Twilio SMS and Android push. | [features/devices](../../mobile/src/features/devices/README.md), [features/phone-verify](../../mobile/src/features/phone-verify/README.md), [features/alerts](../../mobile/src/features/alerts/README.md) |
| Changing where codes go | Pass in code (security review): adding or changing the phone number needs a code and the MPIN (always checked by the server, `MpinPanel` on the phone); a new number can't reset the MPIN for 72 hours, and Forgot your MPIN says until when | [phone-verify/PhoneVerifyScreen.tsx](../../mobile/src/features/phone-verify/PhoneVerifyScreen.tsx), [mpin/ResetMpinScreen.tsx](../../mobile/src/features/mpin/ResetMpinScreen.tsx) |
| Unlock PIN from a money move | Pass (security review): copied only when the server says `mpin.enforced: true`, never in Practice, so a rollback-mode acceptance can't set an unchecked PIN | [mpin/sync.ts](../../mobile/src/features/mpin/sync.ts) `mpinCheckedByServer()` |
| A money move confirmed twice | Pass (security review): the MPIN sheet settles each ask once and gives the flow the real result; a timed-out move isn't resent blindly (`mayHaveGoneThrough()`) | [mpin/ask.ts](../../mobile/src/features/mpin/ask.ts), [lib/api/errors.ts](../../mobile/src/lib/api/errors.ts) |
| Pay with Vaultwise | Still simulated on the phone; there are no `/pay` routes. The simulator checks the MPIN with the same lock. | [pay-sim.ts](../../mobile/src/lib/api/pay-sim.ts), [demo/mpin.ts](../../mobile/src/lib/api/demo/mpin.ts) |

## MASVS-NETWORK

### MASVS-NETWORK-1

> The app secures all network traffic according to the current best practices.

**Profile:** L1 · **Baseline:** Partial · **Fixed in:** [05](../plans/05-server-online.md) (HTTPS with Caddy, HSTS, a `tester-live` build with an `https://` address). Refusing `http://` in release builds is not planned.

| Finding | Result | Evidence |
|---|---|---|
| Today's APK | Pass | Practice-only builds never call the Vaultwise server ([build.ts](../../mobile/src/lib/build.ts), `EXPO_PUBLIC_PRACTICE_ONLY` in [eas.json](../../mobile/eas.json)). What's left goes over HTTPS: Expo updates (`https://u.expo.dev`), and PostHog in the tester build. |
| Platform defaults | Pass (confirm in MobSF) | Expo's template allows cleartext only in its debug manifests, and target SDK 36 blocks it in release builds. iOS keeps `NSAllowsArbitraryLoads` off and allows the local network. |
| Server address the app accepts | Fail | The Data source screen accepts any `http://` address ([ConnectionScreen.tsx](../../mobile/src/features/account/settings/ConnectionScreen.tsx)), and the default is `http://<dev machine>:3000` ([connection.ts](../../mobile/src/lib/api/connection.ts) `defaultBaseUrl()`). The screen is hidden in Practice builds. |
| Server TLS and HSTS | Fail | The server only runs locally. At `012a9fc`, [next.config.ts](../../next.config.ts) sets development CORS headers and nothing for production. |

**As built (22 Nov 2026): phone Pass; the server part is for the live-server check.**

| Finding | As built | Where |
|---|---|---|
| Server address the app accepts | Pass: outside development builds the Data source screen refuses anything but `https://` (Test and Save), and a saved `http://` address from an older build falls back to the build's default when the connection is applied (`usableBaseUrl()`). The development default (`http://<dev machine>:3000`) only applies in development. | [protection/https.ts](../../mobile/src/features/protection/https.ts) `allowedServerAddress()`, [ConnectionScreen.tsx](../../mobile/src/features/account/settings/ConnectionScreen.tsx), [connection.ts](../../mobile/src/lib/api/connection.ts) |
| The online tester build | Pass in config: `tester-live` takes an `https://` `EXPO_PUBLIC_API_URL`; `update.mjs` refuses to publish while it's missing or the placeholder. `EXPO_PUBLIC_API_URL` itself isn't checked for `https://`. | [eas.json](../../mobile/eas.json), [scripts/update.mjs](../../mobile/scripts/update.mjs) |
| Server TLS and HSTS | Server side, see [running-online.md](../features/running-online.md); check with `curl -I` and SSL Labs once online | |

### MASVS-NETWORK-2

> The app performs identity pinning for all remote endpoints under the developer's control.

**Profile:** L2 · **Baseline:** Fail · **Fixed in:** not planned.

- No certificate or public-key pinning anywhere. No network security config and no pinning library in [package.json](../../mobile/package.json).
- Pinning has a cost: a certificate change can lock every installed app out. Decide in the plan 08 final review whether L2 is the target before real money.

**As built (22 Nov 2026): Fail (open).** https only on the Data source screen (NETWORK-1) stops plain-text addresses but pins nothing. Still not planned.

## MASVS-PLATFORM

### MASVS-PLATFORM-1

> The app uses IPC mechanisms securely.

**Profile:** L1 · **Baseline:** Pass · **Fixed in:** nothing needed.

| Finding | Result | Evidence |
|---|---|---|
| Deep links | Pass | A pay link never opens a route. Only its id is kept, after a strict check, and the checkout opens once the person is in ([+native-intent.ts](../../mobile/src/app/+native-intent.ts) `redirectSystemPath()`, [intent-link.ts](../../mobile/src/features/pay/intent-link.ts) `parseIntentId()`). |
| Other links | Pass | Passed through, but every in-app route sits behind `Stack.Protected` guards, so a locked or new app only shows Unlock or onboarding ([_layout.tsx](../../mobile/src/app/_layout.tsx)). |
| Clipboard | Pass | Not used anywhere in `mobile/src`. |
| Exported Android components | Pass (confirm in MobSF) | Only the launcher activity is exported in Expo's template. |
| Custom scheme | Note | `vaultwise://` isn't a verified App Link, so another app could claim it. It only carries a checkout id, which the person still reviews. |

**As built (22 Nov 2026): Pass.** New outgoing links are checked before use: a DigiLocker URL must be `http(s)` and a bank-check link must be `upi://pay?…`, or the start answer is refused ([lib/api/identity.ts](../../mobile/src/lib/api/identity.ts) `toDigiLockerStart()`, `toBankCheckStart()`). DigiLocker's return address is `vaultwise://verify-id`, which lands behind the in-app guard like any link. The app still doesn't use the clipboard; the UPI link is shown as selectable text for the person to copy.

### MASVS-PLATFORM-2

> The app uses WebViews securely.

**Profile:** L1 · **Baseline:** N/A · **Fixed in:** nothing needed.

- `react-native-webview` isn't installed. The `expo-web-browser` plugin is listed in [app.json](../../mobile/app.json), but no code calls it, and it opens the system browser, not a WebView.

**As built (22 Nov 2026): N/A.** Code now calls `expo-web-browser`: `openBrowserAsync` for the policy pages ([AboutScreen.tsx](../../mobile/src/features/account/settings/AboutScreen.tsx)) and `openAuthSessionAsync` with an ephemeral session for DigiLocker ([kyc/external.ts](../../mobile/src/features/kyc/external.ts)). Both use the system browser (Custom Tabs, `ASWebAuthenticationSession`), not a WebView. `react-native-webview` is still not installed.

### MASVS-PLATFORM-3

> The app uses the user interface securely.

**Profile:** L2 · **Baseline:** Fail · **Fixed in:** [02](../plans/02-apk-rebuild-prep.md) (installs `expo-screen-capture`), [04](../plans/04-phone-protection.md) (blocks screenshots on sensitive screens, app-switcher cover, hide balances).

| Finding | Result | Evidence |
|---|---|---|
| Screenshots and recordings | Fail | At `012a9fc` nothing blocks capture. `expo-screen-capture` isn't in [package.json](../../mobile/package.json) at that commit. |
| App switcher | Fail | Balances show in the app switcher preview. |
| PIN entry | Pass | An in-app keypad, so no system keyboard can learn or cache the digits. |
| Password and ID fields | Pass | `secureTextEntry` on passwords ([auth/fields.tsx](../../mobile/src/features/auth/fields.tsx)); `autoComplete="off"` on the ID number ([IdForm.tsx](../../mobile/src/features/kyc/IdForm.tsx)). |

**As built (22 Nov 2026): Partial (confirm on a phone).**

| Finding | As built | Where |
|---|---|---|
| Screenshots and recordings | Pass on the listed screens: blocked while the route is in `SENSITIVE_ROUTES` (withdraw, emergency, wallet moves, checkout, the MPIN sheet, Verify your ID, recovery claim, Settings → Security) and, since the phone review, every screen with a PIN pad (`unlock`, `onboarding/pin`, `settings/reset-mpin`, `settings/trust-device`, `settings/limits`, `settings/delete-account`); Invest's Core buy holds the adapter itself (`LumpSumModal`) | [SensitiveRouteGuard.tsx](../../mobile/src/features/protection/SensitiveRouteGuard.tsx), [protection/config.ts](../../mobile/src/features/protection/config.ts), [lib/screen-capture.ts](../../mobile/src/lib/screen-capture.ts) |
| App switcher | iOS: Pass, a blur on every screen whenever the app isn't active. **Android: Partial,** `FLAG_SECURE` blanks the preview only on the sensitive routes, so Home's balances show in recent apps unless Hide balances is on. | [PrivacyCover.tsx](../../mobile/src/features/protection/PrivacyCover.tsx) |
| Hide balances | New: Home's amounts can be hidden as `₹••••`, with a 30-second peek; until the saved choice has loaded they count as hidden, so they never flash | [protection/balances.ts](../../mobile/src/features/protection/balances.ts) |
| PIN entry | Pass (unchanged) | |
| Code entry | Pass: the 6-digit code field uses the OS one-time-code autofill, not the clipboard | [phone-verify/OtpCodeScreen.tsx](../../mobile/src/features/phone-verify/OtpCodeScreen.tsx) |

## MASVS-CODE

### MASVS-CODE-1

> The app requires an up-to-date platform version.

**Profile:** L1 · **Baseline:** Pass (confirm in MobSF) · **Fixed in:** nothing needed for L1.

- Expo SDK 58 with React Native 0.88: target SDK 36, compile SDK 37, minimum SDK 24 (`node_modules/react-native/gradle/libs.versions.toml`). [app.json](../../mobile/app.json) doesn't override them. Target SDK 36 meets Google Play's current rule.
- The minimum, Android 7.0, is old. The L2 profile would ask for a higher floor.

### MASVS-CODE-2

> The app has a mechanism for enforcing app updates.

**Profile:** L2 · **Baseline:** Partial · **Fixed in:** [02](../plans/02-apk-rebuild-prep.md) adds an "update ready" prompt. Forcing a minimum version is not planned.

- Over-the-air updates are set up: `updates.url` and `runtimeVersion: { policy: "fingerprint" }` in [app.json](../../mobile/app.json). An update downloads at launch and applies on the next start.
- Nothing forces it. The server can't turn away an old app version.
- Updates aren't code-signed: no `updates.codeSigningCertificate` in [app.json](../../mobile/app.json). Their integrity rests on the Expo account and HTTPS.

**As built (22 Nov 2026): Partial.** "A new version is ready" with **Restart** shows on the main tabs once an update has downloaded, and the app checks again on returning to the foreground, at most every 30 minutes ([features/updates](../../mobile/src/features/updates/README.md)). **Open:** nothing forces a minimum version, and updates still aren't code-signed.

### MASVS-CODE-3

> The app only uses software components without known vulnerabilities.

**Profile:** L1 · **Baseline:** Fail · **Fixed in:** [08](../plans/08-security-review.md) step 3 (update or accept). Plans 02 to 07 don't cover it.

- `npm audit` on 22 November 2026: root 1 critical, 7 high, 7 moderate; `mobile/` 4 high, 11 moderate. Details per package are in [baseline-2026-11-22.md](baseline-2026-11-22.md#npm-audit).
- **Server:** `next` 16.3.8 has critical advisories (fix: 16.4.6), and `zod` 4.6.5 has a high one (fix: 4.6.6 or later). Both ship.
- **Phone:** the 4 highs are all `firebase` → Firestore → `@grpc/grpc-js`. The app imports only `firebase/app` and `firebase/auth` ([firebase.ts](../../mobile/src/lib/auth/firebase.ts) `loadSdk()`), so that code isn't in the bundle. The phone alone would be Partial.
- No routine check: no Dependabot and no audit step in a pipeline.

**As built (22 Nov 2026): not re-checked.** The phone added `expo-notifications ~58.1.9`, `expo-screen-capture ~58.0.6` and `@noble/hashes ^1.8.0`. Run `npm audit --json` in `mobile/` (and the root) for the final pass.

### MASVS-CODE-4

> The app validates and sanitizes all untrusted inputs.

**Profile:** L1 · **Baseline:** Partial · **Fixed in:** [05](../plans/05-server-online.md) (generic errors).

| Finding | Result | Evidence |
|---|---|---|
| Request bodies | Pass | Every JSON body goes through a zod schema via `body()` in [api.ts](../../src/lib/api.ts). Routes without `body()` take no body. |
| SQL | Pass | Every query uses `?` parameters. The three queries that build SQL text only add one `?` per list item (in `fraud.ts`, `vaults.ts` and `wallet/plan.ts`); no value is pasted into SQL. |
| Uploads | Pass | JPEG, PNG and WebP only, 10 MB at most ([proofs.ts](../../src/lib/verification/proofs.ts) `ALLOWED_MIME`, `MAX_BYTES`), and decoded by `sharp` ([forensics.ts](../../src/lib/verification/forensics.ts)). |
| Deep links and scanned codes | Pass | Ids must match `^[A-Za-z0-9_-]{3,64}$` ([intent-link.ts](../../mobile/src/features/pay/intent-link.ts)). |
| Error messages | Fail | Unexpected errors return the raw exception text, such as SQLite messages ([api.ts](../../src/lib/api.ts) `errorResponse()`, line 19 at `012a9fc`). AI errors pass the provider's message through too. |
| Oversized input | Fail | No body size limit on JSON routes, and the installed zod has a memory-exhaustion advisory (see CODE-3). |

**As built (22 Nov 2026): phone Pass; the server rows are for the plan 05 re-check** ([running-online.md](../features/running-online.md)).

| Finding | As built | Where |
|---|---|---|
| Server answers on the phone | Pass: new answers are read defensively; unknown fields become null, step numbers are cut to their last 4, unknown alert kinds get a plain icon | [lib/api/security.ts](../../mobile/src/lib/api/security.ts) `toDevice()`, `toAlert()`; [identity.ts](../../mobile/src/lib/api/identity.ts) `toKycSteps()` |
| Links from the server | Pass: only `http(s)` for DigiLocker and `upi://pay` for the bank check | identity.ts |
| Typed input on the phone | Pass: phone numbers checked against the server's E.164 rule, the PAN's format and the MPIN policy before sending | [phone-verify/phone.ts](../../mobile/src/features/phone-verify/phone.ts), [kyc/steps-model.ts](../../mobile/src/features/kyc/steps-model.ts), [mpin/policy.ts](../../mobile/src/features/mpin/policy.ts) |

## MASVS-RESILIENCE

All four are profile R. Plan 08 aims for L1 now, so these are recorded, not required yet.

### MASVS-RESILIENCE-1

> The app validates the integrity of the platform.

**Profile:** R · **Baseline:** Fail · **Fixed in:** [02](../plans/02-apk-rebuild-prep.md) (installs a root and jailbreak check), [04](../plans/04-phone-protection.md) (warning banner), [08](../plans/08-security-review.md) step 5 (decide on Play Integrity and App Attest).

- No root, jailbreak or emulator detection anywhere in `mobile/src` at `012a9fc`.

**As built (22 Nov 2026): Partial.** `checkDeviceIntegrity()` runs `expo-device`'s `isRootedExperimentalAsync()` once per launch (an `su` binary on Android, known jailbreak files on iOS), and Home shows a warning when it says rooted ([lib/device-integrity.ts](../../mobile/src/lib/device-integrity.ts), [protection/IntegrityBanner.tsx](../../mobile/src/features/protection/IntegrityBanner.tsx)). **Open:** it only warns, in Practice and live; rooting tools can hide from it; no emulator check; no Play Integrity or App Attest (plan 08 step 5).

### MASVS-RESILIENCE-2

> The app implements anti-tampering mechanisms.

**Profile:** R · **Baseline:** Fail · **Fixed in:** [08](../plans/08-security-review.md) step 5 (Play Integrity, App Attest). Code-signing the updates is not planned.

- No self-check of the app's signature or bundle, and the server can't tell a genuine app from a copy.
- Over-the-air updates aren't code-signed (see CODE-2).

### MASVS-RESILIENCE-3

> The app implements anti-static analysis mechanisms.

**Profile:** R · **Baseline:** Fail · **Fixed in:** not planned.

- JavaScript ships as Hermes bytecode, which slows a casual reader but isn't obfuscation.
- R8 shrinking is off: Expo's template reads `android.enableMinifyInReleaseBuilds`, default `false`, and [app.json](../../mobile/app.json) doesn't turn it on.

### MASVS-RESILIENCE-4

> The app implements anti-dynamic analysis techniques.

**Profile:** R · **Baseline:** Fail · **Fixed in:** not planned (plan 08 step 5 decides).

- No debugger, hook or Frida detection. Release builds aren't debuggable, which is the platform default (confirm in MobSF).

## MASVS-PRIVACY

### MASVS-PRIVACY-1

> The app minimizes access to sensitive data and resources.

**Profile:** P · **Baseline:** Pass · **Fixed in:** nothing needed.

- Permissions are camera and biometrics only. `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW` and `READ_EXTERNAL_STORAGE` are blocked, and the microphone is off in both camera plugins ([app.json](../../mobile/app.json)).
- Photos come through the system picker, so the app never reads the whole library.
- ID numbers are kept as the last 4 characters plus an HMAC ([kyc/secret.ts](../../src/lib/kyc/secret.ts)).
- The phone sends `x-ai-consent: no` until the person says yes ([http.ts](../../mobile/src/lib/api/http.ts)).
- Note: the Practice save keeps the typed name and email on the phone (see STORAGE-1).

**As built (22 Nov 2026): Pass.** New Android permissions come from the plugins: `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` and `DETECT_SCREEN_CAPTURE`. `READ_MEDIA_IMAGES` is blocked ([app.json](../../mobile/app.json)). Push permission is asked only on live data, once someone is in the app; Practice never asks ([alerts/push.ts](../../mobile/src/features/alerts/push.ts)). Practice keeps only the masked phone number. The typed name and email are now in the secure store.

### MASVS-PRIVACY-2

> The app prevents identification of the user.

**Profile:** P · **Baseline:** Pass (confirm trackers in MobSF) · **Fixed in:** nothing needed.

- No advertising or analytics SDK in the normal builds.
- Tester analytics are opt-in, use a random ID, turn off person profiles and GeoIP, and never send names, amounts or typed text ([tester/track.ts](../../mobile/src/features/tester/track.ts)). They only exist in the tester build.

**As built (22 Nov 2026): Pass (confirm trackers in MobSF).** The install id sent as `x-device-id` is a random UUID, kept through a normal sign-out and replaced after Delete account (signed in), a remote sign-out and the wrong-PIN lockout ([lib/api/device.ts](../../mobile/src/lib/api/device.ts)). No device model or hardware id is sent, only the platform and app version. The phone sends its Expo push token only to the Vaultwise server (Expo's push service issues it and delivers the pushes), and only on live data.

### MASVS-PRIVACY-3

> The app is transparent about data collection and usage.

**Profile:** P · **Baseline:** Partial · **Fixed in:** [05](../plans/05-server-online.md) (privacy policy and terms).

- Pass: permission prompts say exactly what the camera, photos and Face ID are for ([app.json](../../mobile/app.json)). The iOS privacy manifest is filled in. The AI consent sheet and the tester card explain what is sent.
- Fail: the privacy policy and terms are placeholders, marked "Placeholder text" ([AboutScreen.tsx](../../mobile/src/features/account/settings/AboutScreen.tsx)). No Google Play data safety answers are written down yet.

**As built (22 Nov 2026): Partial.** The placeholders are gone: Help & legal shows short privacy and terms summaries (a Practice version in Practice-only builds), and a build with a server address links to the server's `/privacy` and `/terms` pages ([AboutScreen.tsx](../../mobile/src/features/account/settings/AboutScreen.tsx); pages in `src/app/privacy`, `src/app/terms`). **Open:** the Google Play data safety answers still aren't written down.

### MASVS-PRIVACY-4

> The app offers user control over their data.

**Profile:** P · **Baseline:** Partial · **Fixed in:** [05](../plans/05-server-online.md) (consent defaults to "no" on the server, web account deletion).

- Pass: Delete account wipes the phone and closes the account on a signed-in server ([reset/route.ts](../../src/app/api/v1/reset/route.ts)). AI consent can be withdrawn in the Trust centre ([TrustScreen.tsx](../../mobile/src/features/account/settings/TrustScreen.tsx)). Live accounts can export their data.
- Fail: a missing `x-ai-consent` header counts as yes ([ai-consent.ts](../../src/lib/ai-consent.ts)), and the assistant route sends the customer snapshot to the AI without checking consent ([assistant/route.ts](../../src/app/api/v1/assistant/route.ts)).
- Fail: Practice offers no export, although Practice data is now saved on the phone ([SettingsHome.tsx](../../mobile/src/features/account/settings/SettingsHome.tsx) `exportData()`).
- Fail: no web page for deleting an account, which Google Play requires.

**As built (22 Nov 2026): Partial.** The assistant's stream now sends `x-ai-consent` from the assistant switch, and the server refuses without a yes (403 `ai_consent_required`, shown as a plain message by [useChat.ts](../../mobile/src/features/assistant/useChat.ts); server side in [ai.md](../features/ai.md)). A web delete-account page exists (`src/app/delete-account`). Closing a signed-in account from the phone needs the MPIN. **Open:** Practice still offers no export (baseline N9).

## How to re-run this checklist

Do this after plans 03 to 07, then write [report.md](README.md#before-and-after) from the difference.

1. **Record the code.** Note `git rev-parse --short HEAD` and `git status --short` at the top of this page.
2. **Re-check each control in the code.** Start from the evidence links above. Quick checks:

   | Control | Check |
   |---|---|
   | STORAGE-1 | `grep -rn "async-storage" mobile/src` should find only the bulk store in `storage.ts`, and the Practice save should hold no name or email. |
   | STORAGE-2 | `mobile/app.json` sets `"allowBackup": false`; MobSF's manifest section agrees. |
   | CRYPTO-1 | Read `hash()` in `mobile/src/lib/auth/device-pin.ts`. |
   | AUTH-1 | Start the server with `NODE_ENV=production` and no `FIREBASE_PROJECT_ID`: it must refuse. |
   | AUTH-2 | On a phone: a biometric can't change the PIN or turn lock off; new installs have lock on. |
   | AUTH-3 | `npm test`; every money route refuses without the MPIN (`tests/mpin.test.ts` from plan 03). |
   | NETWORK-1 | `curl -I https://<domain>` shows HSTS; SSL Labs gives A or better. |
   | PLATFORM-3 | `grep -rn "useSensitiveScreen" mobile/src` lists the sensitive screens; try a screenshot on each. |
   | CODE-3 | `npm audit --json` in the root and in `mobile/`. No high or critical without a written reason. |
   | CODE-4 | Send a request that throws on purpose: the answer says "Something went wrong" with an error id. |
   | PRIVACY-4 | Call the assistant route with no `x-ai-consent` header: it must refuse. |

3. **Scan the new APK with MobSF** (steps in [baseline-2026-11-22.md](baseline-2026-11-22.md#mobsf-scan)). Save it as `docs/security/mobsf-final.pdf`. Match each MobSF finding to a control here, and settle every "confirm in MobSF" item.
4. **Fill in the Final column** and update the summary counts. Keep the Baseline column as it is.
5. **Check the standard.** If mas.owasp.org shows a newer MASVS than v2.1.0, note what changed before comparing.
