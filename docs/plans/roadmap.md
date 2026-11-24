# Roadmap

> What's next, in order, and why. Each step has its own plan file with the design, changes, tests and acceptance criteria.

## Principles behind the order

1. Fix the most dangerous gap before adding anything visible.
2. Build what later steps depend on first.
3. Batch native changes into one APK rebuild, so everything after it ships over the air.
4. Don't put the server online until the money paths are protected.
5. Measure at the start and the end, so the capstone report can show the improvement.

## Steps

| # | Step | Why here | Size | Status |
|---|---|---|---|---|
| 0 | Commit work, versioning and over-the-air updates | Everything after it is traceable and shippable | M | **Done** |
| 1 | [Practice data saved on the phone](01-practice-data-saved.md) | Testers stop losing their work; no risk | M | **Done** (tested in the browser; not yet on a phone) |
| 2 | [Prepare the one-time APK rebuild](02-apk-rebuild-prep.md) | Native packages for steps 3, 4 and 6 go in now, so later steps need no reinstall | S | **Built** (the APK build itself is yours: needs `google-services.json` first) |
| 3 | [MPIN checked by the server](03-mpin.md) | Biggest real gap: money can move without a PIN | L | **Done** (server, web and phone) |
| 4 | [Phone-side protection](04-phone-protection.md) | Closes known phone gaps; builds on the MPIN screens | M | **Done** (checked in the browser; screenshot blocking, root check and Face ID need a real phone) |
| 5 | [Server online](05-server-online.md) | Real accounts and shared data, once money paths are safe | L | **Built** (hardening and `deploy/` scripts done; putting it on AWS is yours) |
| 6 | [Registered devices, alerts and phone OTP](06-devices-alerts-otp.md) | UPI-style protection against stolen passwords; needs the server online | L | **Done** (test-mode codes; real SMS needs a Twilio account) |
| 7 | [Onboarding checks in test mode](07-onboarding-checks.md) | PAN, Aadhaar via DigiLocker and bank checks, through licensed sandboxes | L | **Done** (test provider; Setu adapter written from the docs, needs sandbox keys to try) |
| 8 | [Security review](08-security-review.md) | "Before" scan now, "after" scan at the end, against OWASP MASVS | M | **Code review done** (baseline, four independent reviews, findings fixed); the MobSF scans of the APK are yours |
| 9 | [Move to PostgreSQL](09-postgres.md) | Only when one server isn't enough | L | Later (on purpose: SQLite until the end) |

## Dependencies

```mermaid
flowchart LR
  S1[1 Practice save] --> S2[2 APK rebuild]
  S2 --> S3[3 MPIN]
  S3 --> S4[4 Phone protection]
  S3 --> S5[5 Server online]
  S4 --> S5
  S5 --> S6[6 Devices, alerts, OTP]
  S5 --> S7[7 Onboarding checks]
  S8a[8 Baseline scan] -.-> S3
  S6 --> S8b[8 Final scan]
  S7 --> S8b
  S5 -.-> S9[9 PostgreSQL, later]
```

## What only you can do

| Step | You need to |
|---|---|
| 2 | Add Firebase's `google-services.json` to `mobile/` (for push notifications), log in to Expo (`npx eas-cli@latest login`) and run `npm run build:apk`, then share the APK |
| 5 | Follow [deploy/README.md](../../deploy/README.md): AWS account and Lightsail server, a domain, Firebase sign-in, `/etc/vaultwise.env`, then set `EXPO_PUBLIC_API_URL` in the `tester-live` profile of `mobile/eas.json`. Replace the contact address in `src/components/legal/config.ts` |
| 6 | For real texts, a Twilio account (`OTP_MODE=twilio` and the `TWILIO_` values). Until then `OTP_MODE=test` shows the code in the app |
| 7 | Setu sandbox keys (`KYC_CHECKS_PROVIDER=setu`, the `SETU_` values) to try the real checks; `KYC_FLOW=steps` turns the steps on for India |
| 8 | Install MobSF (Docker) or use its hosted scanner, and scan the new APK; record the result next to [the baseline](../security/baseline-2026-11-22.md) |

## External review (24 November 2026)

An outside reviewer read the repository after step 8. What was done about each point:

| Point | Status |
|---|---|
| Rotate the Groq key, scan git history, enable secret scanning | History scanned: clean. The README line is gone. Rotating the key and turning on GitHub secret scanning are yours (below). |
| README out of date; screenshots, diagram, live link | Rewritten with screenshots and an architecture diagram; the live link waits for step 5's deploy. |
| Package name, releases, CI, `engines` | Package `vaultwise`, version 0.2.0, release sections in both changelogs, `.github/workflows/ci.yml`, Node 22.18 or later. Tags are yours (below). |
| Open bugs: stale sample dates, live Yahoo in tests, shared strategies, SIP/Satellite with no MPIN | Fixed (B20, B21, B9, `invest_sip` / `satellite_opt_in`). |
| Phone test runner and contract tests | Jest in `mobile/`, shared vectors in `tests/contract/` (they found and fixed four Practice drifts). |
| Split big files | `runPipeline`, `limits.ts` and `recovery/service.ts` split, no behaviour change; the split found six real bugs, all fixed. |
| Open security items | Money-in ID gating and audit anchoring fixed. Device attestation (Play Integrity / App Attest) stays open: see [security.md](../security.md). |
| Evaluation of the verification pipeline | `npm run eval:verification` with results in [docs/evaluation](../evaluation/README.md). |
| How this was built; walkthroughs; demo backup | [how-this-was-built.md](../how-this-was-built.md), [walkthroughs](../walkthroughs/), [demo-script.md](../demo-script.md). |
| Smaller commits | From now on: one change per commit ([development process](../process/development-process.md)). |

Left for you: rotate the Groq key; turn on secret scanning and push protection (GitHub → Settings → Code security); fill in the repository's About box; tag `v0.1.0` on `012a9fc` and `v0.2.0` on the commit that releases this round; deploy (step 5) and build the tester APK; run the MobSF after-scan; try Setu and Twilio in their sandboxes; re-run `npm run eval:verification -- --live` on a fresh day's Groq quota; record a backup video of the demo.

## Keeping this current

When a step finishes, mark it **Done** here, record what was built in the matching feature doc, and add a line to `mobile/CHANGELOG.md` under **Unreleased**.
