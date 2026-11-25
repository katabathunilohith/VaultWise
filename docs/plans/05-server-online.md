# 05. Server online

**Status:** server code, web pages and deploy scripts built (22 November 2026); online at [vaultwise.online](https://vaultwise.online) since November 2026, on AWS EC2 instead of Lightsail (see *As built* below); the phone side is recorded separately · **Owner:** Shaik (accounts), Claude (code and scripts) · **Size:** L

## Goal

Run the real server and its SQLite database on the internet, so testers get real accounts that persist across devices, you can review bills in the admin console, and the real AI check runs (with permission). Money stays pretend, because the bank is simulated.

## Scope

- **In:** hosting, HTTPS, backups, security hardening, sign-in required, a tester build that uses the server, privacy policy and terms, a web page for deleting an account.
- **Out:** real money and real ID checks (they need licensed partners), and PostgreSQL ([plan 09](09-postgres.md)).

## Design

### Hosting

| Piece | Choice |
|---|---|
| Server | AWS in Mumbai (`ap-south-1`), Ubuntu, 2 GB. Planned on Lightsail; built on an EC2 `t3.small` with an Elastic IP. |
| Runtime | Node 24 (needed for `node:sqlite`), `npm run build`, then `npm start` under systemd |
| HTTPS | Caddy in front, with a free certificate for your domain |
| Data | `VAULTWISE_DATA_DIR=/var/lib/vaultwise` on the server's disk, never in the app folder |
| Backups | Daily snapshots of the whole disk (EBS snapshots from an EC2 Lifecycle Manager policy), plus a nightly `sqlite3 .backup` copy to a second place (S3 or a downloaded copy) |
| Secrets | `.env.local` on the server only: `FIREBASE_*`, `IDENTITY_SECRET`, `ADMIN_EMAILS`, `GROQ_API_KEY` |
| Monitoring | A free uptime check on `/api/v1/region`, plus server logs |

**As built (November 2026).** The server runs on an EC2 `t3.small` in Mumbai instead of Lightsail, with an Elastic IP in place of Lightsail's static IP and a security group in place of its firewall. Everything else is as planned: Ubuntu, Node 24 under systemd, Caddy and `/var/lib/vaultwise`. The domain is `vaultwise.online`, with its DNS at Hostinger. [deploy/README.md](../../deploy/README.md) is written for EC2.

### Hardening (security gaps 1, 4, 5, 12 and 16)

- **Refuse to start in production without sign-in:** `NODE_ENV=production` without `FIREBASE_PROJECT_ID` stops the server with a clear message. This removes the open-reset and open-admin risk.
- **Generic errors:** unexpected errors return "Something went wrong" with an error id, and the details go to the log only (`src/lib/api.ts`).
- **Consent:** the web app asks before AI use and sends `x-ai-consent`. The server then treats a missing header as "no", and the assistant route checks it too.
- **Security headers** through Next.js config in production: HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a Content Security Policy for the web pages.
- **Rate limits:** a general per-person and per-IP limit on every route, with tighter limits on sign-in, MPIN and uploads. `TRUST_PROXY_HOPS=1` behind Caddy, so the IP comes from Caddy.
- **Encrypted disk:** the EC2 volume (EBS) is created encrypted. Check and record this.

### Phone and web

- A new `tester-live` build profile in `eas.json`: channel `tester-live`, `EXPO_PUBLIC_API_URL=https://<your domain>`, sign-in on, ID check off (`KYC_ENABLED` tied to the build), Practice off.
- Write the privacy policy and terms of use, replacing the in-app placeholders, and serve them at `/privacy` and `/terms`.
- `/delete-account` on the web lets someone sign in and close their account (Google Play requires this).

## Changes

| File | Change |
|---|---|
| `deploy/` (new) | `Caddyfile`, `vaultwise.service` (systemd), `backup.sh`, `README.md` with step-by-step setup |
| `src/lib/auth/config.ts` | Production start-up guard |
| `src/lib/api.ts` | Generic 500s with an error id |
| `src/lib/ai-consent.ts`, `src/app/api/v1/assistant/route.ts`, web AI screens | Consent everywhere |
| `next.config.ts` | Production security headers |
| `src/lib/rate-limit.ts` (new) | Shared limiter, reusing the recovery limiter's design |
| `src/app/{privacy,terms,delete-account}/` | **New** pages |
| `mobile/eas.json`, `mobile/src/lib/build.ts` | `tester-live` profile |
| `mobile/src/features/account/settings/AboutScreen.tsx` | Real policy text, or links to it |

## Tests

- Existing suites, plus tests for the start-up guard, generic errors, consent defaulting to "no", and rate limits.
- On the live server: `curl -I` shows the headers; `POST /api/v1/reset` without sign-in is refused; restoring a backup into a scratch folder works.
- A full pass on the `tester-live` build: sign up, make a vault, send a bill, and see it in the admin console.

## Acceptance criteria

- [ ] The site is reachable over HTTPS on your domain.
- [ ] The server won't start in production without sign-in configured.
- [ ] A backup can be restored.
- [ ] Testers on the `tester-live` build keep their data across phones.
- [ ] The privacy policy, terms and account-deletion page are live.

## Risks and rollback

- **Cost:** about $12 a month at US prices; check Mumbai pricing and AWS Free plan terms.
- **Real personal data:** emails and bill photos. Plans 03 and 04 must be done first, and the privacy policy must be accurate.
- **Rollback:** point the tester build back at Practice (an over-the-air update) and stop the server; the data stays in backups.

## Who does what

- **You:** create the AWS account and the EC2 server, buy the domain and point it at the server, create the Firebase project and turn on email sign-in, and fill `.env.local` on the server.
- **Claude:** everything in `deploy/`, the code changes, and a step-by-step setup guide.

## What was built (server)

Built 22 November 2026. The feature doc is [features/running-online.md](../features/running-online.md); the consent change is in [features/ai.md](../features/ai.md); the step-by-step setup is [deploy/README.md](../../deploy/README.md). Differences from the contract are in [contracts.md](contracts.md), "Deviations as built".

### Files

| File | What it does |
|---|---|
| `deploy/README.md`, `Caddyfile`, `vaultwise.service`, `update.sh`, `backup.sh`, `restore.md` | **New**: setup guide, HTTPS proxy, systemd unit, build-and-restart, nightly backup, restore steps. On the server the settings live in `/etc/vaultwise.env`, not `.env.local`. |
| `src/instrumentation.ts`, `src/instrumentation-node.ts` | **New**: the start-up hook that stops a production server without sign-in |
| `src/lib/auth/config.ts` | `productionStartupProblem()`, `productionStartupWarnings()` |
| `next.config.ts` | Security headers and a Content Security Policy in production; `poweredByHeader: false`; development CORS gains `X-Device-Platform` and `X-App-Version` |
| `src/lib/api.ts` | Generic 500 with `errorId`; extra error fields and `Retry-After` in the JSON answer; the general rate limit per address (`handle()`) and per person (`customer()`, `admin()`) |
| `src/lib/rate-limit.ts` | **New**: the shared fixed-window limiter in SQLite, `limitUploads()` |
| `src/lib/auth/context.ts` | `clientIp()` believes proxy headers only with `TRUST_PROXY_HOPS` or the new `TRUST_PROXY_HEADER` |
| Upload routes: `vaults/[id]/proofs`, `emergency/[id]/receipt`, `kyc`, `limits/emergency` | `limitUploads()` (20 per person per hour) |
| `src/lib/ai-consent.ts`, `src/app/api/v1/assistant/route.ts` | Missing header means no; the assistant answers 403 `ai_consent_required` |
| `src/components/ai-consent.tsx`, `src/lib/client.ts`, `src/app/layout.tsx`, web upload, limit and assistant screens | **New** web consent question, header on every request, switch on the assistant page and in Settings |
| `src/app/{privacy,terms,delete-account}/page.tsx`, `src/components/legal/*`, `src/components/shell.tsx` | **New** public policy pages, open without sign-in |
| `.env.example` | `TRUST_PROXY_HOPS`, `TRUST_PROXY_HEADER`, `RATE_LIMIT_PER_MINUTE` explained |

### Decisions

- **Exit, don't throw.** The guard calls `process.exit(1)` so systemd sees a failed start; the unit stops retrying after 5 failures in 2 minutes. `ALLOW_PROTOTYPE_IN_PRODUCTION=true` is the deliberate escape for local checks and the e2e suite.
- **CSP without nonces,** because most pages are static; `'unsafe-inline'` scripts are allowed for Next's bootstrap and the theme script, `'unsafe-eval'` is not.
- **Proxy trust is opt-in.** Without `TRUST_PROXY_HOPS` or `TRUST_PROXY_HEADER` no address header is believed and IP limits are skipped, so a client can't choose its own key. Caddy sets `X-Real-IP` and drops `Cf-Connecting-Ip`.
- **Counts in SQLite, keys hashed.** Limits survive restarts and never store an IP or user id in clear. One server process only.
- **Uploads: 20 an hour,** shared across the four photo routes, counted before the file is read. MPIN guessing is limited by the MPIN lock, OTP by its own limit.
- **Consent on the web** is one answer per browser in localStorage, sent on every request.

### Tests

`tests/server-hardening.test.ts` (guard, headers, generic errors, `Retry-After`, proxy trust, per-address, per-person and upload limits), `tests/rate-limit.test.ts`, `tests/ai-consent.test.ts`, and `scripts/e2e.mjs` (runs the built server, checks the 429 and the assistant refusal).

### Acceptance criteria, server side

| Criterion | Server |
|---|---|
| The site is reachable over HTTPS on your domain | Ready: Caddyfile and guide. Needs the owner's server and domain. |
| The server won't start in production without sign-in configured | Done |
| A backup can be restored | Ready: `backup.sh` and `restore.md`. Needs a test restore on the real server. |
| Testers on the `tester-live` build keep their data across phones | Server side ready (sign-in, one database); the build is phone-side |
| The privacy policy, terms and account-deletion page are live | Built at `/privacy`, `/terms`, `/delete-account`; live once deployed |

### Left for the owner

- Everything marked **YOU ONLY** in [deploy/README.md](../../deploy/README.md): the AWS account and EC2 server, Elastic IP and security group, the domain, the Firebase project, `/etc/vaultwise.env` (with `TRUST_PROXY_HOPS=1`) (all done), then daily snapshots, recording that the disk is encrypted, the S3 copy or weekly download, and the uptime check.
- `CONTACT_EMAIL` in `src/components/legal/config.ts`: done, it's the team's inbox.
- For plans 06 and 07 on the live server, also choose `OTP_MODE` (and Twilio keys, or `OTP_TEST_ALLOWED=true` for a demo) and, if the KYC steps flow is used, `KYC_DIGILOCKER_REDIRECT_URL` and, with Setu, `SETU_BASE_URL` (required in production). All are in `.env.example`; `OTP_MODE` is also in the guide's settings table, the KYC ones aren't.
- Still open from the [maintainability review](../maintainability.md): B13 (a closed account's login can sign up again).

### Review findings and fixes

The security review of 22 November 2026 ([security.md](../security.md#security-review-2026-11-22)) found these in plan 05's work; all are fixed:

- **Root ran deploy scripts from the app's folder (High).** `update.sh` was run as `sudo bash /opt/vaultwise/deploy/update.sh` and cron ran `/opt/vaultwise/deploy/backup.sh`, but `/opt/vaultwise` belongs to the `vaultwise` user and `npm ci` runs package install scripts as that user, so a bad package could get root. Both scripts are now installed root:root 0755 as `/usr/local/sbin/vaultwise-update` and `/usr/local/sbin/vaultwise-backup`, cron runs the installed copy, and `update.sh` never installs itself: it prints the difference from the installed copy and the `sudo install` command. The S3 bucket is a setting in the cron file (`BACKUP_S3_URI`), so no copy of `backup.sh` is edited. [deploy/README.md](../../deploy/README.md) step 15 covers servers set up the old way; `tests/deploy.test.ts` checks the files.
- **The per-person rate limit missed `GET /me` and counted a recovery claimant against the wallet (Medium).** It moved from `customer()` into `session()` (`src/lib/auth/session.ts`): it covers `GET /me`, runs before the device is recorded, and counts a claimant under its own uid.
- **Refused requests used up the upload limit (Low).** `POST /kyc` refuses a steps-flow account before counting; `POST /limits/emergency` counts only when a file is sent; `POST /vaults/{id}/proofs` and `POST /emergency/{id}/receipt` check `assertUploadsLeft()` first and count with `limitUploads()` once the withdrawal or request is known to take the file.
- **`proofs.ai_allowed` defaulted to yes (Low).** The column now defaults to 0, `createProof()` requires `aiAllowed`, and only `true` allows AI ([features/ai.md](../features/ai.md)).
- **Setu's sandbox could run on a production server (Medium).** See [plan 07](07-onboarding-checks.md#review-findings-and-fixes); `productionStartupWarnings()` now also warns about a missing or sandbox `SETU_BASE_URL`.
