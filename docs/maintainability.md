# Maintainability review

> Every issue found while documenting the codebase on 22 November 2026, grouped by kind, with a fix and when to do it.

**Updated 24 November 2026** after an external review ([roadmap](plans/roadmap.md#external-review-24-november-2026)): B9, B20, B21, S1, S2, S3, C3, C4, T1 and T4 are fixed; B22, C9, D1, D2, D3, T2 and T3 are partly fixed, mostly by the phone's new test runner and the contract tests ([tests/contract/README.md](../tests/contract/README.md)). The three splits were refactors with no behaviour change, but they turned up real bugs, fixed the same day ([below](#found-and-fixed-with-the-external-review-24-nov-2026)).

Line numbers refer to commit `012a9fc` and will drift; rows for files split on 24 November name the new file instead. **When** says which [plan](plans/roadmap.md) fixes the issue, or "clean-up" for work to pick up alongside features. Tags use SOLID: SRP (single responsibility), OCP (open/closed), LSP (substitution), DIP (dependency inversion).

## Fix first: bugs and risky behaviour

| ID | Where | Problem | Fix | When |
|---|---|---|---|---|
| B1 | `src/lib/emergency.ts:231-243` | A wrong Tier 2 PIN's audit row is written inside the transaction, and the thrown error rolls it back. Confirmed with a test: 0 rows. | Check the PIN before `tx()` and audit outside it | **Fixed** 22 Nov 2026 (plan 03: `requireMpin()` refuses to run inside a transaction) |
| B2 | `src/lib/fraud.ts:84` | An overdue receipt adds 0 risk points: the scheduler renames `requested` to `overdue`, and the score only counts `requested` and `rejected`. Confirmed: 15 points before the tick, 0 after. | Add `overdue`; share one receipt-status constant | **Fixed** 22 Nov 2026 |
| B3 | `src/lib/vaults.ts:456-479` | `payoutWithdrawal()` checks the owner through `getVaultRow` but not that the status can be paid. | Add an allowed-status check | **Fixed** 22 Nov 2026 (plan 03) |
| B4 | `src/lib/vaults.ts:240-271` | `runDueContributions()` pays each run separately and moves `next_run_at` only after the loop. A crash mid-loop replays runs already paid. | One `tx()` per vault around runs and `next_run_at`; add a test | **Fixed** 22 Nov 2026 |
| B5 | `src/app/api/v1/vaults/[id]/route.ts:20-25` | The vault chart starts at 0 over the last 100 postings, so it's wrong for older vaults. | `balanceSeries()` in `lib/vaults.ts`, starting from balance minus the history | **Fixed** 22 Nov 2026 |
| B6 | `src/lib/api.ts:19` | Unexpected errors send the raw exception text to the client. | Generic message plus error id; details in the log | **Fixed** 22 Nov 2026 (plan 05: `errorId`) |
| B7 | `src/app/api/v1/reset/route.ts:14`, `src/lib/auth/session.ts:108` | Without sign-in configured, reset wipes the database and admin routes are open to anyone. | Refuse to start in production without sign-in | **Fixed** 22 Nov 2026 (plan 05: `src/instrumentation.ts`) |
| B8 | `src/lib/ai-consent.ts:13`, `src/app/api/v1/assistant/route.ts` | A missing consent header counts as yes; the web app never sends it; the assistant route never checks it. | Web asks; missing means no; assistant checks | **Fixed** 22 Nov 2026 (plan 05) |
| B9 | `src/lib/invest` (`strategies` table) | Strategies are shared across customers, so one customer's backtest overwrites another's. | Key strategies by user, or make them global and read-only | **Fixed** 24 Nov 2026: one row per customer and strategy (key `(user_id, id)`), read and written through `src/lib/invest/strategies.ts`; old databases are split by owner on open (`splitSharedStrategies()` in `src/lib/db.ts`); `tests/invest-strategies.test.ts` |
| B10 | `src/lib/invest/profile` (`scoreAnswers()`) | A missing answer throws a plain `Error`, giving a 500 instead of a 400. | Throw `HttpError(400, ...)` | **Fixed** 22 Nov 2026 |
| B11 | `src/lib/fraud.ts:58` | `resolveFlag()` doesn't check the flag exists or is open, and its audit row has no user id. | Update only open flags, check one row changed, carry `user_id` | **Fixed** 22 Nov 2026 |
| B12 | `src/app/api/v1/activity/route.ts:7`, `audit/[userId]/route.ts:12` | `?limit=abc` becomes `NaN`. | Validate query params with zod | **Fixed** 22 Nov 2026 |
| B13 | `src/lib/auth/identities.ts` (`bindIdentity()`) | A closed account's login can sign up again, because the upsert sets it back to active. Not confirmed as intended. | Decide the rule; add a test | [05](plans/05-server-online.md) |
| B14 | `src/lib/users.ts:94`, `src/lib/kyc/service.ts:62` | Two sources for `kyc_level`: pending is 0 in one and 1 in the other. | One `kycLevelFor(status)` | **Fixed** 22 Nov 2026 |
| B15 | `src/lib/recovery/notify.ts` | The `account_closed` notice exists but `closeAccount()` never sends it. | Send it | [06](plans/06-devices-alerts-otp.md) |
| B16 | `src/lib/recovery/find.ts`, `claimant.ts` (were `service.ts`) | Find and claim only match `kyc_records`, so people verified without one (seed data, `KYC_ENFORCED=false`) can't recover by ID. | Write a record when verifying, or document the limit | Partly: the steps flow writes a `kyc_records` row, so those people can recover; seed data and `KYC_ENFORCED=false` sign-ups still can't |
| B17 | `src/lib/verification/pipeline.ts` (`runPipeline()`), `proofs.ts` (`createProof()` starts a check as `processing`) | A check left `processing` after a crash is never restarted. | Resume stuck checks at start-up or on read | Clean-up |
| B18 | Proof appeals | A reviewer's denial allows another appeal, though the phone says "once". | Enforce one appeal on the server | **Fixed** 22 Nov 2026 |
| B19 | `mobile/src/features/assistant/components/ReportSheet.tsx` | Assistant reports never leave the phone, but the sheet says a person reads every report. | Add a report route, or change the text | Clean-up |
| B20 | `mobile/assets/samples/*` | Sample bills have fixed 2026 dates and will fail the 120-day rule from early 2027, breaking `npm run test:ai`. | Generate dates in the test, or refresh the samples | **Fixed** 24 Nov 2026: `tests/ai-verification.test.ts` (run by `npm run test:ai`) draws each bill with `renderSample()` (`src/lib/samples.ts`), dated relative to today. The bundled copies in `mobile/assets/samples` still carry fixed dates; Practice decides by file name (`outcomeFor()` in `mobile/src/lib/api/demo/proofs.ts`), so it isn't affected |
| B21 | `tests/scheduler.test.ts:68` | The SIP test calls the real Yahoo endpoint, so it fails when the network is slow (it did once on 14 October). | Inject a price provider with a fake in tests | **Fixed** 24 Nov 2026: every price read goes through `priceProvider()` (`src/lib/invest/prices.ts`, Yahoo in `yahoo.ts`); `tests/setup.ts` installs `fakePrices()` (`tests/helpers/prices.ts`) and makes `fetch` fail, so no test reaches the network |
| B22 | `mobile/src/lib/api/demo/{vaults,invest,emergency,index}.ts` | Some Practice writes skip the read-only recovery rule (`assertPracticeCanMove`). | Wrap every write in one guard | Partly (24 Nov 2026): every Practice money move now calls `assertPracticeIdVerified()` (`demo/identity.ts`), which includes `assertPracticeCanMove()`, and the contract test holds them to the server's money table. Still unguarded: `updateVault`, `cancelWithdrawal`, `setLimits`, `cancelSip`, `emergencyReceipt` and `appeal` |
| B23 | `mobile/src/lib/api/client.ts:51` | Any 404 from `/pay` is read as "not deployed", so once `/pay` exists, a real 404 would fall back to sample checkouts. | Gate on a capability flag or error code | When `/pay` ships |
| B24 | `src/lib/limits/period.ts` (was `limits.ts:36-47`), `src/lib/compliance.ts` | Personal limits use the server's midnight, not the customer's; `coolingOffDays` is shown but not enforced. | Use zoned day starts; enforce or remove cooling-off | Clean-up |
| B25 | `mobile/src/features/vaults` | "Pause all auto-saves" and skips are stored on the phone only, so the server still runs the rules. | Add server support, or label it as a reminder | Clean-up |

### Found and fixed in the security review (22 Nov 2026)

The four independent reviews of plans 02 to 07 found bugs in the new code, not in the items above. They are listed, with severity and where each was fixed, in [security.md](security.md) under "Security review, 2026-11-22". Still open from this round: closing an account or approving a recovery claim doesn't sign its devices out (the identities are disabled, so they can't sign in anyway) and recovery notices don't use the alert senders yet (B15). Setting up a SIP or Satellite opt-in moved money with no MPIN until 24 November 2026; they are now the money actions `invest_sip` and `satellite_opt_in` ([mpin.md](features/mpin.md)).

### Found and fixed with the external review (24 Nov 2026)

Found while splitting S1, S2 and S3 and adding the contract tests, and fixed the same day, each with a test. The module READMEs have the details.

| Where | Problem | Fix |
|---|---|---|
| `src/lib/limits/increase.ts`, `review.ts` | Approving an emergency limit increase saved the request's filed limits whole, undoing any limit the customer had lowered since. | `planIncrease()` applies the increase on top of the limits as they are when it's applied, inside the same transaction |
| `src/lib/limits/expiry.ts`, `increase.ts` | An expiring increase set every limit to the lower of now and its own `before`, undoing other increases still active. | `fallBack()`: each raised limit falls back to the higher of its fall-back level and what another active increase grants |
| `src/lib/limits/emergency-request.ts` | The monthly number of emergency requests was checked only before the AI call, so parallel requests could all be recorded. | Checked again inside the transaction (429) |
| `src/lib/limits/review.ts` | `limits.reviewed_*` audit rows took the clock instead of the decision time. | Stamped with `ts: now` |
| `src/lib/recovery/claimant.ts` | Reading the ID card takes seconds; a sign-in that opened a wallet meanwhile still got its claim, which could move it off the new wallet. | `createClaim()` reads the sign-in again inside the transaction: 409 `has_wallet` or `claim_pending`, nothing bound, photo deleted |
| `src/lib/recovery/claim-view.ts`, `claims.ts` | `notifiedEmail` showed the account's current email, which approval changes. | Stored on the claim (`recovery_claims.notified_email`) |
| `src/lib/wallet/moves.ts` | `runDueWalletContributions()` moved `next_run_at` only after the loop (B4's bug, in the wallet's copy, U2). | Each run commits with its move of `next_run_at` |
| `src/app/api/v1/vaults/route.ts` | A failed opening deposit left an empty vault behind. | Vault, custom rule and opening deposit in one `tx()` |
| `src/lib/verification/review.ts` | An appeal re-holds the money; if it had left the vault, a reviewer's approval failed later. | `appeal()` refuses with 409 `appeal_funds_unavailable` |
| `src/lib/verification/stages/ai-read.ts` | Stripping every non-digit read "Rs. 99" as 0.99. | `parseAmount()` reads the first number |
| `src/lib/verification/classify.ts` | Purpose keywords matched inside other words ("lease" in "please", "rent" in "current"). | `startsWord()`: a keyword must start a word |
| Practice (`mobile/src/lib/api/demo`) | Four drifts from the server: the emergency Tier 2 order, payday, the ID gate on money moves, the emergency preview's `needsPin`. | Fixed and held by the contract vectors ([practice-mode.md](features/practice-mode.md)) |

The verification pipeline also moved to `vw-proof@1.5` the same day, from the [evaluation](evaluation/README.md): error-level analysis alone no longer declines a bill ([proof-verification.md](features/proof-verification.md)).

## Rules duplicated between server, web and phone (drift)

| ID | Where | Problem | Fix |
|---|---|---|---|
| D1 | `src/lib/kyc/ids.ts:38`, `src/components/identity/types.ts:31`, `mobile/src/lib/api/identity-ids.ts:56` | ID formats and Verhoeff exist three times, and web normalisation already differs. | One shared ID-rules module with one test suite. Partly (24 Nov 2026): one test suite for the server and phone copies, `tests/contract/vectors/id-numbers.json`; the web copy isn't covered |
| D2 | `mobile/src/lib/api/demo/wallet.ts:26-102`, `mobile/src/features/wallet/model.ts:62` vs `src/lib/wallet/plan.ts` | Payday, safe-to-spend and raise-lock maths re-implemented and drifting. | Server returns the figures the phone needs; share one pure module with the simulator. Partly (24 Nov 2026): the simulator's payday (now from the last 7 paydays, as the server), daily limit and safe-to-spend are pure functions held to `plan.ts` by `wallet-maths.json`; `features/wallet/model.ts` isn't covered |
| D3 | `src/lib/emergency.ts:19,88`, `mobile/src/lib/categories.ts:168-173`, `mobile/src/lib/api/demo/emergency.ts:34` | Tier 1 vaults (`health`) and Tier 2 order hard-coded in three places, in different orders. | Put tiers in compliance rules; return them from `GET /emergency`. Partly (24 Nov 2026): Practice now pays Tier 2 in the server's `TIER2_ORDER` (it sorted by balance), held by `emergency-tiers.json`; the tiers are still written in three places |
| D4 | `mobile/src/lib/api/demo/emergency.ts:54-65,112-121` vs `src/lib/emergency.ts:165-172` | Practice guardrails use different keys and statuses, and skip cooling-off (LSP). | Shared contract test run against both. The contract tests exist now (`tests/contract`), but the guardrails aren't in them yet |
| D5 | Receipt route `:18`, `src/app/emergency/page.tsx:579`, `mobile/src/features/emergency/copy.ts:177`, demo `emergency.ts:158` | "Can upload a receipt" statuses repeated four times. | One exported constant |
| D6 | `src/lib/samples.ts:10`, `mobile/src/lib/api/samples.ts:17` | Two sample-bill lists; the phone parses description text. | One list with an `outcome` field |
| D7 | `mobile/src/features/proof/stages.ts:124,132`, `verdict.ts:68` | The phone matches English check labels and reasons with regexes. | Server sends stable check and reason codes |
| D8 | `src/lib/invest/satellite.ts:401` → `mobile/src/features/invest/practice/parse.ts:85` | The phone parses a human sentence for Satellite progress; the response is untyped. | Return structured numbers and a typed contract |
| D9 | `mobile/src/lib/api/pay-sim.ts:35`, `src/app/invest/core/page.tsx:79,85,279,338` vs `src/lib/shared.ts:72` | Currency scale table copied; the web hard-codes `INR ? 80 : 1`. | Import the shared table |
| D10 | `src/components/vault-bits.tsx:17` vs `src/lib/vaults.ts:28` | The web's `VaultView` copy has drifted. | `import type` from the server module |
| D11 | `src/app/emergency/page.tsx:35-87` | The web redeclares emergency types. | `import type` from `@/lib/emergency` |
| D12 | `src/components/identity/config.ts:26` vs `src/lib/recovery/claims.ts:33` | `CLAIM_TTL_MS` copied. | One shared constant |
| D13 | `src/components/verification.tsx:198`, `src/app/admin/page.tsx:296`, `admin/overview/route.ts:68`, `src/lib/seed.ts:229` | "4 business hours" hard-coded instead of the per-market review time. | Read `rules.verification.reviewSlaHours` |
| D14 | `mobile/src/lib/build.ts`, `mobile/scripts/update.mjs`, `mobile/eas.json` | The list of Practice-only channels is written three times. | One JSON file read by both the app and the script |
| D15 | `mobile/src/lib/api/connection.ts:64` vs `ConnectionScreen.tsx:29`; `ConnectionScreen.tsx:22` vs `lib/auth/firebase.ts:65` | The server probe and address normalising are copied. | Export one of each |

## Files doing several jobs (SRP)

| ID | Where | Fix |
|---|---|---|
| S1 | `src/lib/verification/pipeline.ts:261` (`runPipeline`, ~530 lines) | One function per stage over a shared context. **Fixed** 24 Nov 2026: one file per stage in `src/lib/verification/stages/` over a `PipelineContext`, plus `persistence.ts`, `proofs.ts`, `review.ts` and `types.ts`; `pipeline.ts` only orchestrates and re-exports. Checked against the offline evaluation: identical decisions for every bill ([src/lib/verification/README.md](../src/lib/verification/README.md)) |
| S2 | `src/lib/limits.ts` (651 lines) | Split into `limits/{store,screen,assess,policy,review}.ts`. **Fixed** 24 Nov 2026: `src/lib/limits/` has 14 files (bounds, period, store, usage, change, screen, policy, assess, emergency-request, increase, expiry, review, view, and the `index.ts` barrel) ([src/lib/limits/README.md](../src/lib/limits/README.md)) |
| S3 | `src/lib/recovery/service.ts` (388 lines) | Split into find, claim and admin files; reset email sender behind an interface. **Fixed** 24 Nov 2026: `service.ts` is a barrel over `id-form.ts`, `find.ts`, `reset.ts`, `reset-email.ts`, `claim-checks.ts`, `claimant.ts`, `admin.ts` and `claim-view.ts` ([src/lib/recovery/README.md](../src/lib/recovery/README.md)). The reset email sender is its own file, not yet behind an interface |
| S4 | `src/lib/invest/satellite.ts:195` (`runPaperEngine`) | Split into position management, breakers and new setups |
| S5 | `src/lib/emergency.ts:122-219` (`planEmergency`) | Pure `evaluateGuardrails()` returning codes; format text at the edge |
| S6 | `mobile/src/lib/api/client.ts:60-179` | Split endpoints by area, as `wallet.ts` and `identity.ts` already are |
| S7 | `mobile/src/app/_layout.tsx:72-81` | Pure, tested `routeGuards(inputs)` |
| S8 | `mobile/src/features/account/settings/SettingsHome.tsx:58` | Extract `useExportData()` and its banner |
| S9 | `src/app/api/v1/admin/overview/route.ts`, `me/route.ts:94-98`, `invest/profile/route.ts:19` | Move metrics and `UPDATE users` into `src/lib` services |
| S10 | `src/app/api/v1/vaults/[id]/route.ts:52-63` | `updateVaultRule()` in `lib/vaults.ts`, sharing `normaliseRule()`, inside `tx()` |
| S11 | `src/app/api/v1/assistant/route.ts:14` | Move the prompt to `src/lib/assistant.ts` with a test |
| S12 | `src/lib/auth/session.ts:55` | Move the email sync to `identities.ts` |

## Hard-coded lists that should be registries (OCP)

| ID | Where | Fix |
|---|---|---|
| O1 | `src/lib/scheduler.ts:13` | Job registry: modules add `{ name, run }` |
| O2 | `src/lib/kyc/service.ts:24,35` | Providers register themselves; an unknown `KYC_PROVIDER` fails loudly |
| O3 | `src/lib/auth/identities.ts:26`, `kyc/store.ts:30`, `recovery/claims.ts:37`, `wallet/store.ts:19`, `custom-rules.ts:31` | One ordered migration registry with `PRAGMA user_version` (also prepares [plan 09](plans/09-postgres.md)) |
| O4 | `src/lib/region.ts:14`, `src/lib/timezones.ts:6`, `src/lib/compliance.ts` | Put time zones on the country record; derive both maps |
| O5 | `src/lib/wallet/config.ts:11`, `recovery/config.ts:5`, `auth/config.ts:45` | One `envFlag(name, default)` helper |
| O6 | Money routes (various) | A money-route policy map ([plan 03](plans/03-mpin.md)) |

## Direct dependencies that block testing or swapping (DIP and coupling)

| ID | Where | Fix |
|---|---|---|
| C1 | `src/lib/auth/session.ts:7,51` | Auth and recovery import each other; recovery should register a hook instead |
| C2 | `src/lib/auth/account.ts:33-45` | `closeAccount()` edits recovery tables; call `endClaimsForClosedAccount()` |
| C3 | `src/lib/verification/pipeline.ts:376` | Injectable bill reader, like `setIdExtractor()`. **Fixed** 24 Nov 2026: `setBillReader()` in `src/lib/verification/stages/ai-read.ts` (consent still comes first); used by the evaluation and `tests/verification-stages.test.ts` |
| C4 | `src/lib/invest/core.ts:25`, `satellite.ts:207` | Inject the price provider (also fixes B21). **Fixed** 24 Nov 2026: `PriceProvider` and `setPriceProvider()` in `src/lib/invest/prices.ts`; `market.ts` asks `priceProvider()`, and only `yahoo.ts` calls Yahoo |
| C5 | `mobile/src/components/ui/states.tsx:6`, `ProfileAvatar.tsx:4` | The UI kit shouldn't import `lib/api`; pass values as props |
| C6 | `mobile/src/features/account/layout.tsx:77,140` | `Page` and `StepScreen` are used by other features; move them into `components/ui` |
| C7 | `mobile/src/features/ai-consent/ask.ts:27`, `auth/settings.tsx:17`, `app/_layout.tsx:76`, `delete/finishDeletion.ts:25` | Use `isPracticeMode()` instead of `mode === "demo"` |
| C8 | `src/lib/vaults.ts:54-70` | `heldFor()` reads the emergency module's JSON; expose `heldByEmergency()` |
| C9 | `src/lib/kyc/service.ts:5`, `src/lib/recovery/id-form.ts` | `validateUpload()` lives in the pipeline; move it to its own file. Partly (24 Nov 2026): it lives in `src/lib/verification/proofs.ts` now, but KYC and recovery still import it through the pipeline's barrel |
| C10 | `src/lib/groq.ts:146` | `chatStream()` has no timeout or retry; share one request helper |
| C11 | `src/lib/api.ts:16`, `mobile/src/features/assistant/useChat.ts:64` | Every AI error is 503, so "busy" shows as "switched off"; map limits to 429 |
| C12 | `src/lib/auth/session.ts:80-81` | `no_wallet` is 401 in one mode and 404 in the other (LSP); use one status |

## Other duplication

| ID | Where | Fix |
|---|---|---|
| U1 | `admin/kyc/[id]/file/route.ts`, `admin/recovery/[id]/file/route.ts` | Shared `sendStoredImage(path)` |
| U2 | `src/lib/wallet/moves.ts:270` vs `src/lib/vaults.ts:240` | One contribution loop with a funding-source strategy |
| U3 | `src/lib/invest/satellite.ts:290` vs `backtest.ts:73` | One entry and exit function, so paper trading tests what the backtest validated |
| U4 | `src/lib/verification/proofs.ts` (`createProof()`) | `createProof()` repeats `validateUpload()` checks |
| U5 | `src/lib/wallet/config.ts:18` | `WalletError` duplicates `HttpError`'s code |
| U6 | `src/lib/limits/assess.ts` (`accountFacts()`) | Reuse `emergencyUsedThisMonth()` and `openFlagCount()` |
| U7 | `admin/overview/route.ts:103`, `audit/[userId]/route.ts:34` | Both re-hash the whole audit log every 20 seconds; verify incrementally |
| U8 | `mobile/src/features/account/onboarding/TextField.tsx:14` vs `components/ui/TextField.tsx:6`; `account/layout.tsx:57`; biometric labels in four files; `initials()` twice | Merge into the UI kit |

## Testing gaps

| ID | Gap | Fix |
|---|---|---|
| T1 | The phone app has no test runner or tests. | Add `jest-expo`. Start with pure functions: `demo/proofs.ts` `outcomeFor`, `demo/persist.ts`, `features/tab-swipe/model.ts`, `pin-guard.ts` `isWeakPin`, wallet maths. **Fixed** 24 Nov 2026: `cd mobile && npm test` (Jest with jest-expo), tests in `__tests__` folders next to the code: the MPIN policy and errors, protection, Practice devices, invest and save, `lib/invest.ts`, API errors, wallet maths and the contract tests. Still untested: `outcomeFor`, `tab-swipe/model.ts`, `pin-guard.ts` |
| T2 | No tests for identity parsers on web and phone, or for binding a login to one server (`mobile/src/lib/auth/firebase.ts:244`). | Unit tests once T1 exists (phone) and in vitest (web). Partly (24 Nov 2026): the phone's ID parser is held to the server's by `id-numbers.json`; the web's parser and the login binding are still untested |
| T3 | Nothing tests `satellite.ts`, `executeSip()`'s split, or the phone's wallet, pay or invest code. | Add server tests now, phone tests after T1. Partly (24 Nov 2026): `tests/invest-money.test.ts` (opt-in, the paper run, SIP set-up) and `tests/invest-strategies.test.ts` (backtests per customer) on the server; Practice invest and wallet maths on the phone. Still untested: the paper engine's trades, `executeSip()`'s split, the phone's pay code |
| T4 | `vitest.config.mts:11` says the phone has its own test setup; it doesn't. | Fix the comment, or do T1. **Fixed** 24 Nov 2026 by T1: the comment is true now |
| T5 | `raiseFlag()` and `resolveFlag()` read the clock directly. | Accept a timestamp |

## Naming and small clean-ups

| ID | Where | Fix |
|---|---|---|
| N1 | `mobile/src/features/invest/practice/*` | "Practice" means both the Satellite paper-trading view and the simulator; rename the view's code to `paper` |
| N2 | Emergency vs checkout PIN steps; `mobile/DESIGN.md:126` | "Demo PIN" vs "Practice PIN", and DESIGN.md names a `DEMO_PIN` that doesn't exist |
| N3 | `mobile/src/lib/storage.ts:174` and others | `KEYS.onboardedLocally` is unused, and many `vw.*` keys are declared in their own files; list them all in `KEYS` |
| N4 | `mobile/src/data/fixtures/` | `emergency-preview.json` and `invest-profile.json` are never used |
| N5 | `mobile/src/features/account/layout.tsx:17`, `lib/auth/device-pin.ts` header | Comments describe things that are no longer true |
| N6 | `src/lib/wallet/README.md:62-67` | The removal table misses lines in `seed.ts`, `dashboard/route.ts` and `engagement.ts` |
| N7 | `mobile/src/components/ui/keypads.tsx:142` | Font written as a string; use `fonts.bodySemi` |

## Suggested order for clean-up

1. ~~Small bug fixes: B2, B4, B5, B10, B11, B12, B14, B18.~~ **Done 22 Nov 2026**, each with a test.
2. **With plan 03:** B1, B3, O6.
3. **With plan 05:** B6, B7, B8, B13.
4. **Before adding phone features:** ~~T1 (phone test runner)~~ (done 24 Nov 2026), then C7, D14, C5 and C6.
5. **Drift, worst first:** D1 (ID rules), D2 (wallet maths), D3 and D4 (emergency), D7 (proof codes). The contract tests now catch D1 to D3 drifting further; add a vector file when two copies of a rule meet ([tests/contract/README.md](../tests/contract/README.md)).
6. ~~**Big splits when touching those files anyway:** S1, S2, S3.~~ **Done 24 Nov 2026.** Next in size: S4 (`satellite.ts`, 513 lines) and S5 (`emergency.ts`).
