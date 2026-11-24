# Configuration reference

Every setting that changes how Vaultwise behaves: environment variables, switches in the code, EAS build profiles and `app.json`.
As of commit `012a9fc` plus the server work for plans 03, 05, 06 and 07 (2026-11-22) and the external review fixes (2026-11-24).

## Where settings live

| File | Used by | In git? |
|---|---|---|
| [`.env.example`](../../.env.example) | Template for the server and web app | Yes |
| `.env.local` (repo root) | The server and web app. Next.js loads it. Restart `npm run dev` after a change. | No (`.gitignore` has `.env*` except `.env.example`) |
| [`mobile/.env.example`](../../mobile/.env.example) | Template for the phone app | Yes |
| `mobile/.env.local` | The phone app. Expo inlines `EXPO_PUBLIC_*` values into the bundle. Restart `npx expo start` (add `--clear` if a value doesn't change). | No |
| [`mobile/eas.json`](../../mobile/eas.json) | EAS cloud builds and over-the-air updates | Yes |
| [`mobile/app.json`](../../mobile/app.json) | Expo app config | Yes |
| [`.nvmrc`](../../.nvmrc), [`package.json`](../../package.json) `engines` | The Node version: `.nvmrc` says `24` (CI's `setup-node` reads it for both jobs); `engines.node` is `>=22.18.0`, the oldest Node with the built-in `node:sqlite` and the type stripping `npm run audit:verify` needs | Yes |

A blank value means "not set". Without any settings, the server runs in prototype mode with no AI.

`NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` values are built into the browser and phone bundles, so anyone can read them. Never put a secret in them.

## Environment variables

### Server (`src/`, `next.config.ts`)

| Variable | Read in | Default | Effect |
|---|---|---|---|
| `GROQ_API_KEY` | [`src/lib/groq.ts`](../../src/lib/groq.ts) (`aiEnabled()`, request header) | unset | Turns AI on: bill reading, ID reading, the assistant, the weekly insight and the emergency-limit assessor. Unset: every bill and ID goes to a person, `POST /assistant` answers 503, the insight uses rule-based text and limit requests use rules only. |
| `GROQ_VISION_MODEL` | `src/lib/groq.ts` | `qwen/qwen3.8-27b` | Model for reading images. Read once when the module loads. |
| `GROQ_TEXT_MODEL` | `src/lib/groq.ts` | `openai/gpt-oss-120b` | Model for text (assistant, insight, assessments). Read once when the module loads. |
| `FIREBASE_PROJECT_ID` | [`src/lib/auth/config.ts`](../../src/lib/auth/config.ts) (`authMode()`, `productionStartupProblem()`), [`src/lib/auth/verify.ts`](../../src/lib/auth/verify.ts) | unset | **The sign-in switch.** Unset: prototype mode (no sign-in, the first user is the customer, admin routes open). Set: firebase mode (every request needs a Firebase ID token; issuer and audience are checked against this project). Read on every call. With `NODE_ENV=production` the server **refuses to start** without it, unless `ALLOW_PROTOTYPE_IN_PRODUCTION=true`. |
| `ALLOW_PROTOTYPE_IN_PRODUCTION` | `src/lib/auth/config.ts` (`productionStartupProblem()`) | unset | `true` (trimmed, any case) lets a production server start without `FIREBASE_PROJECT_ID`, as the open prototype. For a local `npm start` check and the e2e suite only. A warning is still logged. |
| `FIREBASE_WEB_API_KEY` | [`src/lib/recovery/reset-email.ts`](../../src/lib/recovery/reset-email.ts) (`sendPasswordReset()`), `src/lib/auth/config.ts` (start-up warning) | unset | Lets the server send password-reset emails through the Firebase Identity Toolkit (`POST /recovery/reset`). Unset: no email is sent and a warning is logged once. The answer to the client is the same either way. |
| `ADMIN_EMAILS` | `src/lib/auth/config.ts` (`adminEmails()`) | empty | Comma-separated list of emails allowed on admin routes in firebase mode. Trimmed and lowercased. The signed-in email must also be verified in Firebase. No effect in prototype mode. |
| `KYC_ENFORCED` | `src/lib/auth/config.ts` (`kycEnforced()`, `kycGateOn()`) | on in firebase mode, off in prototype mode | **New sign-ups:** start KYC `pending` when enforced, else `verified`. Firebase mode enforces unless the value is `false`; prototype mode enforces only if it is `true`. **The ID gate** (`kyc: true` routes, and money actions marked `kyc: true` in `src/lib/money-routes.ts`: money out, investing, and money in from the linked bank): on unless the value is exactly `false` (trimmed, any case). So `false` also lets accounts that started `pending` move money. |
| `KYC_PROVIDER` | [`src/lib/kyc/service.ts`](../../src/lib/kyc/service.ts) | `practice` | Which ID checker runs. `practice` = AI plus a person. `external` = the slot for a licensed partner. Unknown values fall back to `practice`. |
| `IDENTITY_SECRET` | [`src/lib/kyc/secret.ts`](../../src/lib/kyc/secret.ts), [`src/lib/otp/service.ts`](../../src/lib/otp/service.ts) | unset | HMAC key for matching ID numbers (photo check and the PAN step) without storing them, for signing recovery `findToken`s, and for hashing texted codes. Unset in prototype mode (not production): a fixed development key is used and a warning is logged. Unset in firebase mode or when `NODE_ENV=production`: ID routes answer `500 server_config` (texted codes fall back to a fixed key). Changing it breaks matching for every ID saved before. |
| `MPIN_ENFORCED` | [`src/lib/mpin/config.ts`](../../src/lib/mpin/config.ts) (`mpinEnforced()`) | on | Anything but `false` (trimmed, any case): every money action needs the right MPIN, wrong tries lock money moves, and a new PIN must pass the 6-digit policy. `false` is rollback mode: money moves skip the check (a PIN that is sent is still checked and counted, except during a lock, when it isn't checked at all) and aren't locked; the checks that always need the MPIN (Tier 2 emergency, changing the PIN, changing the phone number, trusting or signing out a device) behave exactly as when enforced, lock included; `GET /me` reports `mpin.enforced: false`; a new PIN only has to be 4 to 6 digits. Read on every call. See [mpin.md](../features/mpin.md). |
| `DEVICES_ENFORCED` | [`src/lib/devices/config.ts`](../../src/lib/devices/config.ts) (`devicesEnforced()`) | on | Anything but `false`: a new device can move money out only up to USD 50 equivalent per move for 24 hours (or until trusted), a signed-out device gets `401 device_revoked`, a sign-in older than the account's last device sign-out gets `401 signed_out` unless from a trusted device, and a new device can't sign out a trusted one, replace the phone number or reset the MPIN. `false`: devices are still recorded and alerts raised, but nothing is refused. The new-device limit (5 new ids an hour, 20 signed in) applies either way, since it only stops recording. |
| `ALERTS_PUSH` | [`src/lib/alerts/config.ts`](../../src/lib/alerts/config.ts) (`pushEnabled()`) | on | Anything but `false`: alerts also go out as Expo push notifications to registered tokens. `false`: in-app alerts only. |
| `EXPO_ACCESS_TOKEN` | `src/lib/alerts/config.ts` (`expoAccessToken()`) | unset | Sent as `Authorization: Bearer …` to Expo's push API, needed when the Expo project has enhanced push security on. |
| `OTP_MODE` | [`src/lib/otp/config.ts`](../../src/lib/otp/config.ts) (`otpMode()`) | off | `test`: no SMS; `POST /otp/send` returns the code as `testCode`. `twilio`: SMS through Twilio. Unset or anything else: texted codes are off (`503 otp_unavailable`), so trusting a device, verifying a phone and resetting an MPIN don't work. Trimmed, any case. |
| `OTP_TEST_ALLOWED` | `src/lib/otp/config.ts` (`otpTestAllowed()`) | unset | `OTP_MODE=test` is refused when `NODE_ENV=production` unless this is `true` (a demo server). |
| `TWILIO_ACCOUNT_SID` | [`src/lib/otp/twilio.ts`](../../src/lib/otp/twilio.ts) (`twilioConfig()`) | unset | Twilio account; with `TWILIO_AUTH_TOKEN`, the HTTP Basic login for the Messages API. All three Twilio values are needed for `OTP_MODE=twilio`, else `503 otp_unavailable`. |
| `TWILIO_AUTH_TOKEN` | `src/lib/otp/twilio.ts` | unset | Twilio auth token. A secret. |
| `TWILIO_FROM` | `src/lib/otp/twilio.ts` | unset | The sender: an E.164 number, or a Messaging Service SID (`MG` followed by 32 hex characters), which is sent as `MessagingServiceSid`. |
| `KYC_FLOW` | [`src/lib/kyc/checks/config.ts`](../../src/lib/kyc/checks/config.ts) (`kycFlow()`, `flowFor()`) | `photo` | `steps` (trimmed, any case): India accounts verify with PAN, Aadhaar through DigiLocker and a bank account instead of an ID photo. Other markets keep the photo check. Anything else: the photo check. |
| `KYC_CHECKS_PROVIDER` | `src/lib/kyc/checks/config.ts` (`checksProviderName()`) | `test` | `setu`: Setu's APIs. Anything else: the deterministic test provider. |
| `KYC_CHECKS_TEST_ALLOWED` | `src/lib/kyc/checks/config.ts` (`checksTestAllowed()`, `assertTestChecksAllowed()`) | unset | The test provider verifies anyone who types its sample PAN, and Setu's sandbox answers with sample data, so with `NODE_ENV=production` both answer `500 server_config` unless this is `true` (a test-mode deployment). |
| `KYC_DIGILOCKER_REDIRECT_URL` | `src/lib/kyc/checks/config.ts` (`digilockerRedirectUrl()`) | `<request origin>/verify` | Where DigiLocker sends the person back. Setu needs a public https URL. Set it on a live server. |
| `SETU_BASE_URL` | [`src/lib/kyc/checks/providers/setu.ts`](../../src/lib/kyc/checks/providers/setu.ts) (`setuBaseUrl()`), `src/lib/auth/config.ts` (start-up warning) | `https://dg-sandbox.setu.co`, outside production only | Setu's API host. A trailing `/` is removed. With `NODE_ENV=production` it must be set, to an https URL (`https://dg.setu.co`), and the sandbox host is refused unless `KYC_CHECKS_TEST_ALLOWED=true`: the steps answer `500 server_config` and log why, and `productionStartupWarnings()` warns at start-up when `KYC_FLOW=steps` and `KYC_CHECKS_PROVIDER=setu`. |
| `SETU_CLIENT_ID`, `SETU_CLIENT_SECRET` | `providers/setu.ts` | unset | Setu credentials, sent as `x-client-id` and `x-client-secret`. Missing: `503 provider_unavailable` and a log line. |
| `SETU_PAN_PRODUCT_INSTANCE_ID`, `SETU_DIGILOCKER_PRODUCT_INSTANCE_ID`, `SETU_RPD_PRODUCT_INSTANCE_ID` | `providers/setu.ts` | unset | One product instance per check, sent as `x-product-instance-id`. Each falls back to `SETU_PRODUCT_INSTANCE_ID`. |
| `SETU_PRODUCT_INSTANCE_ID` | `providers/setu.ts` | unset | Fallback product instance for all three checks. |
| `WALLET_ENABLED` | [`src/lib/wallet/config.ts`](../../src/lib/wallet/config.ts) | on | `false` (exact, case-sensitive, not trimmed) switches the wallet off: top-up, move, spend and settings answer `404 wallet_off`, and auto-saves come from the bank again. Reading the wallet and cashing out still work. |
| `RECOVERY_ENABLED` | [`src/lib/recovery/config.ts`](../../src/lib/recovery/config.ts) | on | `false` (trimmed, any case) turns off `/recovery/find`, `/recovery/reset` and `/recovery/claim` (`404 recovery_off`). |
| `TRUST_PROXY_HOPS` | [`src/lib/auth/context.ts`](../../src/lib/auth/context.ts) (`clientIp()`) | `0` | How many trusted proxies stand in front of the server. 1 or more: the rate-limit IP comes from `cf-connecting-ip`, then `x-real-ip`, then the `X-Forwarded-For` entry that many places from the right. 0 (or not a whole number): all three headers are ignored, because a client could fake them, and IP limits are skipped. Set `1` behind Caddy. |
| `TRUST_PROXY_HEADER` | `src/lib/auth/context.ts` | unset | `cf-connecting-ip` or `x-real-ip` (trimmed, any case): believe only that header for the client IP. Any other value: neither header. `X-Forwarded-For` still needs `TRUST_PROXY_HOPS`. |
| `RATE_LIMIT_PER_MINUTE` | [`src/lib/rate-limit.ts`](../../src/lib/rate-limit.ts) (`generalLimitPerMinute()`) | `120` | The general limit per client IP and per signed-in person (applied in `session()`, so `GET /me` counts too), per minute, on every route. `0` turns it off. Anything that isn't a whole number ≥ 0 means 120. |
| `VAULTWISE_DATA_DIR` | [`src/lib/db.ts`](../../src/lib/db.ts) | `<cwd>/data` | Folder for `vaultwise.db`, `uploads/` and (by default) `audit-anchors.jsonl`. The tests and the e2e script point it at a temporary folder. |
| `AUDIT_ANCHOR_FILE` | [`src/lib/audit-anchors/config.ts`](../../src/lib/audit-anchors/config.ts) (`anchorFile()`), [`deploy/backup.sh`](../../deploy/backup.sh) | `<VAULTWISE_DATA_DIR>/audit-anchors.jsonl` | Where the audit anchors are appended (the audit chain's head, once at every start and once a day; checked by `npm run audit:verify`). Trimmed and resolved to an absolute path; read on every call. On the server it must stay inside the service's `ReadWritePaths` (the default, under `/var/lib/vaultwise`, is), and `backup.sh` needs the same value. See [`src/lib/audit-anchors/README.md`](../../src/lib/audit-anchors/README.md). |
| `MOBILE_DEV_ORIGIN` | [`next.config.ts`](../../next.config.ts) | `http://localhost:8081` | The origin allowed by the development CORS headers on `/api/*` (the Expo web preview). Native apps send no `Origin`, so they need no CORS. |
| `NODE_ENV` | `next.config.ts`, `src/lib/kyc/secret.ts`, `src/lib/auth/config.ts`, `src/lib/otp/config.ts`, `src/lib/kyc/checks/config.ts`, `src/lib/kyc/checks/providers/setu.ts` | Set by Next.js (`development` for `next dev`, `production` for `next build`/`next start`) | `production` turns on the start-up guard and the security headers (HSTS, CSP and others), turns off the development CORS headers, makes `IDENTITY_SECRET` required, refuses the OTP test sender, the KYC test provider and Setu's sandbox unless allowed, and makes `SETU_BASE_URL` required for Setu. |
| `NEXT_RUNTIME` | [`src/instrumentation.ts`](../../src/instrumentation.ts) | Set by Next.js | The start-up guard and the start-up audit anchor run only when it is `nodejs`. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | [`src/components/identity/config.ts`](../../src/components/identity/config.ts) | empty | Web sign-in. Together with the project ID it turns on `SIGN_IN_ON` in the browser. Inlined at build time. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `src/components/identity/config.ts`, `next.config.ts` | `<projectId>.firebaseapp.com` | Web Firebase config. A custom domain (not `*.firebaseapp.com` or `*.web.app`) is also added to the CSP's `frame-src` at build time. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `src/components/identity/config.ts` | empty | Web Firebase config. Needed for `SIGN_IN_ON`. Should match `FIREBASE_PROJECT_ID`. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `src/components/identity/config.ts` | empty | Web Firebase config. Not needed for `SIGN_IN_ON` (the phone app does need its app ID). |

Keep the server and the clients in step: `FIREBASE_PROJECT_ID` (server) decides whether the API wants a token, while `NEXT_PUBLIC_FIREBASE_*` and `EXPO_PUBLIC_FIREBASE_*` decide whether the clients ask people to sign in.
Nothing checks that they agree.

At start-up in production, `productionStartupWarnings()` logs a `[vaultwise]` warning for each of: no sign-in (prototype on purpose), `IDENTITY_SECRET`, `ADMIN_EMAILS` or `FIREBASE_WEB_API_KEY` missing, neither `TRUST_PROXY_HOPS` nor `TRUST_PROXY_HEADER` set, and (with `KYC_FLOW=steps` and `KYC_CHECKS_PROVIDER=setu`) `SETU_BASE_URL` missing or set to the sandbox without `KYC_CHECKS_TEST_ALLOWED=true`. See [running-online.md](../features/running-online.md).

### Deploy scripts (`deploy/`)

| Variable | Read in | Default | Effect |
|---|---|---|---|
| `VAULTWISE_DATA_DIR` | [`deploy/backup.sh`](../../deploy/backup.sh) | `/var/lib/vaultwise` | Where the database and uploads are. The systemd unit sets the same value for the app. |
| `BACKUP_DIR` | `deploy/backup.sh` | `/var/backups/vaultwise` | Where backups go, one folder per run. Must not be empty or `/`. |
| `KEEP_DAYS` | `deploy/backup.sh` | `14` | How many days of backups to keep. |
| `BACKUP_S3_URI` | `deploy/backup.sh` | unset | A private S3 bucket for a second copy, e.g. `s3://my-bucket/vaultwise`. Set: each backup (database, photos and anchors) is copied there with `aws s3 cp --sse AES256`. |
| `AUDIT_ANCHOR_FILE` | `deploy/backup.sh` | `$VAULTWISE_DATA_DIR/audit-anchors.jsonl` | The app's anchors file, if `/etc/vaultwise.env` moved it. The backup copies it before the database and checks the newest anchor against the copy; a mismatch still keeps the backup but makes the run exit 1. |

The backup's settings go as lines in `/etc/cron.d/vaultwise-backup` (for example `BACKUP_S3_URI=…` above the schedule line), so neither the repository's `backup.sh` nor the installed copy (`/usr/local/sbin/vaultwise-backup`) is edited.

On the server the app's settings live in `/etc/vaultwise.env` (read by [`deploy/vaultwise.service`](../../deploy/vaultwise.service) and by `update.sh`, installed as `/usr/local/sbin/vaultwise-update`), not in `.env.local`. Steps are in [deploy/README.md](../../deploy/README.md).

### Scripts and tests only

| Variable | Read in | Default | Effect |
|---|---|---|---|
| `E2E_PORT` | [`scripts/e2e.mjs`](../../scripts/e2e.mjs) | `3100` | Port for the throwaway production server. |
| `E2E_AI_SAMPLES` | `scripts/e2e.mjs` | unset | Any value adds the live-AI regression (every sample document, about 13 Groq calls). Needs AI on in the server. |
| `E2E_ONLY_AI` | `scripts/e2e.mjs` | unset | Any value runs only the live-AI part. |
| `GROQ_LIVE_KEY` | [`scripts/test-ai.mjs`](../../scripts/test-ai.mjs), `tests/ai-verification.test.ts` | unset | Lets the AI verification test call Groq for real. `npm run test:ai` sets it from `GROQ_API_KEY` in `.env.local`. |
| `AI_CHECK_REPORT` | `tests/ai-verification.test.ts` | unset | File the AI test writes its decisions to. Set by `npm run test:ai`. |
| `EVAL_DATASET`, `EVAL_LIMIT`, `EVAL_DELAY_MS`, `EVAL_CONFIG`, `EVAL_RAW_OUT` | [`eval/verification/evaluate.eval.ts`](../../eval/verification/evaluate.eval.ts) | set by `eval/verification/run.mjs` | Set by `npm run eval:verification` from its options; not meant to be set by hand. See [docs/evaluation/](../evaluation/README.md). |

`tests/setup.ts` sets `VAULTWISE_DATA_DIR` to a temporary folder, deletes `GROQ_API_KEY`, installs a deterministic price provider (`setPriceProvider(fakePrices())`, `tests/helpers/prices.ts`) and replaces `fetch` with one that always fails, so `npm test` never calls Groq or Yahoo, never uses the network and never touches `./data`.

`scripts/e2e.mjs` starts its server with `ALLOW_PROTOTYPE_IN_PRODUCTION=true` (the open prototype under `next start`) and `TRUST_PROXY_HEADER=x-real-ip` (so one test can act as visitors behind a proxy), and reads `RATE_LIMIT_PER_MINUTE` (default 120) for its rate-limit test.

### Phone app (`mobile/src`, `mobile/scripts`)

Expo only inlines `EXPO_PUBLIC_*` variables that are written out in full in the code, so each is read by its full name.

| Variable | Read in | Default | Effect |
|---|---|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | [`mobile/src/lib/auth/firebase.ts`](../../mobile/src/lib/auth/firebase.ts) | empty | Phone sign-in. Firebase is configured only when the API key, project ID and app ID are all set. |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `mobile/src/lib/auth/firebase.ts` | `<projectId>.firebaseapp.com` | Firebase config. |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `mobile/src/lib/auth/firebase.ts` | empty | Firebase config (required). |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | `mobile/src/lib/auth/firebase.ts` | empty | Firebase config (required). |
| `EXPO_PUBLIC_API_URL` | [`mobile/src/lib/api/connection.ts`](../../mobile/src/lib/api/connection.ts) | Web: `http://localhost:3000`. Native: the host Metro is served from, port 3000. Fallback: `http://localhost:3000`. | The API server address. A trailing `/` is removed. People can also change it in the app (Profile → Data source), which is saved in `vw.connection`. Release builds accept only `https://` addresses (`features/protection/https.ts`). The `tester-live` profile sets it in `mobile/eas.json` (replace `https://YOUR-DOMAIN`); the policy links in Help & legal also use it. |
| `EXPO_PUBLIC_PRACTICE_ONLY` | [`mobile/src/lib/build.ts`](../../mobile/src/lib/build.ts) | unset | `1` makes the build Practice only (see `PRACTICE_ONLY` below). Set by the `apk` and `production` EAS profiles, by `npm run build:tester`, and by `npm run update:apk` / `update:production`. Don't set it in `.env.local`. |
| `EXPO_PUBLIC_TESTER` | [`mobile/src/features/tester/config.ts`](../../mobile/src/features/tester/config.ts) | unset | `1` (with Practice only) turns on tester mode: the Home card, the feedback form and activity sharing. Set by `npm run build:tester`. Not in `mobile/.env.example`. |
| `EXPO_PUBLIC_POSTHOG_KEY` | `mobile/src/features/tester/config.ts`, [`mobile/scripts/build-tester.mjs`](../../mobile/scripts/build-tester.mjs) | empty | PostHog project key for the tester site. `npm run build:tester` refuses to run without it. |
| `EXPO_PUBLIC_POSTHOG_HOST` | `mobile/src/features/tester/config.ts` | `https://us.i.posthog.com` | PostHog host. Use `https://eu.i.posthog.com` for an EU project. |

Every variable in both `.env.example` files is read somewhere in the code. No unused variable was found. The root `.env.example` lists every variable in the table above (the rarely used ones commented out with their defaults), except `NODE_ENV` and `NEXT_RUNTIME`, which Node.js and Next.js set.

## Code-level switches

These are constants or functions in the code. Change them by editing the file.

### Server (`src/lib`)

| Switch | File | Value | Effect |
|---|---|---|---|
| `authMode()` | [`src/lib/auth/config.ts`](../../src/lib/auth/config.ts) | from `FIREBASE_PROJECT_ID` | `prototype` or `firebase` |
| `kycEnforced()` / `kycGateOn()` | `src/lib/auth/config.ts` | from `KYC_ENFORCED` | See above |
| `aiEnabled()` | [`src/lib/groq.ts`](../../src/lib/groq.ts) | from `GROQ_API_KEY` | See above |
| `walletEnabled()` / `assertWalletEnabled()` | [`src/lib/wallet/config.ts`](../../src/lib/wallet/config.ts) | from `WALLET_ENABLED` | See above |
| `recoveryEnabled()` / `assertRecoveryEnabled()` | [`src/lib/recovery/config.ts`](../../src/lib/recovery/config.ts) | from `RECOVERY_ENABLED` | See above |
| `kycProvider()` / `setKycProvider()` | [`src/lib/kyc/service.ts`](../../src/lib/kyc/service.ts) | from `KYC_PROVIDER` | Tests can force a provider with `setKycProvider()`. |
| `aiConsented()` | [`src/lib/ai-consent.ts`](../../src/lib/ai-consent.ts) | per request, from `x-ai-consent` | Only `yes` lets that request's data reach the AI. A missing header counts as no. |
| `productionStartupProblem()` / `productionStartupWarnings()` | `src/lib/auth/config.ts` | from `NODE_ENV`, `FIREBASE_PROJECT_ID`, `ALLOW_PROTOTYPE_IN_PRODUCTION` and others | The start-up guard. Takes the environment as an argument, so tests pass their own. |
| `generalLimitPerMinute()` | [`src/lib/rate-limit.ts`](../../src/lib/rate-limit.ts) | from `RATE_LIMIT_PER_MINUTE` | See above |
| `mpinEnforced()` | [`src/lib/mpin/config.ts`](../../src/lib/mpin/config.ts) | from `MPIN_ENFORCED` | See above |
| `MONEY_ROUTES` | [`src/lib/money-routes.ts`](../../src/lib/money-routes.ts) | code | Which money actions need the MPIN, take the KYC gate and get the new-device cap, and which are money in from the bank (`moneyIn`: the KYC gate, never the MPIN) |
| `setPriceProvider()` / `priceProvider()` | [`src/lib/invest/prices.ts`](../../src/lib/invest/prices.ts) | the Yahoo adapter ([`yahoo.ts`](../../src/lib/invest/yahoo.ts)) by default | Where market prices come from. Tests install a fake; `null` goes back to Yahoo. |
| `setBillReader()` | [`src/lib/verification/stages/ai-read.ts`](../../src/lib/verification/stages/ai-read.ts) | the Groq call by default | Replaces the bill reader (the offline evaluation and tests); `null` restores it. Consent still comes first. |
| `devicesEnforced()` | [`src/lib/devices/config.ts`](../../src/lib/devices/config.ts) | from `DEVICES_ENFORCED` | See above |
| `pushEnabled()` / `setAlertSenders()` | [`src/lib/alerts/config.ts`](../../src/lib/alerts/config.ts), [`senders.ts`](../../src/lib/alerts/senders.ts) | from `ALERTS_PUSH` | Tests (or a new channel) can swap the alert senders. |
| `otpMode()` / `otpTestAllowed()` | [`src/lib/otp/config.ts`](../../src/lib/otp/config.ts) | from `OTP_MODE`, `OTP_TEST_ALLOWED`, `NODE_ENV` | See above |
| `kycFlow()` / `flowFor()` / `checksProviderName()` / `setCheckProviders()` | [`src/lib/kyc/checks/config.ts`](../../src/lib/kyc/checks/config.ts), [`registry.ts`](../../src/lib/kyc/checks/registry.ts) | from `KYC_FLOW`, `KYC_CHECKS_PROVIDER` | Tests can replace any one check provider with `setCheckProviders()`. |
| Custom vault rules | [`src/lib/custom-rules.ts`](../../src/lib/custom-rules.ts) | always on | No server switch. To remove the feature, delete the file and the lines marked `custom-rules`. |

Tunable limits (constants, not switches):

| Constant | File | Value |
|---|---|---|
| `LIMITS` (recovery rate limits) | [`src/lib/recovery/limits.ts`](../../src/lib/recovery/limits.ts) | find 5 per key and 300 server-wide per hour; reset 5 and 500 per hour; claim 3 and 200 per day |
| `CLAIM_TTL_MS` | [`src/lib/recovery/claims.ts`](../../src/lib/recovery/claims.ts) | 7 days (a claim nobody decides expires). Copied in `src/components/identity/config.ts`. |
| `FIND_TOKEN_TTL_MS` | [`src/lib/recovery/tokens.ts`](../../src/lib/recovery/tokens.ts) | 10 minutes |
| `LIMIT_PER_DAY` | `src/lib/kyc/service.ts` | 5 ID checks per day |
| `RAISE_WINDOW_MS` | [`src/lib/wallet/plan.ts`](../../src/lib/wallet/plan.ts) | 30 days between raising (or turning off) the wallet daily limit |
| `MAX_BYTES` | [`src/lib/verification/proofs.ts`](../../src/lib/verification/proofs.ts) | 10 MB per upload (413 above it) |
| `PIPELINE_VERSION` | [`src/lib/verification/types.ts`](../../src/lib/verification/types.ts) | `vw-proof@1.5` |
| `ANCHOR_EVERY_MS` | [`src/lib/audit-anchors/config.ts`](../../src/lib/audit-anchors/config.ts) | 24 hours between scheduled audit anchors (plus one at every start) |
| Per-market rules (caps, SLAs, satellite limits, limit allowances) | [`src/lib/compliance.ts`](../../src/lib/compliance.ts) | `rulesFor(jurisdiction)` |
| `MPIN_LENGTH`, `TRIES_PER_LOCK`, `LOCK_STEPS_MS`, `MAX_PIN_INPUT` | [`src/lib/mpin/config.ts`](../../src/lib/mpin/config.ts) | 6 digits; 5 wrong tries per lock; locks of 1 minute, 5 minutes, 30 minutes, then 24 hours; `pin` at most 12 characters |
| `COMMON_MPINS` | [`src/lib/mpin/policy.ts`](../../src/lib/mpin/policy.ts) | 20 refused PINs (mirrored in the phone simulator) |
| `UNTRUSTED_CAP_USD`, `COOL_DOWN_MS`, `LAST_SEEN_EVERY_MS` | [`src/lib/devices/config.ts`](../../src/lib/devices/config.ts) | USD 50 per move (× `CURRENCY_SCALE`); 24 hours; 1 minute |
| `NEW_ACCOUNT_WINDOW_MS`, `NEW_DEVICES_PER_HOUR`, `MAX_ACTIVE_DEVICES` | `src/lib/devices/config.ts` | 1 hour (with sign-in on, the first device is trusted at once only on a wallet this new; prototype mode always trusts the first device); 5 new device rows an hour; 20 signed in per account |
| `MAX_PUSH_TOKENS_PER_USER`, `PUSH_TIMEOUT_MS` | [`src/lib/alerts/config.ts`](../../src/lib/alerts/config.ts) | 10; 10 seconds |
| `OTP_DIGITS`, `OTP_TTL_MS`, `OTP_MAX_TRIES`, `OTP_SENDS_PER_HOUR`, `VERIFICATION_TTL_MS` | [`src/lib/otp/config.ts`](../../src/lib/otp/config.ts) | 6; 5 minutes; 3; 5 per person and per person to one number; 10 minutes |
| `OTP_NEW_NUMBER_SENDS_PER_HOUR`, `PHONE_RESET_HOLD_MS` | `src/lib/otp/config.ts` | 15 `phone_verify` codes an hour to one number from accounts that haven't verified it; 72 hours before a new or changed number can reset the MPIN |
| `TRIES_PER_DAY` | [`src/lib/kyc/checks/config.ts`](../../src/lib/kyc/checks/config.ts) | 5 tries per KYC step per day |
| `DEFAULT_PER_MINUTE`, `UPLOADS_PER_HOUR` | [`src/lib/rate-limit.ts`](../../src/lib/rate-limit.ts) | 120 requests a minute; 20 photo uploads per person per hour |

### Web app (`src/components`)

| Switch | File | Value | Effect |
|---|---|---|---|
| `IDENTITY_ENABLED` | [`src/components/identity/config.ts`](../../src/components/identity/config.ts) | `true` | The one web switch for sign-in, KYC and recovery screens. |
| `SIGN_IN_ON` | `src/components/identity/config.ts` | derived | `IDENTITY_ENABLED` and `NEXT_PUBLIC_FIREBASE_API_KEY` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` are all set. |
| `RECOVERY_PAGES` | `src/components/identity/config.ts` | `["/", "/vaults", "/recover"]` | Pages that stay open while a recovery claim waits. Other pages show a placeholder. |
| `CUSTOM_RULES_ENABLED` | [`src/components/custom-rule.tsx`](../../src/components/custom-rule.tsx) | `true` | Shows "write your own rule" for custom vaults on the web. |
| `PUBLIC_PAGES` | [`src/components/legal/config.ts`](../../src/components/legal/config.ts) | `["/privacy", "/terms", "/delete-account"]` | Pages anyone can open without signing in. |
| `CONTACT_EMAIL`, `LAST_UPDATED`, `OPERATOR`, `CLOSED_ACCOUNT_DAYS`, `BACKUP_DAYS`, `REPLY_DAYS` | `src/components/legal/config.ts` | `privacy@<your-domain>` (a placeholder to replace before going live), `22 November 2026`, `the Vaultwise student team`, 90, 14, 30 | Values the policy pages show |

### Phone app (`mobile/src`)

| Switch | File | Value | Effect |
|---|---|---|---|
| `PRACTICE_ONLY` | [`mobile/src/lib/build.ts`](../../mobile/src/lib/build.ts) | `EXPO_PUBLIC_PRACTICE_ONLY === "1"`, or the update channel is `apk` or `production` | The app always runs on Practice data, with no server address to type. Sign-in, "Verify your ID" and recovery are off. Two signals, so an over-the-air update bundled on a computer can't switch it off. |
| `SIGN_IN_ENABLED` | [`mobile/src/features/auth/config.ts`](../../mobile/src/features/auth/config.ts) | `!PRACTICE_ONLY` | Sign-in screens and tokens. Also needs Firebase configured (`firebaseConfigured`). |
| `TESTER_LIVE` | [`mobile/src/lib/build.ts`](../../mobile/src/lib/build.ts) | the update channel is `tester-live` | The online tester build (plan 05): live data and sign-in, but no ID check or recovery for testers. |
| `KYC_ENABLED` | [`mobile/src/features/kyc/config.ts`](../../mobile/src/features/kyc/config.ts) | `!PRACTICE_ONLY && !TESTER_LIVE` | The ID to-do on Home and the Identity row in Settings (photo check or the India steps, whichever the server asks for). The server still decides whether money can move. |
| `RECOVERY_ENABLED` | [`mobile/src/features/recovery/config.ts`](../../mobile/src/features/recovery/config.ts) | `!PRACTICE_ONLY && !TESTER_LIVE` | Find my account, Recover with an ID, "I had an account before". A pending claim still shows. |
| `MPIN_ENABLED` | [`mobile/src/features/mpin/config.ts`](../../mobile/src/features/mpin/config.ts) | `true` | The MPIN sheet on money moves. Off only to roll back; the server's `MPIN_ENFORCED` decides what it refuses. See [mpin.md](../features/mpin.md). |
| `DEVICES_ENABLED` | [`mobile/src/features/devices/config.ts`](../../mobile/src/features/devices/config.ts) | `true` | Your devices, Trust this phone, and signing out when the server says this phone was signed out. |
| `ALERTS_ENABLED` | [`mobile/src/features/alerts/config.ts`](../../mobile/src/features/alerts/config.ts) | `true` | The alerts bell, inbox and push registration. |
| `PHONE_VERIFY_ENABLED` | [`mobile/src/features/phone-verify/config.ts`](../../mobile/src/features/phone-verify/config.ts) | `true` | Verify your phone number with a texted code. |
| `UPDATES_PROMPT_ENABLED` | [`mobile/src/features/updates/config.ts`](../../mobile/src/features/updates/config.ts) | `true` | The "new version is ready" banner with Restart. |
| `PROTECTION.*` | [`mobile/src/features/protection/config.ts`](../../mobile/src/features/protection/config.ts) | each `true` | One switch per phone protection (lock by default, idle lock, app-switcher cover, screenshot blocking, hide balances, root warning, secure session, biometric rules, wrong-PIN waits, https only). See [phone-security.md](../features/phone-security.md). |
| `WALLET_ENABLED` | [`mobile/src/features/wallet/config.ts`](../../mobile/src/features/wallet/config.ts) | `true` | Off: no wallet on Home and Your limits, and wallet screens redirect Home. Independent of the server's `WALLET_ENABLED`. |
| `CUSTOM_RULES_ENABLED` | [`mobile/src/features/custom-rules/config.ts`](../../mobile/src/features/custom-rules/config.ts) | `true` | Off: a custom vault borrows a category's rules. |
| `TESTER_ENABLED` | [`mobile/src/features/tester/config.ts`](../../mobile/src/features/tester/config.ts) | `PRACTICE_ONLY && EXPO_PUBLIC_TESTER === "1"` | Tester mode. |
| `firebaseConfigured` | [`mobile/src/lib/auth/firebase.ts`](../../mobile/src/lib/auth/firebase.ts) | derived | API key, project ID and app ID are all set. |

## EAS build profiles (`mobile/eas.json`)

CLI requirement: `eas-cli >= 24.0.0`. `appVersionSource` is `remote`, so EAS keeps the build numbers.

| Profile | Channel | Distribution | Other settings | `env` | Practice only? |
|---|---|---|---|---|---|
| `development` | `development` | internal | `developmentClient: true` (a dev client build) | none | No |
| `development-simulator` | `development` (extends `development`) | internal | `ios.simulator: true` | none | No |
| `preview` | `preview` | internal | none | none | No |
| `apk` | `apk` | internal | `android.buildType: "apk"`, `autoIncrement: true` | `EXPO_PUBLIC_PRACTICE_ONLY=1` | Yes |
| `tester-live` | `tester-live` | internal | `android.buildType: "apk"`, `autoIncrement: true`, EAS environment `preview` | `EXPO_PUBLIC_API_URL` (set your domain first). The `EXPO_PUBLIC_FIREBASE_*` values must be in the EAS `preview` environment: EAS doesn't upload `mobile/.env.local`, so without them sign-in stays off | No |
| `production` | `production` | store (default) | `autoIncrement: true` | `EXPO_PUBLIC_PRACTICE_ONLY=1` | Yes |

`submit.production` is empty (`{}`), so store submission uses EAS defaults.

Over-the-air updates go through [`mobile/scripts/update.mjs`](../../mobile/scripts/update.mjs):

| Channel | EAS environment | Sets `EXPO_PUBLIC_PRACTICE_ONLY=1` | npm script |
|---|---|---|---|
| `apk` | `preview` | Yes | `npm run update:apk` |
| `production` | `production` | Yes | `npm run update:production` |
| `preview` | `preview` | No | none (run `node scripts/update.mjs preview`) |
| `tester-live` | `preview` | No; also carries the `tester-live` profile's `EXPO_PUBLIC_` values and stops if `EXPO_PUBLIC_API_URL` is still `YOUR-DOMAIN` | `npm run update:tester-live` |

The update message is the text you pass, or the last commit's subject, followed by the short commit hash.
The script warns when `mobile/` has uncommitted changes, because they ship in the update.

## `app.json` key settings (`mobile/app.json`)

| Setting | Value | Why it matters |
|---|---|---|
| `name` / `slug` | `Vaultwise` / `vaultwise` | Display name and Expo project slug |
| `version` | `0.2.0` | App version. Bump it on a release, together with `mobile/package.json` and `CHANGELOG.md`. The fingerprint runtime ignores it, so a version bump alone doesn't need a new build. |
| `scheme` | `vaultwise` | Deep links (`vaultwise://…`) |
| `orientation` | `portrait` | |
| `userInterfaceStyle` | `automatic` | Follows the phone's light or dark setting |
| `ios.bundleIdentifier` / `android.package` | `app.vaultwise.mobile` | Store identity |
| `ios.supportsTablet` | `false` | iPhone only |
| `ios.infoPlist.ITSAppUsesNonExemptEncryption` | `false` | Skips the export-compliance question |
| `ios.privacyManifests` | UserDefaults, FileTimestamp, SystemBootTime, DiskSpace reasons | Apple privacy manifest |
| `android.permissions` | `CAMERA`, `USE_BIOMETRIC`, `USE_FINGERPRINT` | |
| `android.blockedPermissions` | `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` | Removes permissions that libraries would add |
| `android.predictiveBackGestureEnabled` | `false` | |
| `android.softwareKeyboardLayoutMode` | `resize` | |
| `web.output` | `single` | Single-page web export (used by the tester site) |
| `plugins` | `expo-router`, `expo-splash-screen` (background `#0B0B0F`), `expo-camera` (barcode scanner on, no microphone), `expo-image-picker` (no microphone), `expo-local-authentication` and `expo-secure-store` (Face ID text), `expo-status-bar`, `expo-web-browser` | Permission texts shown to people are set here |
| `experiments.typedRoutes` / `experiments.reactCompiler` | `true` / `true` | Typed expo-router links; React Compiler |
| `extra.router.asyncRoutes.web` | `true` | Lazy-loaded routes on web |
| `extra.eas.projectId` | `635f0ddf-a71f-439d-820c-0733fee3d214` | Links the app to its EAS project |
| `runtimeVersion.policy` | `fingerprint` | An update only reaches builds with the same native fingerprint. A native change needs a new build. |
| `updates.url` | `https://u.expo.dev/635f0ddf-a71f-439d-820c-0733fee3d214` | Where installed builds fetch over-the-air updates |

## Related reading

- What the switches change in the API: [api.md](api.md)
- How to run things: [commands.md](commands.md)
- Module notes: [`src/lib/auth/README.md`](../../src/lib/auth/README.md), [`src/lib/wallet/README.md`](../../src/lib/wallet/README.md), [`src/lib/mpin/README.md`](../../src/lib/mpin/README.md), [`src/lib/devices/README.md`](../../src/lib/devices/README.md), [`src/lib/alerts/README.md`](../../src/lib/alerts/README.md), [`src/lib/otp/README.md`](../../src/lib/otp/README.md), [`src/lib/kyc/checks/README.md`](../../src/lib/kyc/checks/README.md), [`src/lib/audit-anchors/README.md`](../../src/lib/audit-anchors/README.md), [`src/lib/invest/README.md`](../../src/lib/invest/README.md), [`mobile/src/features/tester/README.md`](../../mobile/src/features/tester/README.md)
- Running the server online: [running-online.md](../features/running-online.md) and [deploy/README.md](../../deploy/README.md)
