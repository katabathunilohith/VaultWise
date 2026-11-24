# Security reviews

> The evidence for [plan 08](../plans/08-security-review.md): a "before" measurement now, an "after" measurement once plans 03 to 07 are done, and the difference between them.

For where security stands and the rules for changing code, read the [security overview](../security.md) first. Phone details are in [phone-security.md](../features/phone-security.md).

## What's here

| File | What it is | Status |
|---|---|---|
| [masvs-checklist.md](masvs-checklist.md) | Every OWASP MASVS v2.1.0 control with a status, the evidence in the code and the plan that fixes it. Has an empty **Final** column for the second pass. | Baseline done |
| [baseline-2026-11-22.md](baseline-2026-11-22.md) | The "before" report: summary, `npm audit` results, the top risks re-checked, new findings, and how to run MobSF. | Done, except MobSF |
| `mobsf-baseline.pdf` | MobSF's report on the baseline APK. | Waiting for the scan (steps in the [baseline report](baseline-2026-11-22.md#mobsf-scan)) |
| `mobsf-final.pdf` | MobSF's report on the APK after plans 03 to 07. | Later |
| `report.md` | The one-page before-and-after summary. | Later |

## Before and after

The comparison only means something if both passes measure the same way.

1. **Baseline (now).** Code at commit `012a9fc` plus the work already in the tree on 22 November 2026. Checklist filled in, `npm audit` recorded, MobSF run on the baseline APK.
2. **Fixes.** Plans 03 to 07 close gaps. A gap that stays open gets a written reason in the checklist instead of a fix.
3. **Final (after plans 03 to 07).** Repeat the same steps on the new code, following [How to re-run this checklist](masvs-checklist.md#how-to-re-run-this-checklist):
   - fill in the **Final** column of the checklist and its summary counts;
   - run `npm audit --json` in the root and in `mobile/` again;
   - scan the new APK with MobSF and save `mobsf-final.pdf`;
   - run the server checks (headers, SSL Labs, open routes, rate limits, error messages), which need the server from [plan 05](../plans/05-server-online.md).
4. **Report.** Write `docs/security/report.md`, one page:
   - MASVS counts before and after, overall and for L1;
   - `npm audit` high and critical counts before and after;
   - MobSF score and high findings before and after;
   - what's still open, and why each item is accepted;
   - the decision on Play Integrity and App Attest (plan 08 step 5).

## Rules for this folder

- Keep the baseline files as they are once the final pass starts. Correct a mistake with a dated note, so the "before" stays honest.
- Name new dated reports `<kind>-YYYY-MM-DD.md`.
- Link code relative to the file (from here, `../../src/...` or `../../mobile/src/...`).
- Never paste secrets, tokens or personal data into a report. MobSF PDFs can include keys found in the APK; check before sharing one outside the team.
