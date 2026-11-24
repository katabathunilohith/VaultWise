# Changelog: server and web app

What changed in the server (`src/`) and web app. The phone app has its own log in [mobile/CHANGELOG.md](mobile/CHANGELOG.md). Add notes under **Unreleased** as you go; see the [development process](docs/process/development-process.md#6-release).

## Unreleased

### Fixed

- **Overdue emergency receipts count toward the risk score again.** The scheduler renames a late receipt `overdue`, and the score had only counted `requested`, so a late receipt scored 0. (B2)
- **Scheduled auto-saves can't be paid twice.** Each run now commits together with the next run date, so an unexpected error part-way through no longer replays paid runs on the next tick. (B4)
- **Vault charts show real balances** for vaults with more than 100 postings, instead of starting from 0. (B5)
- **A partial risk questionnaire gets a 400** (`missing_answer`) instead of a server error. (B10)
- **Closing a fraud flag is safe:** unknown or already-closed flags are refused, and the audit row records whose flag it was. (B11)
- **`?limit=` is validated** on `/activity` and `/audit/[userId]`: anything but a whole number is a 400 (`bad_limit`) rather than `NaN`. (B12)
- **One KYC level rule:** a sign-up waiting for an ID check is level 1 everywhere. Existing level-0 rows are corrected on start-up. (B14)
- **One appeal per check:** a second appeal after a reviewer's decision is refused (`already_appealed`), matching the phone. (B18)

### Added

- **MPIN checked by the server** ([plan 03](docs/plans/03-mpin.md)). Every money move needs the 6-digit MPIN in the request (`pin`), checked before any money, upload or AI call. A PIN policy (no repeats, runs, common PINs or date of birth), and a lock after 5 wrong tries (1 minute, then 5 minutes, 30 minutes, 24 hours). `POST /mpin` to change it; a reset with a texted code. Web MPIN fields on every money form. Rollback switch `MPIN_ENFORCED`.
- **Registered devices, alerts and texted codes** ([plan 06](docs/plans/06-devices-alerts-otp.md)). Each phone (and, with sign-in on, each browser) is a device. A new device can only send small amounts (USD 50 equivalent per move, ₹4,000) until it is trusted with a texted code and the MPIN, or 24 hours pass. Devices can be signed out from another device. Alerts for money moves, new devices, PIN and phone changes, in the app and as push notifications. Texted codes in test mode or through Twilio. Web "Devices and alerts" card.
- **India ID check by steps** ([plan 07](docs/plans/07-onboarding-checks.md)), behind `KYC_FLOW=steps`: PAN, Aadhaar through DigiLocker, and a bank account by reverse penny drop. A test provider for development, and a Setu adapter for the sandbox. Mismatches go to the existing reviewer queue.
- **Ready to run online** ([plan 05](docs/plans/05-server-online.md)): a start-up guard that refuses a production server without sign-in, security headers and a content security policy, rate limits per person and per address (and 20 uploads an hour), generic 500s with an `errorId`, proxy settings so a visitor can't fake their address, public privacy, terms and delete-account pages, and `deploy/` with the Caddy, systemd, backup, restore and update files for one AWS Lightsail server.
- AI consent: the `x-ai-consent` header and `proofs.ai_allowed`, so a "no" keeps data away from the AI provider. Web consent dialog and an "AI reading" switch in Settings.
- `npm run test:ai` for the live AI check.
- Documentation in [docs/](docs/README.md): features, references, the development process, the module guide, implementation plans 01 to 09 and the binding contracts.

### Changed

- **A missing AI answer now means no.** Requests without `x-ai-consent: yes` are never sent to the AI; the assistant answers 403 `ai_consent_required`.
- Next.js 16.4.6 and zod 4.6.7 (security advisories).

### Security

Four independent reviews of this round (server money paths, server ID checks and hardening, phone money flows, phone protection). Fixed before release:

- **A stolen sign-in could replace the MPIN** by adding its own phone number and resetting. Adding or changing the phone number now needs the MPIN, and an MPIN reset is refused for 72 hours after a phone change. Only the sign-up device is trusted on first use.
- **Signing a device out now keeps it out:** a sign-in older than the last sign-out must sign in again, and a device first seen after a sign-out must be trusted with a code.
- **The ID check by steps couldn't mix people:** the account name is held once a step has compared it, and the final check compares every document name with it.
- Other accounts can no longer block someone's texted codes; new devices are capped per hour; the Setu sandbox is refused on a production server; a duplicate PAN no longer tells the customer it belongs to another account; DigiLocker error text from the link is no longer shown; deploy scripts run by root are root-owned copies; `proofs.ai_allowed` defaults to no.

Item numbers refer to the [maintainability review](docs/maintainability.md).
