# MPIN (phone)

Every money move out needs the 6-digit MPIN, checked by the server ([plan 03](../../../../docs/plans/03-mpin.md), contract in [contracts.md](../../../../docs/plans/contracts.md#mpin-plan-03)). This module asks for it, reads the server's answers, keeps the Face ID / fingerprint shortcut, and keeps the app-unlock PIN the same as the MPIN.

## How it works

- **`withMpin(reason, call)`** (most flows): opens the MPIN sheet (`app/mpin.tsx`, full-screen modal) with the reason ("Pay ₹1,200 to City Clinic"). The sheet stays up while `call(pin)` runs, so a wrong MPIN shakes the dots and says how many tries are left, a lock shows when it ends (and pauses the pad), and a missing MPIN asks again. It resolves with the call's result once the sheet has closed, or `null` if the person closed it. Any other failure closes the sheet and is thrown to the flow, which shows it as before.
- **`ensureMpin(reason)`**: just collects the MPIN (`null` if cancelled). The flow sends it and reads the answer with `readMpinError()`.
- **`MpinPanel`**: the same prompt as a component, for flows inside a React Native `Modal`, where a route can't open on top (Core buy, limit raises).
- **One ask at a time.** A second ask while one is open resolves as cancelled; if the sheet can't open within 3 s (its route is gone, say the app locked), the ask counts as cancelled. Each ask is settled once, and only by its own sheet, so a late answer can never settle a newer ask.
- **Never "cancelled" while the MPIN is with the server.** While `call(pin)` runs, Close, Android Back, "Forgot your MPIN?" and "Reset with a code" are off. If the sheet goes anyway (the app locks mid-call and its route is removed), the flow gets the call's real result when it ends (done, or the error; a wrong MPIN or untrusted phone counts as cancelled, since nothing moved), and the sheet doesn't navigate once it's gone. Otherwise a flow told "nothing was sent" could send the move again, and a late `router.back()` could pop another screen.
- **Server answers** are read in one place, `errors.ts`, by `code` (never by status: a 401 `mpin_required` is not a sign-out). `triesLeft` and `lockedUntil` come from the error body (`ApiError.data`), with the message as a fallback.
- **Upgrade.** When `/me` says `mpin.upgradeDue` (a 4-digit PIN from before), the sheet first asks for the current PIN, then a new 6-digit MPIN twice (`POST /mpin`), then the money move carries on with the new one. "My PIN has 6 digits" skips that for an older account whose PIN already has 6.
- **Biometric shortcut** (`biometric.ts`): Settings → Security → "Use Face ID / fingerprint for payments". Turning it on needs the MPIN (checked against this phone's copy, with the wrong-PIN guard), then it is saved with `expo-secure-store` and `requireAuthentication: true` in its own keychain service. The sheet offers it once as it opens and on the pad's biometric key; the phone hands the MPIN back only after a biometric check, and the server checks it like a typed one. A new fingerprint or face invalidates it (`getItemAsync` gives null): the shortcut turns off and the person types the MPIN. A saved MPIN the server refuses (changed elsewhere) turns it off too. **Live only**: the copy holds the live MPIN, so in Practice the shortcut reads as off (Settings says "Live only"), is never offered, saved or read, and a Practice MPIN change leaves it as it is. Otherwise the simulator would refuse it (and the live copy would be dropped), and a copy saved in Practice would cost a real wrong try live. The Face ID text is `faceIDPermission` in `app.json`.
- **One PIN** (`sync.ts`): onboarding sends the chosen MPIN and keeps it as the unlock PIN; Change MPIN (`POST /mpin`) updates both and re-saves the biometric copy; an MPIN typed for a money move becomes the unlock PIN only when the server's acceptance proves it (`mpinCheckedByServer()`): live, and `/me` says `mpin.enforced: true`. A server with `MPIN_ENFORCED=false` accepts a wrong MPIN (and older servers ignore it), and Practice checks its own MPIN (the printed `246810`), so neither ever replaces the unlock PIN. The server sends `enforced` on `GET /me` (`true` unless it runs with `MPIN_ENFORCED=false`). Unlocking still works offline against the local hash (`lib/auth/device-pin.ts`: `pbkdf2:<iterations>:<salt>:<hash>:<digits>`, see features/protection; older SHA-256 values, `<salt>:<hash>:<digits>` or a 4-digit `<salt>:<hash>`, keep working and are rewritten at the next right PIN).
- **A biometric never replaces the MPIN** for changing it or for turning app lock off (`SecurityFlow.tsx`).
- **Forgot your MPIN** (devices, plan 06; `ResetMpinScreen.tsx`, `app/settings/reset-mpin.tsx`): from the sheet's "Forgot your MPIN?" (the sheet closes, the money move counts as cancelled) or Settings → Security. A code to the verified phone (purpose `mpin_reset`, the code step from `features/phone-verify`), a new MPIN twice (the same policy), then `POST /mpin/reset`, which also ends any lock; the unlock PIN and the biometric copy follow (`resetMpin()` in `sync.ts`). It needs a verified number (it asks for one first), a trusted phone (an untrusted one is told to use its trusted phone or ask a person) and a number on the account for 72 hours: within 72 hours of the number being added or changed, the code (or the reset) answers 403 `phone_recently_changed` with `allowedAt`, and the screen says resetting is paused until then (`ResetOnHold`), with a person one tap away. Embedded prompts say where to find it instead.
- **A phone that isn't trusted yet** (devices, plan 06): a money move over the cap answers 403 `device_untrusted` with `trustableAt`. The prompt reads it with `readDeviceError()` (`errors.ts`), pauses the pad and says when large amounts can move, with **Trust this phone** (the sheet closes and opens `features/devices`' trust flow). With `trustableAt: null` (a phone first seen after a device sign-out, which never trusts itself) it says waiting won't do it, with **Trust with a code**. When `/me` says the account couldn't add this phone (`registered: false`), `deviceProblemFor()` swaps in a calm explanation and there's no button. `phoneTrust()` gives every screen the same four states.
- **Every MPIN check reads the same way, rollback mode included**: with `MPIN_ENFORCED=false` the server still locks (423 `mpin_locked` with `lockedUntil`) and sends `triesLeft` on `mpin_wrong` for trusting a phone, signing one out, changing the MPIN, changing the phone number and Tier 2 emergency. `readMpinError()` reads those by code, and the sheet, the embedded panel and Change MPIN already show tries and locks from it.
- **Phone number** (otp): adding or changing it needs the MPIN; features/phone-verify shows this module's `MpinPanel` after the code (handed in by its route), so tries and locks read the same.
- **Practice** (`lib/api/demo/mpin.ts`): every simulated money move needs the MPIN, with the same lock (5 wrong → 1 minute, then 5 minutes, 30 minutes, 24 hours), the same codes and messages, and the same policy for changes. The count and lock are a Practice slice (`registerPracticeSlice`), so they survive a reload. The Practice MPIN is `246810` (`PRACTICE_PIN`); `/me` adds `mpin.practiceDefault` so screens show it only while it's still the one. "Start Practice over" clears the count and keeps the MPIN; Delete account puts it back.

## Files

| File | What it holds |
|---|---|
| `config.ts` | `MPIN_ENABLED`, the route, the sheet-open timeout |
| `ask.ts` | `withMpin`, `ensureMpin`, the pending ask |
| `MpinSheet.tsx`, `MpinPanel.tsx`, `useMpinEntry.ts` | The sheet, the prompt, and its logic (enter, checking, upgrade, lock, biometric) |
| `errors.ts` | `readMpinError`, plain messages, `unlockTimeText` |
| `policy.ts` | `checkNewMpin` and the lock steps, pure (mirrors `src/lib/mpin/policy.ts` and `attempts.ts`; the simulator imports it) |
| `biometric.ts` | The Face ID / fingerprint shortcut |
| `sync.ts` | `/me` status, `rememberMpin`, `changeMpin`, `resetMpin` (devices) |
| `ResetMpinScreen.tsx` | Forgot your MPIN: code, new MPIN twice, done (devices) |

## Switch

`MPIN_ENABLED` in `config.ts`. Off: nothing is asked, flows send no MPIN (only for a server with `MPIN_ENFORCED=false`). The Practice simulator still checks it, so leave it on while Practice is in use.

## Touch points outside this folder

| File | What |
|---|---|
| `src/app/mpin.tsx`, `src/app/_layout.tsx` (`// mpin`) | The sheet's route, inside the in-app guard |
| `src/lib/api/client.ts`, `wallet.ts`, `wallet-types.ts` | `pin` on `withdraw`, `walletMove`, `walletSpend`, `walletCashOut`, `walletSettings`, `setLimits`, `buyCore`, `reset`; `changeMpin` |
| `src/lib/api/types.ts` | `MeMpin` (`upgradeDue`, `lockedUntil`, `enforced`), `mpin` on `/me` |
| `src/lib/api/errors.ts`, `http.ts` (`// mpin`) | `ApiError.data`: the error body's extra fields |
| `src/lib/api/practice.ts` | `PRACTICE_PIN = "246810"` |
| `src/lib/api/demo/mpin.ts` | The simulator's MPIN, lock and change (a Practice slice) |
| `src/lib/api/demo/index.ts`, `vaults.ts`, `wallet.ts`, `emergency.ts`, `invest.ts`, `settle.ts` (`// mpin`) | `requirePracticeMpin()` in each money move; `/me` `mpin`; `changeMpin` |
| `src/lib/api/pay-sim.ts` (an "mpin:" doc comment) | The checkouts take how a confirm's MPIN is checked as a parameter (`settle.ts` passes `requirePracticeMpin`; a live dry run checks the Practice MPIN) |
| `src/lib/auth/device-pin.ts` | Stores the PIN's length; 4 or 6 digits |
| `src/features/account/pin-guard.ts`, `pin.tsx`, `PinLayout.tsx`, `UnlockScreen.tsx` | PIN length on this phone (`useDevicePinLength`, `pinWord`), the pad's length |
| `src/features/account/onboarding/ChoosePinStep.tsx`, `ProtectStep.tsx` | 6 digits and the policy at sign-up |
| `src/features/account/settings/security/SecurityFlow.tsx`, `SettingsHome.tsx` | Change MPIN, app lock without biometric bypass, the payments biometric switch |
| `src/features/account/settings/delete/*` | Closing a signed-in account needs the MPIN |
| `src/features/account/settings/limits/LimitEditor.tsx` | MPIN step on a raise |
| `src/features/proof/withdraw/useWithdrawalSubmission.ts`, `WithdrawFlow.tsx` | MPIN on the withdrawal request |
| `src/features/wallet/flows/SpendFlow.tsx`, `CashOutFlow.tsx`, `MoveFlow.tsx`, `LimitFlow.tsx` | MPIN on each move, and on raising or turning off the daily limit |
| `src/features/emergency/request/RequestFlow.tsx`, `ReviewStep.tsx` | MPIN on every tier (its own PIN step is gone) |
| `src/features/invest/core/LumpSumModal.tsx` | MPIN step on a Core buy |
| `src/features/pay/checkout/useCheckoutFlow.ts`, `PinStep.tsx` | 6-digit pad, MPIN answers by code, a biometric only in a live dry run (the payments shortcut is live-only, so none in Practice) |
| `src/features/account/settings/SettingsHome.tsx`, `security/SecurityFlow.tsx` | The payments shortcut shows "Live only" in Practice and can't be turned on there |
| `src/features/home/activity-model.ts` | Labels for `mpin.failed`, `mpin.locked`, `mpin.changed` |
| `src/app/settings/reset-mpin.tsx`, `src/app/settings/_layout.tsx` (`// devices`) | Forgot your MPIN, a full-screen modal |
| `src/lib/api/security.ts` (`resetMpin`), `src/lib/api/demo/devices.ts`, `demo/mpin.ts` (`resetPracticeMpin`, `// devices`) | `POST /mpin/reset`, live and Practice |
| `src/features/account/settings/SettingsHome.tsx` (`// devices`) | Forgot your MPIN? row |

## Removing it

Delete this folder, `src/app/mpin.tsx` and `src/lib/api/demo/mpin.ts`; remove the `// mpin` lines and the `pin` arguments above; put back the emergency PIN step from git history if Tier 2 still needs one. Server enforcement must be off first (`MPIN_ENFORCED=false`).

## Known limits

- **Reset needs a trusted phone with a verified number** (the server's rule): on a new phone, a forgotten MPIN still needs the trusted phone or a person.
- **The emergency limit request** (`POST /limits/emergency`) isn't on the phone (it's on the web app), so it isn't wired.
- **Turning app lock on with no PIN on this phone** keeps a copy of the MPIN typed twice, unchecked (there's no endpoint that only checks an MPIN). The next live money move the server accepts with `mpin.enforced: true` replaces it with the checked MPIN; until then a copy typed wrong stays (or change it in Settings → Security).
- A changed Practice MPIN is kept in the Practice save's secure part (the `mpin` slice is `sensitive: true`, so it goes to the Keychain / Keystore as `vw.practice.mpin`, lib/api/demo/persist.ts). Change MPIN in Practice still says not to reuse a real PIN.
- The date-of-birth rule is only checked by the server (the phone doesn't know the date of birth); its `mpin_weak` answer is shown.
- No tests: the phone has no test runner. `policy.ts` and `errors.ts` are pure and ready for one.
