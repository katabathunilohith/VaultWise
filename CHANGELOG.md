# Changelog: server and web app

What changed in the server (`src/`) and web app. The phone app has its own log in [mobile/CHANGELOG.md](mobile/CHANGELOG.md). Add notes under **Unreleased** as you go; see the [development process](docs/process/development-process.md#6-release).

## Unreleased

### Added

- **Payout planner (web).** Enter the cash you have, your usual daily costs and the bills due, and see whether it lasts until your next allowance, stipend or pay, and what changes if that money arrives late. It shows the first bill that can't be covered, keeps saved plans, and compares a plan with what actually arrived. A later plan can test the longest delay from up to six of your own checked-in paydays (capped at 14 days in a scenario). The calculation uses calendar dates and whole paise, with no bank connection and no AI calls.
- Account-scoped SQLite storage (`payout_plans`) with validated, retry-safe save and check-in routes (`/api/v1/payout-plans`). Saved plans are included in the account export and deleted when the account closes; the privacy notice, API and data-model references describe them.
- Regression tests for the payday boundary, the first shortfall, validation, account isolation, duplicate requests and actual-versus-expected results.

### Changed

- **Online at [vaultwise.online](https://vaultwise.online)**, on one AWS EC2 server in Mumbai (Ubuntu, Caddy, systemd) instead of the planned Lightsail. The deploy and restore guides ([deploy/README.md](deploy/README.md), [deploy/restore.md](deploy/restore.md)) now describe EC2: an Elastic IP, a security group, an encrypted EBS disk and daily EBS snapshots, plus fixes for the problems met while setting it up.
- The README shows the live link and where each part runs.

## 0.2.0 (2026-11-24)

Tag `v0.2.0` on the commit that releases it. Roadmap steps 1 to 8 ([docs/plans/roadmap.md](docs/plans/roadmap.md)), the security review and the external review fixes.

### Fixed

- **Approving a limit request no longer undoes a later change.** The increase is applied on top of the limits as they are at approval, the monthly number of emergency requests is re-checked inside the transaction, and two overlapping increases now expire correctly.
- **Wallet auto-saves can't be paid twice** (each run commits with its next date), and **opening a vault with a first deposit is all or nothing**.
- **An appeal is refused** (`appeal_funds_unavailable`) when the money has left the vault since the decline, instead of letting the balance go negative.
- **A recovery claim can't orphan a new wallet** if the same sign-in onboards while the ID is being read; the claim shows the email address that was actually notified.
- **Fewer genuine bills declined (`vw-proof@1.5`):** error-level analysis alone no longer declines a bill (it needs a backing signal, and an inconclusive reading counts as no evidence), a customer who asked for a person is never declined on image forensics alone, and editing software plus a capture-date gap now add up. Offline, false declines went from 3 of 19 to 0 with no bad bill newly approved.
- **Bill amounts like "Rs. 99" are read correctly**, and purpose keywords only match at the start of a word ("lease" no longer matches inside "Please").
- **Backtest strategies are per customer**, so one customer's backtest can't overwrite another's. (B9)
- Tests no longer reach the network: market prices come from an injectable provider with a fake in tests (B21), and the AI test renders sample bills dated relative to today (B20).
- **Overdue emergency receipts count toward the risk score again.** The scheduler renames a late receipt `overdue`, and the score had only counted `requested`, so a late receipt scored 0. (B2)
- **Scheduled auto-saves can't be paid twice.** Each run now commits together with the next run date, so an unexpected error part-way through no longer replays paid runs on the next tick. (B4)
- **Vault charts show real balances** for vaults with more than 100 postings, instead of starting from 0. (B5)
- **A partial risk questionnaire gets a 400** (`missing_answer`) instead of a server error. (B10)
- **Closing a fraud flag is safe:** unknown or already-closed flags are refused, and the audit row records whose flag it was. (B11)
- **`?limit=` is validated** on `/activity` and `/audit/[userId]`: anything but a whole number is a 400 (`bad_limit`) rather than `NaN`. (B12)
- **One KYC level rule:** a sign-up waiting for an ID check is level 1 everywhere. Existing level-0 rows are corrected on start-up. (B14)
- **One appeal per check:** a second appeal after a reviewer's decision is refused (`already_appealed`), matching the phone. (B18)

### Added

- **MPIN for investing plans:** setting up a SIP or raising it (`invest_sip`) and opting into Satellite (`satellite_opt_in`) now need the MPIN, like a one-off buy.
- **One ID-check rule for money in:** every route that brings money in from the bank (wallet top-up, vault deposits including a new vault's first deposit, simulate, sweep) takes its ID gate from the money-routes map; vault deposits were ungated before.
- **Audit anchors:** the head of the hash-chained audit log is written daily (and at start-up) to a file outside the database and to the journal, copied by the nightly backup; `npm run audit:verify` checks the chain against every anchor.
- **Verification evaluation:** `npm run eval:verification` generates a labelled set of genuine, edited, duplicate, wrong-purpose and stale bills and measures approve/decline/review and false-decline rates ([docs/evaluation](docs/evaluation/README.md)).
- **Contract tests** (`tests/contract`): shared rule tables that the server and the phone both test against.
- **CI** on GitHub Actions (type check, lint, tests and build for the server and the phone), `engines` (Node 22.18 or later) and `.nvmrc`.
- The verification pipeline, personal limits and account recovery are split into small single-purpose files, with no behaviour change.

- **MPIN checked by the server** ([plan 03](docs/plans/03-mpin.md)). Every money move needs the 6-digit MPIN in the request (`pin`), checked before any money, upload or AI call. A PIN policy (no repeats, runs, common PINs or date of birth), and a lock after 5 wrong tries (1 minute, then 5 minutes, 30 minutes, 24 hours). `POST /mpin` to change it; a reset with a texted code. Web MPIN fields on every money form. Rollback switch `MPIN_ENFORCED`.
- **Registered devices, alerts and texted codes** ([plan 06](docs/plans/06-devices-alerts-otp.md)). Each phone (and, with sign-in on, each browser) is a device. A new device can only send small amounts (USD 50 equivalent per move, ₹4,000) until it is trusted with a texted code and the MPIN, or 24 hours pass. Devices can be signed out from another device. Alerts for money moves, new devices, PIN and phone changes, in the app and as push notifications. Texted codes in test mode or through Twilio. Web "Devices and alerts" card.
- **India ID check by steps** ([plan 07](docs/plans/07-onboarding-checks.md)), behind `KYC_FLOW=steps`: PAN, Aadhaar through DigiLocker, and a bank account by reverse penny drop. A test provider for development, and a Setu adapter for the sandbox. Mismatches go to the existing reviewer queue.
- **Ready to run online** ([plan 05](docs/plans/05-server-online.md)): a start-up guard that refuses a production server without sign-in, security headers and a content security policy, rate limits per person and per address (and 20 uploads an hour), generic 500s with an `errorId`, proxy settings so a visitor can't fake their address, public privacy, terms and delete-account pages, and `deploy/` with the Caddy, systemd, backup, restore and update files for one AWS Lightsail server.
- AI consent: the `x-ai-consent` header and `proofs.ai_allowed`, so a "no" keeps data away from the AI provider. Web consent dialog and an "AI reading" switch in Settings.
- `npm run test:ai` for the live AI check.
- Documentation in [docs/](docs/README.md): features, references, the development process, the module guide, implementation plans 01 to 09 and the binding contracts.

### Changed

- The package is named `vaultwise` (was `capstone`).
- **A missing AI answer now means no.** Requests without `x-ai-consent: yes` are never sent to the AI; the assistant answers 403 `ai_consent_required`.
- Next.js 16.4.6 and zod 4.6.7 (security advisories).

### Security

Four independent reviews of this round (server money paths, server ID checks and hardening, phone money flows, phone protection). Fixed before release:

- **A stolen sign-in could replace the MPIN** by adding its own phone number and resetting. Adding or changing the phone number now needs the MPIN, and an MPIN reset is refused for 72 hours after a phone change. Only the sign-up device is trusted on first use.
- **Signing a device out now keeps it out:** a sign-in older than the last sign-out must sign in again, and a device first seen after a sign-out must be trusted with a code.
- **The ID check by steps couldn't mix people:** the account name is held once a step has compared it, and the final check compares every document name with it.
- Other accounts can no longer block someone's texted codes; new devices are capped per hour; the Setu sandbox is refused on a production server; a duplicate PAN no longer tells the customer it belongs to another account; DigiLocker error text from the link is no longer shown; deploy scripts run by root are root-owned copies; `proofs.ai_allowed` defaults to no.

Item numbers refer to the [maintainability review](docs/maintainability.md).

## 0.1.0 (2026-11-22)

Tag `v0.1.0` on commit `012a9fc`. The first tester release: the prototype the phone app's 0.1.0 talks to.

- Purpose vaults on a double-entry, append-only ledger with a hash-chained audit log; contribution rules (fixed, % of income, round-ups) and joint vaults.
- Six-stage proof verification (forensics, AI read, classification, tamper and reuse checks, decision), human review queue and appeals.
- Tiered emergency access with guardrails, risk scoring and receipts afterwards.
- Wallet with a daily limit, personal withdrawal limits with AI-assessed emergency exceptions, and custom vault rules.
- Core/Satellite investing with live market data, SIPs, the price-action engine and walk-forward backtests.
- Firebase sign-in, the ID check (AI + a person) and account recovery, all off until configured.
- 28 countries on 8 market rulebooks; the operations console.
