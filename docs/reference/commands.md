# Commands reference

Every npm script in the two `package.json` files, the server deploy scripts, plus the Expo and EAS commands from [`mobile/README.md`](../../mobile/README.md).
As of commit `012a9fc` plus the server work for plans 03, 05, 06 and 07 and the security review fixes (2026-11-22).

## Before you start: Windows PowerShell 5.1

The default Windows PowerShell (5.1) **can't chain commands with `&&`** or `||`. It also has no inline `VAR=value command` syntax. Use these instead:

| You see (bash) | Use in PowerShell 5.1 | Notes |
|---|---|---|
| `a && b` | `a; if ($?) { b }` | Runs `b` only if `a` succeeded |
| `a; b` | `a; b` | Runs `b` either way |
| `E2E_AI_SAMPLES=1 npm run test:e2e` | `$env:E2E_AI_SAMPLES = "1"; npm run test:e2e` | The variable stays set in that window. Clear it with `Remove-Item Env:E2E_AI_SAMPLES`. |

`&&` inside a `package.json` script (for example `deploy:tester`) is fine: npm runs scripts with `cmd.exe` on Windows, not PowerShell.
Git Bash and PowerShell 7 or later accept `&&`.

## Server and web app (repo root)

From [`package.json`](../../package.json). Run these in the repo root (`VaultWise/`).

| Task | Where to run | Command | Notes |
|---|---|---|---|
| Install dependencies | repo root | `npm install` | |
| Start the dev server | repo root | `npm run dev` | Runs `next dev` on http://localhost:3000. Restart it after changing `.env.local`. It also re-adds the managed block in `AGENTS.md`. |
| Start the dev server for phones on your Wi-Fi | repo root | `npx next dev -H 0.0.0.0` | From `mobile/README.md`. The phone app then finds the API on port 3000 of the computer running Expo. |
| Production build | repo root | `npm run build` | Runs `next build`. |
| Start the production server | repo root | `npm start` | Runs `next start`. Run `npm run build` first. PowerShell 5.1: `npm run build; if ($?) { npm start }`. It runs with `NODE_ENV=production`, so it **refuses to start** without `FIREBASE_PROJECT_ID` (see [running-online.md](../features/running-online.md)). For a local check of the open prototype, set `ALLOW_PROTOTYPE_IN_PRODUCTION=true` first (PowerShell: `$env:ALLOW_PROTOTYPE_IN_PRODUCTION = "true"; npm start`). |
| Lint | repo root | `npm run lint` | Runs `eslint`. |
| Format | repo root | `npm run format` | Runs `prettier --write "src/**/*.{ts,tsx,css}"`. Rewrites files. |
| Type check | repo root | `npm run typecheck` | Runs `tsc --noEmit`. |
| Unit tests | repo root | `npm test` | Runs `vitest run` on `tests/` (excludes `mobile/`). Uses a temporary data folder and never calls Groq, Twilio, Expo or Setu (those tests mock `fetch`). |
| One test file | repo root | `npx vitest run tests/mpin.test.ts` | Any file in `tests/`, for example `devices`, `alerts`, `otp`, `kyc-steps`, `rate-limit`, `server-hardening`, `deploy` (reads the deploy scripts as text). |
| End-to-end API tests | repo root | `npm run test:e2e` | Runs `node scripts/e2e.mjs`. Needs a production build first. Starts the server on port 3100 (`E2E_PORT`) with a throwaway database, `ALLOW_PROTOTYPE_IN_PRODUCTION=true` and `TRUST_PROXY_HEADER=x-real-ip`; never touches `./data`. Every request sends `x-ai-consent: yes` and a fixed `x-device-id`; accounts use 6-digit MPINs and money routes send `pin`. Includes the MPIN refusals, the assistant's `ai_consent_required`, and a general rate-limit check that makes up to 2 × `RATE_LIMIT_PER_MINUTE` + 1 requests (241 by default). PowerShell 5.1: `npm run build; if ($?) { npm run test:e2e }`. |
| End-to-end tests plus live AI | repo root | bash: `E2E_AI_SAMPLES=1 npm run test:e2e` · PowerShell: `$env:E2E_AI_SAMPLES = "1"; npm run test:e2e` | Adds every sample document and the limit-exception scenarios (about 13 Groq calls). Needs `GROQ_API_KEY` in `.env.local`. |
| Only the live-AI part of the e2e tests | repo root | bash: `E2E_ONLY_AI=1 npm run test:e2e` · PowerShell: `$env:E2E_ONLY_AI = "1"; npm run test:e2e` | |
| Check the AI bill reader against Groq | repo root | `npm run test:ai` | Runs `node scripts/test-ai.mjs`. Loads `GROQ_API_KEY` from `.env.local`, runs `tests/ai-verification.test.ts` with `GROQ_LIVE_KEY`, and prints each sample bill's decision. Takes about 3 minutes. |
| Make an `IDENTITY_SECRET` | anywhere | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | From `.env.example`. Put the output in `.env.local`. Don't change it once IDs are saved. |
| Try texted codes locally | repo root | add `OTP_MODE=test` to `.env.local`, restart `npm run dev` | `POST /api/v1/otp/send` then answers the code as `testCode`. |
| Try the KYC steps flow locally | repo root | add `KYC_FLOW=steps` to `.env.local` (an India account), restart | Uses the test provider: PAN `ABCDE1234F` passes, `ABCDE0000F` goes to a person. |

