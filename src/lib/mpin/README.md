# MPIN (server)

A 6-digit PIN the server checks for every money move, with a lock that gets longer after repeated wrong tries. Plan: [docs/plans/03-mpin.md](../../../docs/plans/03-mpin.md). Contract: [docs/plans/contracts.md](../../../docs/plans/contracts.md), "MPIN (plan 03)".

## Switch

| Variable | Effect |
|---|---|
| `MPIN_ENFORCED` | Unset or anything but `"false"` (the default): every money action needs the right MPIN, wrong tries lock money moves, and a new PIN must pass the 6-digit policy. |
| `MPIN_ENFORCED=false` | Rollback mode. Money moves skip the check, but a PIN that was sent is still checked, counted and audited (not while a lock is on: then it isn't checked at all). The `always` checks (Tier 2 emergency, changing the PIN, changing the phone number, trusting or signing out a device) behave exactly as when enforced, **the lock included**, with `triesLeft` and `lockedUntil`. New PINs only have to be 4 to 6 digits, so older phone builds can still sign up. `GET /me` reports `lockedUntil: null` (money moves aren't locked) and `enforced: false`. |

Ship the phone build that sends the MPIN first, then turn enforcement on.

## Rules

- **Policy** (`policy.ts`, pure): exactly 6 digits; refused: one digit repeated, straight runs up or down (wrapping 9→0 counts, so `567890` and `098765` are runs), the `COMMON_MPINS` list, and the date of birth as `DDMMYY` when a verified ID has one. The phone's Practice simulator mirrors this file.
- **Lock** (`attempts.ts`): 5 wrong tries lock money moves for 1 minute; each further 5 lock for 5 minutes, 30 minutes, then 24 hours (and stay at 24 hours). Tries while locked are refused without checking the PIN and aren't counted. A right MPIN, or setting a new one, resets the count. The lock always holds for `always` checks, whatever `MPIN_ENFORCED` says, so rollback mode can't be used to guess the PIN without limit; every lock raises an `mpin_locked` alert.
- **Audit**: every wrong try writes `mpin.failed` (`{ action, failures, triesLeft, enforced }`) and every lock `mpin.locked` (`{ action, failures, lockedUntil, enforced }`); a change writes `mpin.changed` (`{ by, digits }`). The PIN is never logged. `requireMpin()` refuses to run inside a transaction, so these rows can't be rolled back with the money move.
- **Legacy PINs**: existing scrypt hashes keep working (a 4-digit PIN is just a shorter right answer). A hash doesn't reveal its length, so `mpin_meta` records it whenever a PIN is set here or typed correctly. `upgradeDue` is true until the server has seen a 6-digit PIN for the account (a known 4- or 5-digit PIN, or an account not seen since this shipped).

## Files

| File | What |
|---|---|
| `config.ts` | `mpinEnforced()`, length, tries per lock, lock steps |
| `policy.ts` | `checkNewMpin(pin, { dob })`, `COMMON_MPINS`, `birthDateAsPin()` (pure) |
| `attempts.ts` | table `mpin_attempts (user_id, failures, locked_until, updated_at)`; lock maths |
| `meta.ts` | table `mpin_meta (user_id, pin_length, updated_at)`; `upgradeDue()` |
| `verify.ts` | `requireMpin(user, pin, action)`, `mpinStatus(user)`, `MpinError` |
| `change.ts` | `mpinField` (zod), `assertNewMpin()`, `setMpin()`, `changeMpin()`, `recordChosenMpin()` |
| `index.ts` | the module's public surface |

