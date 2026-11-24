# 03. MPIN checked by the server

**Status:** server, web and phone built (22 November 2026); SIP set-up and Satellite opt-in added, and money in given one ID-check rule (24 November 2026, [below](#sip-satellite-and-money-in-24-november-2026)); the phone's biometric shortcut still needs a check on a real phone · **Owner:** Claude (code), Shaik (review) · **Size:** L

## Goal

Every money move needs a 6-digit MPIN that the server checks, with a lockout that gets longer after repeated wrong tries. Today only Tier 2 emergency checks a PIN on the server, and nothing limits guesses ([security overview](../security.md), gaps 2, 3, 6 and 7).

## Scope

- **In:** MPIN policy, server checks on every money route, escalating lockout, audit of failures, phone MPIN entry for each money move, a biometric shortcut, changing and resetting the MPIN, Practice mirroring, migration of existing 4-digit PINs.
- **Out:** OTP-based reset (plan 06 adds the OTP; until then a reset needs the current MPIN, or Delete account in Practice).

## Design

### Server: `src/lib/mpin/` (new module)

| File | Job |
|---|---|
| `policy.ts` | `checkNewMpin(pin)`: exactly 6 digits; refuses repeated digits, straight runs (123456, 654321), a short list of common PINs, and the person's date of birth when known |
| `attempts.ts` | Table `mpin_attempts (user_id, failures, locked_until, updated_at)`. After 5 wrong tries: locked 1 minute, then 5 minutes, 30 minutes, then 24 hours. A right MPIN resets the count. |
| `verify.ts` | `requireMpin(user, pin)`: throws `mpin_required` (401), `mpin_locked` (423, with an unlock time) or `mpin_wrong` (403, with tries left). Writes the audit row **outside** any money transaction, so it isn't rolled back. |
| `index.ts` | `requireMpin`, `setMpin`, `changeMpin`, `checkNewMpin` |

- **One policy for money routes (open/closed).** A map in `src/lib/money-routes.ts` lists each money action with what it needs, for example `withdraw: { kyc: true, mpin: true }`. `customer({ money: "withdraw" })` applies it, so a new money route opts in with one line instead of hand-written checks. This also fixes the uneven ID-check gate (gap 7).
- **Routes covered:** creating a withdrawal; wallet spend, cash out and move; every emergency tier; loosening limits; raising or removing the wallet's daily limit; closing the account; changing the MPIN.
- **Defence in depth:** `payoutWithdrawal()` checks the owner and that the status can be paid (gap 6).
- **Fix the existing bug:** the emergency PIN check moves before the transaction, and its failure is audited.
- **Migration:** existing scrypt hashes stay valid. Accounts with a 4-digit PIN are flagged `mpin_upgrade_due`; the phone asks them to choose a 6-digit MPIN the next time they move money.

### Phone: `mobile/src/features/mpin/` (new module)

- `ensureMpin(reason)`: an imperative prompt, like `ensureAiAnswer()`, that opens a PIN sheet and resolves with the MPIN, or `null` if cancelled. Money flows call it just before their API call and pass the MPIN in the request body.
- **Biometric shortcut:** after a successful MPIN, the person can turn on "Use fingerprint for payments". The MPIN is then stored in SecureStore with `requireAuthentication: true`, so the phone releases it only after a biometric check. Enrolling a new fingerprint invalidates it, and they type the MPIN again.
- **One PIN.** The app-unlock PIN becomes the same MPIN. Unlock still works offline against the local hash, and changing the MPIN updates both.
- **Lockout screen:** shows the unlock time from the server's `mpin_locked` answer.
- **Practice:** the simulator applies the same policy and lockout, with Practice MPIN `123456` shown on Practice screens.

## Changes

| File | Change |
|---|---|
| `src/lib/mpin/*`, `src/lib/money-routes.ts` | **New** |
| `src/lib/auth/session.ts` | `customer({ money })` applies the policy map |
| Money routes under `src/app/api/v1/` | Opt in with `money: "<action>"`; accept `pin` in the body |
| `src/lib/emergency.ts`, `src/lib/vaults.ts` | Bug fixes above |
| `src/lib/db.ts` | `mpin_attempts` table; `users.mpin_upgrade_due` column |
| `mobile/src/features/mpin/*` | **New** |
| Phone money flows (withdraw, wallet, emergency, limits, delete account) | Call `ensureMpin()` before the API call |
| `mobile/src/lib/api/demo/*` | Mirror the policy and lockout |
| `mobile/src/features/account/pin-guard.ts`, `SecurityFlow.tsx` | Use the shared policy; a biometric no longer replaces the current MPIN when changing it |

## Tests

- `tests/mpin.test.ts`: policy refusals; lockout escalation and reset; every money route refuses without an MPIN, with a wrong one, and while locked; failures are audited; `payoutWithdrawal` refuses a cancelled withdrawal.
- Manual: each phone money flow asks for the MPIN, biometrics work after opt-in, the lockout screen shows the right time, and Practice behaves the same.

## Acceptance criteria

- [ ] No money route succeeds without the right MPIN.
- [ ] Five wrong tries lock money moves for 1 minute, and further failures lock for longer.
- [ ] Every wrong try appears in the audit log.
- [ ] Weak MPINs are refused when choosing one.
- [ ] Changing the MPIN needs the current MPIN, never only a biometric.
- [ ] Existing accounts move to 6 digits without losing access.

## Risks and rollback

- Older phone builds without MPIN entry would fail money moves. Ship the phone change by update first; turn on server enforcement after (switch `MPIN_ENFORCED`).
- **Rollback:** set `MPIN_ENFORCED=false`. Checks are skipped, and attempts are still recorded.

## What was built (server)

Built 22 November 2026. The feature doc is [features/mpin.md](../features/mpin.md); differences from the contract are in [contracts.md](contracts.md), "Deviations as built".

### Files

| File | What it does |
|---|---|
| `src/lib/mpin/config.ts`, `policy.ts`, `attempts.ts`, `meta.ts`, `verify.ts`, `change.ts`, `index.ts`, `README.md` | **New** module: switch, policy, lock, PIN length, `requireMpin()`, choosing and changing |
| `src/lib/money-routes.ts` | **New**: `MONEY_ROUTES`, the one policy map (MPIN, KYC gate, and `deviceCap` from plan 06) |
| `src/lib/api.ts` | `customer({ money })` applies the map's KYC gate (not `src/lib/auth/session.ts` as planned) |
| Money routes: `vaults/[id]/withdrawals`, `wallet/{spend,cash-out,move,settings}`, `emergency/withdrawals`, `limits`, `limits/emergency`, `invest/core/buy`, `reset` | Accept `pin` and call `requireMpin()` before any transaction |
| `src/app/api/v1/mpin/route.ts`, `mpin/reset/route.ts` | **New**: change, and reset with a texted code (plan 06) |
| `src/app/api/v1/me/route.ts`, `onboarding/route.ts` | `mpin` on `GET /me`; `PATCH /me` goes through `changeMpin()`; sign-up checks the policy |
| `src/lib/emergency.ts` | MPIN before the transaction (B1); `needsPin` on every tier while enforced |
| `src/lib/vaults.ts` | `payoutWithdrawal()` checks owner and a payable status (B3) |
| `src/components/mpin.tsx`; `verification.tsx`, `limits-panel.tsx`, `onboarding.tsx`, `devices-alerts.tsx`; `src/app/{emergency,invest/core,settings}/page.tsx` | Web MPIN box on every money screen; MPIN card and close-account MPIN in Settings |

### Decisions

- **One map, two calls.** A money route adds a line to `MONEY_ROUTES`, calls `customer({ money })` and `requireMpin()`. The KYC column kept the gates of the time exactly, so the uneven money-in gate ([security](../security.md) gap 7) was left as it was; it was fixed on 24 November 2026 with four money-in actions ([below](#sip-satellite-and-money-in-24-november-2026)).
- **`requireMpin()` throws inside a transaction**, so a wrong try's audit row can't be rolled back again (the B1 bug, made impossible rather than just fixed once).
- **PIN length in a table, not a column.** `mpin_meta` records the length when a PIN is set or typed correctly, because a scrypt hash doesn't reveal it. `upgradeDue` is true until a 6-digit PIN has been seen.
- **Both tables are created on first use** by the module, not in `db.ts`, so the module can be removed.
- **Rollback mode is gentler than planned:** new PINs may be 4 to 6 digits so older phones can still sign up, and the checks that existed before (Tier 2, changing the PIN) keep working.
- **Reset needs a trusted device** as well as the texted code (plan 06), so a code alone can't take over an account from a new phone.

### Tests

`tests/mpin.test.ts` (policy, lock escalation, the transaction guard, every action in the map, rollback mode, B1, B3, sign-up and closing in firebase mode, the JSON extra fields), plus `tests/otp.test.ts` (reset), `tests/emergency.test.ts`, `tests/auth.test.ts` and `scripts/e2e.mjs`.

### Acceptance criteria, server side

| Criterion | Server |
|---|---|
| No money route succeeds without the right MPIN | Done (`MPIN_ENFORCED` on, the default) |
| Five wrong tries lock money moves for 1 minute, then longer | Done |
| Every wrong try appears in the audit log | Done (`mpin.failed`, `mpin.locked`) |
| Weak MPINs are refused when choosing one | Done (sign-up, change, reset) |
| Changing the MPIN needs the current MPIN | Done on the server (`always: true`); the biometric part is phone-side |
| Existing accounts move to 6 digits without losing access | Done: old PINs keep working; `upgradeDue` prompts the change |

### Left open

- Turn enforcement on for a live server only once the phone build that sends the MPIN is out. It is on by default; public builds are Practice-only, so nothing breaks today.
- ~~Not covered by the map: setting up a SIP, Satellite opt-in and the round-up sweep (the contract lists only `invest_buy`).~~ **Done 24 November 2026:** `invest_sip`, `satellite_opt_in` and `roundup_sweep` are in the map ([below](#sip-satellite-and-money-in-24-november-2026)).
- Nothing here needs an account or a key from the owner.

### Review findings and fixes

The security review of 22 November 2026 ([security.md](../security.md#security-review-2026-11-22)) found two MPIN problems on the server; both are fixed:

- **Rollback mode allowed unlimited guessing (Medium).** With `MPIN_ENFORCED=false` the `always` checks had no lock. Now they apply the lock and `triesLeft` exactly as when enforced, a PIN sent with a money move during a lock isn't checked, and the lock messages and `mpin_locked` alert say "anything that needs your MPIN" instead of claiming money moves are locked. `GET /me` adds `mpin.enforced`. (`src/lib/mpin/verify.ts`, `attempts.ts`, `src/lib/alerts/messages.ts`)
- **The phone number could take over the MPIN (High).** A new action `phone_change` in `MONEY_ROUTES`: `POST /me/phone` now needs the current MPIN, always checked. A number added or changed in the last 72 hours can't reset the MPIN (403 `phone_recently_changed`). See [plan 06](06-devices-alerts-otp.md#review-findings-and-fixes).

## What was built (phone)

Built 22 November 2026. The phone side is described in [features/mpin.md](../features/mpin.md#on-the-phone); the module's own notes, with every touch point, are in [mobile/src/features/mpin/README.md](../../mobile/src/features/mpin/README.md). The phone's unlock PIN and its guard are in [phone-security.md](../features/phone-security.md).

### Files

| File | What it does |
|---|---|
| `mobile/src/features/mpin/` (`config.ts`, `ask.ts`, `MpinSheet.tsx`, `MpinPanel.tsx`, `useMpinEntry.ts`, `errors.ts`, `policy.ts`, `biometric.ts`, `sync.ts`, `ResetMpinScreen.tsx`, `index.ts`, `README.md`) | **New** module: the prompt, the server's answers, the policy, the payments shortcut, keeping the unlock PIN in step, Forgot your MPIN (plan 06) |
| `mobile/src/app/mpin.tsx`, `app/_layout.tsx` | The sheet's route, a full-screen modal inside the in-app guard (`// mpin`) |
| `mobile/src/app/settings/reset-mpin.tsx`, `settings/_layout.tsx` | Forgot your MPIN, a full-screen modal |
| `mobile/src/lib/api/client.ts`, `wallet.ts`, `wallet-types.ts`, `types.ts` | `pin` on every money move out; `changeMpin`; `reset(pin)`; `MeMpin` on `/me` |
| `mobile/src/lib/api/errors.ts`, `http.ts` | `ApiError.data`: the error body's extra fields (`triesLeft`, `lockedUntil`, `reason`) |
| `mobile/src/lib/api/practice.ts` | `PRACTICE_PIN = "246810"` |
| `mobile/src/lib/api/demo/mpin.ts`, and `demo/index.ts`, `vaults.ts`, `wallet.ts`, `emergency.ts`, `invest.ts`, `settle.ts`, `pay-sim.ts` | **New** Practice MPIN, lock and change (a sensitive Practice slice); `requirePracticeMpin()` in each simulated money move |
| `mobile/src/lib/auth/device-pin.ts` | Stores the PIN's digit count; 4 or 6 digits |
| `mobile/src/features/account/pin-guard.ts`, `pin.tsx`, `PinLayout.tsx`, `UnlockScreen.tsx` | `useDevicePinLength()`, `pinWord()`, pads of 4 or 6 |
| `mobile/src/features/account/onboarding/ChoosePinStep.tsx`, `ProtectStep.tsx` | A 6-digit MPIN under the policy at sign-up; the server's `mpin_weak` is shown |
| `mobile/src/features/account/settings/security/SecurityFlow.tsx`, `SettingsHome.tsx` | Change MPIN (current MPIN, never a biometric), lock off with the MPIN only, the payments shortcut switch, Forgot your MPIN? row |
| `mobile/src/features/account/settings/delete/*` | Closing a signed-in account sends the MPIN |
| Money flows: `features/proof/withdraw/useWithdrawalSubmission.ts`; `features/wallet/flows/SpendFlow.tsx`, `CashOutFlow.tsx`, `MoveFlow.tsx`, `LimitFlow.tsx`; `features/emergency/request/RequestFlow.tsx`, `ReviewStep.tsx`; `features/account/settings/limits/LimitEditor.tsx`; `features/invest/core/LumpSumModal.tsx`; `features/pay/checkout/useCheckoutFlow.ts`, `PinStep.tsx` | Ask for the MPIN and send it |
| `mobile/src/features/emergency/request/PinStep.tsx` | **Deleted**: emergency uses the shared sheet on every tier |
| `mobile/src/features/home/activity-model.ts` | Labels for `mpin.failed`, `mpin.locked`, `mpin.changed` |

### Decisions and deviations

- **`withMpin()` as well as `ensureMpin()`.** Most flows use `withMpin(reason, call)`: the sheet stays up while the server checks, so a wrong MPIN shakes the dots and a lock pauses the pad without leaving the sheet. `ensureMpin()` (as planned) only collects the MPIN.
- **`MpinPanel` for flows inside a React Native `Modal`** (Core buy, limit raise), where a route can't open on top.
- **Practice MPIN `246810`, not `123456`.** `123456` is a straight run the policy refuses; the contract names `246810`.
- **Answers are read by `code`, never by status,** in one file (`errors.ts`). A 401 `mpin_required` is not a sign-out.
- **No separate lockout screen.** The sheet shows "locked until 3:40 pm" and pauses the pad until `lockedUntil`, then re-reads `/me`.
- **The upgrade happens in the sheet.** With `/me` `mpin.upgradeDue`, the next money move asks for the 4-digit PIN, then a new 6-digit MPIN twice, then carries on. "My PIN has 6 digits" skips it.
- **One PIN, kept in step from both sides.** Onboarding sets both; Change MPIN and reset update the server first, then the phone's copy and the biometric copy; any MPIN the server accepts becomes the phone's copy if it differs.
- **The payments shortcut** is its own Keychain / Keystore entry (service `vw.mpin.biometric`) with `requireAuthentication: true`, as planned. iOS asks for a biometric before writing it (it doesn't prompt on write).
- **Delete account:** only closing a signed-in account needs the MPIN (the server's `close_account`). Practice and a server without sign-in keep the phone's PIN check.
- **Pay with Vaultwise** keeps its own 6-digit pad, because checkouts are still simulated on the phone; it reads MPIN answers with `readMpinError()`. In Practice a biometric works only through the shortcut.
- **Policy shared with the simulator.** `features/mpin/policy.ts` is pure and imported by `lib/api/demo/mpin.ts` and `demo/devices.ts`, so the screens and Practice can't disagree.
- **Not wired:** the emergency limit request (`POST /limits/emergency`, on the web app only). SIP set-up was here too until 24 November 2026, when it joined the server map; the phone's `PlanModal` asks for the MPIN by the same rule.

### How it was checked

- `npm run typecheck` and `npm run lint` in `mobile/` pass (re-run for these docs); `npm run doctor`; `npx expo export` for Android and web.
- The flows were tried in the browser preview on Practice data, where the simulator applies the same policy, codes and lock. The browser has no secure store or biometrics, so the shortcut isn't covered there.
- To repeat by hand in Practice: approve a withdrawal with `246810`; type a wrong MPIN five times and see the lock and its unlock time; change the MPIN to `123456` (refused as a straight run); reset it with the code `123456`.

### Still needs a real phone

- The payments shortcut: turning it on (iOS prompt before writing, Android prompt on write), approving a money move with Face ID or a fingerprint, and that enrolling a new fingerprint turns it off.
- Against a live server: an account with an old 4-digit PIN going through the upgrade.

### Acceptance criteria, phone side

| Criterion | Phone |
|---|---|
| No money route succeeds without the right MPIN | Every phone money flow sends it; Practice checks it the same way |
| Five wrong tries lock money moves for 1 minute, then longer | Shown in the sheet from `lockedUntil`; Practice uses the same steps |
| Every wrong try appears in the audit log | Server side; the phone's activity feed labels the `mpin.*` entries |
| Weak MPINs are refused when choosing one | Checked on the phone first (same policy), then by the server |
| Changing the MPIN needs the current MPIN, never only a biometric | Done (`SecurityFlow.tsx`) |
| Existing accounts move to 6 digits without losing access | Done: old 4-digit PINs unlock and approve until the upgrade in the sheet |

### Left for the owner

- Nothing needs an account or a key. Turn `MPIN_ENFORCED` on for the live server only after testers have a build that sends the MPIN (the `tester-live` build from [plan 02](02-apk-rebuild-prep.md#what-was-built-phone)).

### Review findings and fixes (phone)

The two phone security reviews of 22 November 2026 ([security.md](../security.md#security-review-2026-11-22)) found these in the phone's MPIN work; all are fixed. The decision above that "any MPIN the server accepts becomes the phone's copy" was changed by the second row.

| Finding | Severity | Fix |
|---|---|---|
| **A money move could go through after its sheet said "cancelled",** and a late answer could settle a newer ask. | Medium | Each ask is settled once, and only by its own sheet; if the sheet unmounts mid-call the flow gets the real result; Close, Back, Forgot and Reset are off while checking (`features/mpin/ask.ts`, `MpinSheet.tsx`, `useMpinEntry.ts`). |
| **A successful payment could change the unlock PIN to an unchecked PIN** (a rollback-mode server accepts a wrong MPIN, and Practice checks its own). | Medium | The typed MPIN becomes the unlock PIN only when the server says `GET /me` `mpin.enforced === true`, never in Practice (`mpinCheckedByServer()` in `features/mpin/sync.ts`). |
| **The payments shortcut mixed Practice and live:** a copy saved in Practice could cost a real wrong try live, and Practice would refuse the live copy. | Low | Live only: Practice never offers, saves or reads it, and Settings says "Live only" (`features/mpin/biometric.ts`). |
| **A timed-out money move could be sent twice.** | Medium | `mayHaveGoneThrough()` in `lib/api/errors.ts`: the emergency request, withdraw, Core buy, limit changes and the wallet's flows show "We couldn't confirm this" with a way to look, instead of resending. |


The phone also follows the server's new contract: in rollback mode the `always` checks now lock and send `triesLeft`, which the prompt already reads by code; changing the phone number asks for the MPIN (`phone_change`, `MpinPanel` in `PhoneVerifyScreen`); and Forgot your MPIN shows "Resetting your MPIN is paused" on `phone_recently_changed`.

## SIP, Satellite and money in (24 November 2026)

An external review pointed out that setting up a SIP and opting in to Satellite moved money from the bank with no MPIN. Both are money actions now, and money in got one ID-check rule (security gap 7). Everything below is built on the server, the web app, the phone and Practice.

| Action | Route | MPIN | ID gate |
|---|---|---|---|
| `invest_sip` | `POST /invest/core/sip` `{ amount, frequency, startDate?, pin }` | Setting one up, or a change that moves more money: `sipNeedsMpin(current, next)` in `src/lib/invest/sip-rule.ts` | yes |
| `satellite_opt_in` | `POST /invest/satellite/opt-in` `{ amount, acknowledged, pin }` | Always (opting in and every later allocation) | yes |
| `wallet_top_up` | `POST /wallet/top-up` | no (money in) | yes |
| `vault_deposit` | `POST /vaults/{id}/deposits`; `POST /vaults` with `initialDeposit` | no (money in) | yes |
| `bank_simulate` | `POST /accounts/simulate` | no (money in) | yes |
| `roundup_sweep` | `POST /accounts/sweep` | no (money in) | yes |

- **When a SIP needs the MPIN.** No active plan: yes. More per month than now (weekly counts as 52/12 a month, so turning a monthly plan weekly at the same amount is a raise): yes. A `startDate` before the current next debit (a past date runs missed debits at once): yes. Lowering it, keeping it, or moving the next debit later: no. Pausing it (`DELETE /invest/core/sip`) never does, and nor do the debits the scheduler makes later (`runDueSips()`): they were authorised when the plan was set up or raised. `sip-rule.ts` has no imports, so the web form (`src/app/invest/core/page.tsx`) shows the MPIN box by the same rule; the server's check is the one that counts. A `startDate` that isn't a date is 400 `bad_start_date`.
- **`POST /invest/satellite/run` needs no MPIN.** It records paper positions only and never moves ledger money; the allocation already moved, with the MPIN, at opt-in. Its ID gate is unchanged.
- **Money in** (`moneyIn: true`): money entering from the linked bank needs a verified ID (403 `kyc_required`, subject to `KYC_ENFORCED`) and never the MPIN, so those routes only call `customer({ money })`. Vault deposits were ungated before. `POST /vaults` takes money from the bank only with an `initialDeposit`, so it calls `moneyGate(user, "vault_deposit")` (`src/lib/api.ts`, using `assertKycGate()` from `src/lib/auth/session.ts`) before anything is written, and creates the vault, its custom rule and the opening deposit in one transaction. Wallet → vault stays `wallet_move` (MPIN and ID).
- **Phone.** `setSip(amount, frequency, pin?)` and `satelliteOptIn(amount, acknowledged, pin?)` in `mobile/src/lib/api/client.ts`. `PlanModal.tsx` asks for the MPIN when `sipNeedsMpin()` (`mobile/src/lib/invest.ts`) says so, and opens the step if the server answers `mpin_required`; `AllocateModal.tsx` walks through every risk statement, the amount and the MPIN. Practice checks the same rules and applies the ID gate to every money move, in the server's order: ID, then the device cap, then the MPIN (`assertPracticeIdVerified()` in `mobile/src/lib/api/demo/identity.ts`).
- **Tests.** `tests/invest-money.test.ts` (the SIP rule and route, opt-in, the paper run, the ID gate first), `tests/money-in.test.ts` (the money-in rule, `POST /vaults` all or nothing), `tests/mpin.test.ts`; contract vectors `sip-mpin.json` and `money-actions.json` in `tests/contract/vectors/`, run against the server and the phone ([tests/contract/README.md](../../tests/contract/README.md)).

The feature doc is [features/mpin.md](../features/mpin.md); the contract's action table is updated in [contracts.md](contracts.md#which-actions-need-it).