## Server deploy scripts (`deploy/`)

Run these **on the server**, over SSH, as described in [`deploy/README.md`](../../deploy/README.md). They are bash scripts for Ubuntu, not for Windows.

Root runs only root-owned copies of the scripts, installed outside the app folder: `/opt/vaultwise` belongs to the `vaultwise` user, and `npm ci` runs package install scripts as that user, so a file there could have been changed by a package. Never run `sudo bash /opt/vaultwise/deploy/...`.

| Task | Command | Notes |
|---|---|---|
| Install (or reinstall) the scripts and the service | `sudo install -o root -g root -m 0644 /opt/vaultwise/deploy/vaultwise.service /etc/systemd/system/vaultwise.service`, `sudo install -o root -g root -m 0755 /opt/vaultwise/deploy/update.sh /usr/local/sbin/vaultwise-update`, `sudo install -o root -g root -m 0755 /opt/vaultwise/deploy/backup.sh /usr/local/sbin/vaultwise-backup`, then `sudo systemctl daemon-reload` | Step 12 of the deploy guide. Later, only after reading the difference `vaultwise-update` prints. |
| Pull, build and restart | `sudo vaultwise-update` | Pulls with `git pull --ff-only` as the `vaultwise` user, loads `/etc/vaultwise.env`, runs `npm ci --include=dev` and `npm run build` as that user, restarts the `vaultwise` service, and waits up to 30 s for `/api/v1/region`. Run it after changing `/etc/vaultwise.env` too (`NEXT_PUBLIC_*` values are built in). If the repository's `update.sh`, `backup.sh` or `vaultwise.service` differs from the installed copy, it prints the difference (lines starting `!!`) and the `sudo install …` command to run after reading it, and keeps using the installed copy. It never installs them itself. |
| Build and restart without pulling | `sudo vaultwise-update --no-pull` | The first start, or after editing files on the server. |
| Schedule the nightly backup | `echo '30 21 * * * root /usr/local/sbin/vaultwise-backup >> /var/log/vaultwise-backup.log 2>&1' \| sudo tee /etc/cron.d/vaultwise-backup` | 03:00 IST. Cron runs the installed copy, never the one in `/opt/vaultwise`. |
| Add the S3 copy | `sudo sed -i '1i BACKUP_S3_URI=s3://YOUR-BUCKET-NAME/vaultwise' /etc/cron.d/vaultwise-backup` | After `aws configure` (deploy guide step 17). The bucket is a setting in the cron file, so neither copy of `backup.sh` is edited. |
| Back up now | `sudo vaultwise-backup` | `sqlite3 .backup` plus an integrity check, packs `uploads/`, copies to S3 when `BACKUP_S3_URI` is set, deletes backups older than `KEEP_DAYS` (14). Prints `Backup OK`. |
| Move a server set up the old way | read `/opt/vaultwise/deploy/update.sh` and `backup.sh`, check `git -C /opt/vaultwise status` and `git -C /opt/vaultwise diff` show no local changes, then run the three `sudo install` lines above and the cron line | For a server whose cron or people ran `/opt/vaultwise/deploy/*.sh` as root (deploy guide step 15). |
| Restore or test a restore | follow [`deploy/restore.md`](../../deploy/restore.md) | Monthly test restore into a scratch folder; real restore; rebuild from a Lightsail snapshot. |
| Server logs | `journalctl -u vaultwise -n 100 --no-pager` | Start-up guard messages, `[vaultwise]` warnings and `server_error <errorId>` lines. |
| Find an error by its id | `journalctl -u vaultwise --no-pager \| grep <errorId>` | The `errorId` from a 500 answer. |
| Service status | `sudo systemctl status vaultwise caddy --no-pager` | |
| Check the headers from your computer | `curl -I https://YOUR-DOMAIN` | Expect `strict-transport-security`, `x-content-type-options`, `x-frame-options`, `referrer-policy`, `permissions-policy`, `content-security-policy`. |
| Check sign-in is on | `curl -X POST https://YOUR-DOMAIN/api/v1/reset` | Must answer 401 `signed_out`. If it answers `{"ok":true}`, stop the server and fix `/etc/vaultwise.env`. |

## Phone app (`mobile/`)

From [`mobile/package.json`](../../mobile/package.json). Run these inside `mobile/`. There is no test script for the phone app.

