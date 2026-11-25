# 08. Security review

**Status:** code review done (22 November 2026: the baseline, four independent code reviews, findings fixed); external review points fixed (24 November 2026: money-in ID gate, audit anchors, MPIN for SIP and Satellite, git history scanned), device attestation planned but open; the MobSF scans of the baseline and the new APK are left for the owner · **Owner:** Shaik and Claude · **Size:** M

## Goal

Measure the app against a recognised standard twice: a **baseline** now and a **final** check after plans 03 to 07. The difference shows what the work improved.

## Scope

- **In:** an automated APK scan with MobSF, a checklist against OWASP MASVS level L1, server checks, dependency audit, and a findings log.
- **Out:** a paid professional penetration test (needed before real money).

## Steps

1. **Baseline now:**
   - Scan the current APK with MobSF. Run it locally with Docker or use a hosted instance, upload the APK, and export the PDF report.
   - Fill in the MASVS L1 checklist (`docs/security/masvs-checklist.md`, to be created) with pass, fail or not applicable, linking each fail to a plan.
   - Run `npm audit` in the root and `mobile/`, and record high and critical findings.
2. **Server checks once it's online:** security headers, TLS rating (SSL Labs), open routes without sign-in, rate limits, and error messages.
3. **Fix** findings through plans 03 to 07, or record why each is accepted.
4. **Final:** repeat steps 1 and 2 and write a one-page before-and-after summary in `docs/security/report.md`.
5. **Decide on device integrity** (Play Integrity / App Attest). Do it if the final scan still flags tampering risk.

## Acceptance criteria

- [ ] Baseline and final MobSF reports saved under `docs/security/`.
- [ ] Every MASVS L1 item is passed, planned or explicitly accepted.
- [ ] No high or critical `npm audit` findings without a written reason.

## Who does what

- **You:** run MobSF and upload the APK; keep the reports.
- **Claude:** the checklist, analysis of the reports, and fixes.

## Review findings and fixes

Where each step stands on 22 November 2026:

| Step | Status |
|---|---|
| 1. Baseline | Done except MobSF: the MASVS checklist ([masvs-checklist.md](../security/masvs-checklist.md)) and `npm audit` are in [baseline-2026-11-22.md](../security/baseline-2026-11-22.md). |
| Code review (added to step 3) | **Done.** Four independent code reviews of the server and web app after plans 03 to 07. Every finding is fixed; the list, with severity and where, is in [security.md](../security.md#security-review-2026-11-22). In short: a phone number could be used to take over the MPIN (High), with sign-in on only a new wallet's first device is now trusted at once (High), signing a device out now ends older sign-ins (High), root no longer runs deploy scripts from the app's folder (High), OTP limits can't be used to block the owner's codes (Medium), plus new-device limits, MPIN rollback mode, KYC steps hardening, the AI consent default and upload counting. The fixes per plan are in plans [03](03-mpin.md#review-findings-and-fixes), [05](05-server-online.md#review-findings-and-fixes), [06](06-devices-alerts-otp.md#review-findings-and-fixes) and [07](07-onboarding-checks.md#review-findings-and-fixes). Two more reviews of the phone app found a lockout that could leave a live login open, an iOS reinstall that kept the last install's session (both High), and sign-out order, wrong-PIN clock, session storage, MPIN sheet and resend problems (Medium), all fixed: see [security.md](../security.md#phone-reviews) and the phone notes in plans [03](03-mpin.md#review-findings-and-fixes-phone), [04](04-phone-protection.md#review-findings-and-fixes) and [06](06-devices-alerts-otp.md#review-findings-and-fixes-phone). The MASVS checklist's Final column reflects them. |
| 2. Server checks | Waiting for the server to go online ([plan 05](05-server-online.md)). |
| 4. Final | Waiting: the **MobSF scan of the new APK is left for the owner** (steps in the [baseline report](../security/baseline-2026-11-22.md#mobsf-scan)), then the Final column of the checklist and `docs/security/report.md`. |
| 5. Device integrity | **Open.** The device id is still chosen by the client ([security.md](../security.md), gap 11). What adding Play Integrity and App Attest would take is written up in [security.md](../security.md#device-attestation-open); it waits for live store builds. |

## External review (24 November 2026)

An outside reviewer read the repository after roadmap step 8 ([roadmap](roadmap.md#external-review-24-november-2026) has every point). The security points and what was done:

| Point | What was done | Status |
|---|---|---|
| Secrets in the repository and its history | The whole git history was scanned for keys and tokens on 24 November 2026: clean. The README line about a shared key is gone. Secrets stay in `.env.local` and `/etc/vaultwise.env`. | Done; rotating the Groq key and turning on GitHub secret scanning and push protection are the owner's |
| Money moves with no MPIN: SIP set-up and Satellite opt-in | New money actions `invest_sip` (MPIN when a plan starts or moves more money, `sipNeedsMpin()` in `src/lib/invest/sip-rule.ts`) and `satellite_opt_in` (every allocation). `POST /invest/satellite/run` moves no ledger money and needs none. Web, phone and Practice ask for it the same way. | Done ([plan 03](03-mpin.md#sip-satellite-and-money-in-24-november-2026)) |
| Uneven ID gate on money in (gap 7) | One rule: money from the linked bank needs a verified ID and no MPIN (`wallet_top_up`, `vault_deposit`, `bank_simulate`, `roundup_sweep`, `moneyIn: true`); vault deposits and opening deposits are now gated (403 `kyc_required`). | Done |
| The audit chain can be rebuilt by someone with the database (gap 15) | Anchors outside the database (`src/lib/audit-anchors`): the chain's head at every start and daily, in `AUDIT_ANCHOR_FILE` and the journal; `npm run audit:verify` checks them; the nightly backup copies and checks them. | Done |
| Device ids chosen by the client (gap 11, step 5 above) | A plan: Google Play Integrity (a Google Cloud project and a verdict check on the server) and Apple App Attest / DeviceCheck, both needing store builds ([security.md](../security.md#device-attestation-open)). | **Open** |
| Checks on every change | CI on every push to `main` and every pull request (`.github/workflows/ci.yml`): server typecheck, lint, tests and build; phone typecheck, lint, tests and web export. | Done |

Each fix has tests: `tests/money-in.test.ts`, `tests/invest-money.test.ts`, `tests/audit-anchors.test.ts`, and the contract vectors in `tests/contract/vectors/` that hold the phone's Practice simulator to the server's money table. The [security overview](../security.md#external-review-2026-11-24) is updated to match.