Both tables are created on first use, per database.

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/v1/mpin` | `{ currentPin, newPin }` | `{ ok: true }`; 400 `mpin_weak`; the current-PIN errors below |
| POST | `/api/v1/mpin/reset` | `{ verificationToken, newPin }` | `{ ok: true }`: token from a texted code with purpose `mpin_reset` (src/lib/otp); the policy applies, the lock is cleared, audited `mpin.changed` `{ by: "reset" }`; needs a trusted device (src/lib/devices) and a verified number at least 72 hours old (403 `phone_recently_changed` with `allowedAt`) |
| POST | `/api/v1/me/phone` | `{ verificationToken, pin }` | adding or replacing the verified number: `pin` checked as `phone_change` (`always`) |
| GET | `/api/v1/me` | | adds `mpin: { upgradeDue, lockedUntil, enforced }` (`enforced`: whether `MPIN_ENFORCED` is on; the phone copies a typed MPIN into its unlock PIN only when it is true) |
| PATCH | `/api/v1/me` | `{ pin, currentPin }` | the same rules as `POST /mpin` |

Every money route in `src/lib/money-routes.ts` with `mpin: true` accepts `pin` in its body (a form field for `POST /limits/emergency`). `POST /invest/core/sip` (`invest_sip`) checks it only when setting a SIP up or moving more money (`sipNeedsMpin()` in `src/lib/invest`); `POST /invest/satellite/opt-in` (`satellite_opt_in`) always. The money-in actions (`moneyIn: true`: `wallet_top_up`, `vault_deposit`, `bank_simulate`, `roundup_sweep`) take only the ID gate and no MPIN; `requireMpin()` returns false for them without checking anything.

| Code | Status | Extra (in `MpinError.extra`) | When |
|---|---|---|---|
| `mpin_required` | 401 | | no `pin` |
| `mpin_wrong` | 403 | `triesLeft` | wrong PIN; the message says how many tries are left |
| `mpin_locked` | 423 | `lockedUntil` (ms) | locked, or this wrong try started a lock; the message says how long |
| `mpin_weak` | 400 | `reason`: `length`, `repeated`, `sequence`, `common`, `birth_date` | choosing a weak PIN |

`errorResponse()` in `src/lib/api.ts` spreads `MpinError.extra` into the JSON, so the body is `{ error, code, triesLeft }` and so on. The message carries the same facts for a client that ignores them, and `GET /me` has `mpin.lockedUntil`.

The birth-date rule needs a full `YYYY-MM-DD` date of birth from a verified ID. The photo check stores one; the steps flow (DigiLocker) keeps only the year of birth, so for those accounts the rule doesn't apply.

## Touch points outside this folder (marked `// mpin`)

| File | What |
|---|---|
| `src/lib/money-routes.ts` | the action → `{ mpin, kyc, moneyIn? }` map (part of this feature) |
| `src/lib/api.ts` | `customer({ money })` applies the map's KYC gate; `moneyGate(user, action)` applies it after the body is read (POST /vaults with an opening deposit) |
| `src/app/api/v1/vaults/[id]/withdrawals`, `wallet/{spend,cash-out,move,settings}`, `emergency/withdrawals`, `limits`, `limits/emergency`, `invest/core/buy`, `invest/core/sip`, `invest/satellite/opt-in`, `reset` | `requireMpin()` with the body's `pin` |
| `src/app/api/v1/wallet/top-up`, `vaults/[id]/deposits`, `vaults` (opening deposit), `accounts/simulate`, `accounts/sweep` | money in: the map's ID gate only |
| `src/app/api/v1/mpin/route.ts`, `mpin/reset/route.ts` | change, and reset with a texted code (plan 06) |
| `src/app/api/v1/me/phone/route.ts`, `devices/trust`, `devices/[id]/revoke` | `requireMpin(..., { always: true })` for the phone number and devices |
| `src/app/api/v1/me/route.ts` | `mpin` on GET; PIN change on PATCH through `changeMpin()` |
| `src/app/api/v1/onboarding/route.ts` | `assertNewMpin()`, `recordChosenMpin()` |
| `src/lib/emergency.ts` | `requireMpin()` before the transaction; `needsPin` true on every tier while enforced; `mpinEveryTier` input |
| `src/lib/vaults.ts` | `payoutWithdrawal()` checks the owner and a payable status (separate bug fix, B3) |
| `src/components/mpin.tsx` and the web money screens | the MPIN box (`MpinField`) and error text |
| `tests/mpin.test.ts` | tests |

## Remove it

1. Delete this folder, `src/lib/money-routes.ts`, `src/app/api/v1/mpin/` and `src/components/mpin.tsx`.
2. Remove the `// mpin` lines above (routes go back to `customer({ kyc: true })` where the map said `kyc: true`).
3. In `src/lib/emergency.ts`, put back a Tier 2 `checkPin()`, before the transaction.
4. Drop the tables: `DROP TABLE mpin_attempts; DROP TABLE mpin_meta;`.