| Task | Where to run | Command | Notes |
|---|---|---|---|
| Install dependencies | `mobile/` | `npm install` | |
| Start Metro for a development build | `mobile/` | `npm start` | Runs `expo start`. Open the project from the installed development build. |
| Run on a phone with Expo Go | `mobile/` | `npm run start:go` | Runs `expo start --go`. Scan the QR code. Custom haptics and Face ID need a development build. On iPhone, sign in to the same Expo account in Expo Go and the CLI. |
| Run in a browser | `mobile/` | `npm run web` | Runs `expo start --web` on http://localhost:8081. Haptics, camera and Face ID need a phone. |
| Clear Metro's cache | `mobile/` | `npx expo start --clear` | Use when a changed `.env.local` value doesn't show up. |
| Build and run on Android locally | `mobile/` | `npm run android` | Runs `expo run:android`. Needs the Android SDK on this computer. |
| Build and run on iOS locally | `mobile/` | `npm run ios` | Runs `expo run:ios`. Needs a Mac with Xcode. |
| Lint | `mobile/` | `npm run lint` | Runs `expo lint`. |
| Type check | `mobile/` | `npm run typecheck` | Runs `tsc --noEmit`. |
| Check the Expo setup | `mobile/` | `npm run doctor` | Runs `npx expo-doctor@latest`. |
| Log in to Expo (CLI) | `mobile/` | `npx expo login` | Needed for Expo Go on iPhone. |
| Log in to EAS | `mobile/` | `npx eas-cli@latest login` | Needed before any EAS build, update or deploy. A free Expo account works. |
| Development build (Android) | `mobile/` | `npx eas-cli@latest build --profile development --platform android` | Cloud build with the dev client. Everything works, including custom haptics and Face ID. |
| Development build (iPhone) | `mobile/` | `npx eas-cli@latest build --profile development --platform ios` | Needs an Apple Developer account. |
| Shareable Android APK | `mobile/` | `npm run build:apk` | Runs `npx eas-cli@latest build --profile apk --platform android`. Same as `npx eas-cli@latest build --platform android --profile apk` in the README. Practice only; needs no server. Gives a link to the `.apk`. |
| Over-the-air update to installed APKs | `mobile/` | `npm run update:apk -- "What changed"` | Runs `node scripts/update.mjs apk`. Channel `apk`, EAS environment `preview`, Practice only. The message defaults to the last commit's subject. Code and design changes only; native changes need a new build. |
| Over-the-air update to store builds | `mobile/` | `npm run update:production -- "What changed"` | Runs `node scripts/update.mjs production`. Channel and environment `production`, Practice only. |
| Over-the-air update to preview builds | `mobile/` | `node scripts/update.mjs preview "What changed"` | No npm script. Channel and environment `preview`; not Practice only. |
| Online tester APK (live server) | `mobile/` | `npx eas-cli@latest build --profile tester-live --platform android` | Needs `EXPO_PUBLIC_API_URL` in `eas.json` and the Firebase values in the EAS `preview` environment. See [deploy/README.md](../../deploy/README.md) part D. |
| Over-the-air update to the online tester APK | `mobile/` | `npm run update:tester-live -- "What changed"` | Runs `node scripts/update.mjs tester-live`. Channel `tester-live`, EAS environment `preview`; carries the profile's server address. |
| Build the public tester site | `mobile/` | `npm run build:tester` | Runs `node scripts/build-tester.mjs`: `npx expo export --platform web` with `EXPO_PUBLIC_PRACTICE_ONLY=1` and `EXPO_PUBLIC_TESTER=1`. Writes `dist/`. Stops if `EXPO_PUBLIC_POSTHOG_KEY` is missing from `mobile/.env.local`. |
| Build and publish the tester site | `mobile/` | `npm run deploy:tester` | Runs `npm run build:tester && npx eas-cli@latest deploy --prod`. Setup and removal steps: [`mobile/src/features/tester/README.md`](../../mobile/src/features/tester/README.md). |
| Tag a release | repo (any folder) | `git tag v0.2.0` | After moving the Unreleased notes in `mobile/CHANGELOG.md` under the new version, setting the same version in `mobile/app.json`, and committing. |

## Which build or update to use

| Change | What to run |
|---|---|
| Code or design only | Commit, then `npm run update:apk -- "What changed"` (and `update:production` for store builds) |
| A new native package, a permission, the icon, the splash screen or `app.json` plugins | A new build: `npm run build:apk` (or an EAS build with the right profile). The fingerprint runtime version stops an update from reaching a build that can't run it. |
| The online tester build | `npm run update:tester-live -- "What changed"` for code; a new `tester-live` build for native changes |

## Related reading

- Environment variables and build profiles: [configuration.md](configuration.md)
- The API the apps call: [api.md](api.md)
- Putting the server online: [deploy/README.md](../../deploy/README.md) and [running-online.md](../features/running-online.md)
