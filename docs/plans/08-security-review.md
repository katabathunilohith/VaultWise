# 08. Security review

**Status:** code review done (22 November 2026: the baseline, four independent code reviews, findings fixed); the MobSF scans of the baseline and the new APK are left for the owner · **Owner:** Shaik and Claude · **Size:** M

## Goal

Measure the app against a recognised standard twice: a **baseline** now and a **final** check after plans 03 to 07. The difference is evidence for the capstone report.

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
| 5. Device integrity | Not decided yet; the device id is still chosen by the client ([security.md](../security.md), gap 11). |
