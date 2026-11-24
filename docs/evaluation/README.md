# Evaluating bill verification

> A reproducible, labelled test of the proof-of-purpose pipeline: does a genuine bill unlock the money, and do edited, reused, off-purpose and old bills not? Results: [verification-results.md](verification-results.md).

**Status:** offline results current (`vw-proof@1.5`); the one recorded live pass predates 1.5 and should be re-run on a fresh day's Groq quota · **Owner files:** `eval/verification/`, `docs/evaluation/`

## What it measures

The customer uploads a bill to unlock vault money. `runPipeline()` ([src/lib/verification](../../src/lib/verification/README.md)) reads it with deterministic forensics, business rules and, with the customer's consent, a Groq vision model, then approves, declines or sends it to a person. The evaluation drives that real code (no re-implementation) over a generated set of bills whose right answer is known, and counts:

- a **confusion matrix**: each class against approve / decline / review, and expected decision against actual;
- **approve, decline and review rates per class**;
- the **false-decline rate**: genuine bills declined automatically (the customer must appeal to get their own money);
- the **false-approve rate**: edited, duplicate, wrong-purpose or stale bills approved automatically (money released on a bad bill);
- the **review rate**: share of all bills that need a person;
- **per-bill reasons**, the checks that failed or warned, and the forensic signals (ELA, tamper score, purpose score).

## The dataset

`eval/verification/generate.mjs` draws bills as SVG and turns them into phone photos, scans or PNG e-receipts with `sharp` (tilt on a desk, uneven light, sensor noise, blur, JPEG quality 70–92, optional camera EXIF). Every date is relative to the day it runs, so the set never goes stale; everything else comes from a fixed seed (`0x5eed2026`), so a re-run on the same day and machine writes byte-identical files. It writes the images and `manifest.json` (labels, expected decision, the fields printed on each bill, how it was made, SHA-256) into `eval/verification/out/dataset/`, which git ignores.

| Class | n | Expected | What it is |
|---|---|---|---|
| genuine | 16 + 3 samples | approve | Recent, right purpose, plausible amount, clean capture. Hospital, pharmacy, lab, dental, tuition, school, bookshop, rent, deposit, plumbing, towing and pension bills across Health, Education, Housing, Emergency and Retirement vaults. Includes a dependant's bill (same family name), initials, a partial withdrawal, a high-resolution photo, a PNG e-receipt, a stamped bill and one 110 days old (inside the window). |
| edited | 10 + 1 sample | decline | A genuine-looking bill with a pasted patch over the total, a line item + subtotal + total (arithmetic kept consistent), the patient's name, or the date (an old bill re-dated). *Sloppy* patches use another font, pure black and a flat white box, re-saved at JPEG q92–95; *careful* ones copy the font and colour, sample the paper colour, add matching noise and keep the original quality. Two carry editor metadata (`Software: Adobe Photoshop`, and capture time 190 days before the printed date). One is re-typeset from scratch with inflated amounts (no paste at all). |
| duplicate | 6 | decline | A bill already submitted earlier in the run, sent again: byte-identical (same account, and another account), re-encoded at q60, resized to 70%, converted to PNG, and the same paper bill photographed again. |
| wrong-purpose | 7 + 1 sample | decline | Real-looking bills for something the vault doesn't cover: restaurant and coffee for Health, electronics for Education, clothing for Housing, a beach resort for Emergency, jewellery for Retirement, and two cross-category ones (a hospital bill for Education, a rent receipt for Health). |
| stale | 5 + 1 sample | review | Older than India's 120-day limit (`compliance.ts` `maxDocAgeDays`): 125, 160, 210, 300, 345 and 420 days. A failed date check never auto-approves and sends the bill to a person by design (the phone's Practice mode shows the same), so "review" is the right answer, not "decline". |

The six "samples" are the bundled bills in `mobile/assets/samples/` (copied, never changed). Their dates are printed on them (October 2026), so the generator labels them from today's date: the genuine ones become *stale* once they pass 120 days. The bundled medical invoice is left out because the bundled tampered invoice is a copy of it with the same invoice number, which would be caught as reuse rather than as an edit.

Each bill gets its own customer (India, INR) with a funded vault of the right category and a withdrawal for the bill's total (the forged total for amount edits); a re-submitted duplicate uses the original's customer unless it is the cross-account case. Bills are processed one at a time, in a seeded shuffled order, with each duplicate after its original.

## Running it

```sh
npm run eval:verification                 # offline: no network, about 4 minutes, safe for CI
npm run eval:verification -- --live       # one pass through Groq (GROQ_API_KEY in .env.local), about 25–35 minutes
```

Options: `--delay-ms <n>` pause between live calls (default 8000, to stay inside Groq's per-minute limits; the client also waits out any 429), `--no-generate` reuse the dataset already on disk, `--limit <n>` only the first n bills, `--report-only` re-render the results page from the stored JSON (runs nothing). `node eval/verification/generate.mjs` builds the dataset alone.

On Groq's free tier the **daily** token allowance ran out after 38 bills on 2026-11-24 (shared with anything else that used the key that day, such as `npm run test:ai` or the e2e suite). Bills after that are recorded as "AI read failed" and the results page shows the live numbers both for all bills and for the bills the model read. Run the live pass on a fresh day's quota.

`run.mjs` generates the dataset, then spawns `evaluate.eval.ts` through vitest (so the app's TypeScript and `@/...` imports load exactly as in the tests) once per configuration, each in a fresh throwaway database (`VAULTWISE_DATA_DIR` in the OS temp folder). For every bill it calls `validateUpload()`, `createProof()` and `runPipeline()`, as the upload route does, and reads back the verification row. `report.mjs` computes the metrics and writes [verification-results.md](verification-results.md) and `verification-results.json`. The JSON keeps the latest offline and the latest live run side by side, so an offline run never erases the live numbers.

### The three configurations

| Configuration | Mode | The bill reader | What it isolates |
|---|---|---|---|
| Oracle reader | offline | A stand-in for the vision model, swapped in with `setBillReader()`: it returns exactly what is printed on the finished image (forged values included), category score 0.9 for the bill's real purpose and 0.04 for the others, and **never** reports visual edit signs. | Forensics, duplicate detection and the business rules, given a perfect reading. Deterministic: the same dataset always gives the same fingerprint. |
| No AI | offline | None: the customer said no to the AI (`aiAllowed: false`). | What the deterministic parts decide on their own (everything else goes to a person). |
| Live | live | The real Groq vision model with consent, exactly as production calls it (`GROQ_VISION_MODEL`, default `qwen/qwen3.8-27b`). | The whole pipeline, including whether the model reads the fields right, judges the purpose, and notices edits. One pass. |

The *fingerprint* is a hash of every bill's decision, confidence, reasons and failed or warned checks. Two runs on the same dataset with the same fingerprint decided everything identically.

## Results in brief

See [verification-results.md](verification-results.md) for the tables and every bill. On the 2026-11-24 dataset (50 bills: 19 genuine, 31 bad). The offline columns are the current pipeline (`vw-proof@1.5`); **the live columns were measured earlier the same day on `vw-proof@1.4`, before the changes under [What changed](#what-changed-vw-proof15), and are kept as measured.** The live pass should be re-run on a fresh day's Groq quota.

| | Oracle reader (1.5) | No AI (1.5) | Live, all 50 (1.4) | Live, the 38 the model read (1.4) |
|---|---|---|---|---|
| Decision as expected | 37/50 (74%) | 8/50 (16%) | 28/50 (56%) | 25/38 (66%) |
| Genuine approved | 15/19 | 0/19 | 12/19 | 12/16 |
| **False declines** (genuine declined) | **0/19** | **0/19** | 3/19 (16%) | 1/16 (6%) |
| **False approvals** (bad bill approved) | 3/31 (10%) | 0/31 | 1/31 (3%) | 1/22 (5%) |
| Bad bills declined | 16/31 | 2/31 | 14/31 | 12/22 |
| Sent to a person | 16/50 (32%) | 48/50 (96%) | 20/50 (40%) | 12/38 (32%) |

- **Offline, oracle reader.** Duplicates 6/6 and wrong-purpose 8/8 declined; stale 6/6 sent to a person as designed. Genuine: 15 approved, none declined, 4 sent to a person on uncorroborated ELA (`g03`, `g11`, `g12`, `g16`). Edited: 3 approved (the careful edits and the re-typeset bill, finding 3), 2 declined (`e02`, `e07`: editing software corroborated by bad totals or a capture-date gap), 6 sent to a person.
- **Offline, no AI.** Nothing is approved, and only the 2 byte-identical copies are declined; everything else goes to a person, as the customer asked.
- **Live (`vw-proof@1.4`; Groq `qwen/qwen3.8-27b`, one pass, 8 s between bills, 2026-11-24 06:06–06:29 UTC).** Groq's free-tier **daily token limit ran out at bill 39**, so 12 bills were never read (among them the careful amount edit `e04` and the re-typeset bill `e09`); those went to a person or were declined on a hard fail that needs no model. On the 38 it read, the model got **issuer, date and total right on all 38**, and judged purpose well: genuine 12/16 approved (the other 4 are the ELA cases), wrong-purpose 6/7 declined, duplicates 2/2 declined. Edited: 1 approved (`e06`, a name swap in the bill's own font), 2 declined, 5 sent to a person. Pausing longer doesn't help with a daily limit; run it on a fresh day's quota. It ran before the split (no effect) and before fixes 8 and 9 and the 1.5 policy: on 1.5, `g03` would go to a person instead of being declined, and fix 9 would most likely have declined `w04`.

## What it revealed

These are findings on synthetic bills (see the limits below); each points at something worth checking on real ones.

1. **Error level analysis declines genuine bills with coloured letterheads.** 3 of 16 synthetic genuine bills were declined as "digitally altered" in every configuration (`g03`, `g04`, `g06`), and 3 more went to a person on ELA alone (`g11`, `g12`, `g16`); two stale bills were declined instead of reviewed for the same reason. The flagged regions are long, sharp colour or page edges, not text: the coloured accent bar, the logo, the red PAID stamp and the paper's edge against the desk. Two capture conditions trigger it: (a) a JPEG saved at quality 75–76, about the quality ELA re-saves at (75), so almost every block re-compresses with no error, the robust spread of block errors collapses towards zero (`robust()` falls back to a 1e-6 scale) and any colour edge becomes an outlier (`g04`, `g06`, `g12`, `s03`); (b) a high-quality capture (q88–91) where those edges sit at a slight angle, so their anti-aliased staircase runs across many blocks (rotated scans `g03`, `g11`, `s05`; the high-resolution photo `g16`). Neither is exotic: many apps save at quality 75–80, and scans are rarely perfectly straight. The bundled samples (quality 72, Helvetica, tilted) happen to avoid both. **Acted on in `vw-proof@1.5`** (see [What changed](#what-changed-vw-proof15)): case (a) is now "inconclusive" and ignored, and ELA on its own can no longer decline, only send to a person. Case (b) still sends genuine bills to a person; telling those edges from a pasted patch needs recalibration on real bills (ignore saturated-colour blocks, or require the cluster to overlap a field that was read).
2. **A customer who asked for a person could be declined by ELA alone.** With no AI, hard fails came before the "you asked for a person" rule, so the three false ELA positives above were declined automatically without anyone looking. **Acted on in `vw-proof@1.5`:** for that customer only non-forensic hard fails (an exact duplicate) decline; image evidence of editing goes to the person they asked for.
3. **Careful edits pass.** With a perfect reader, a consistent amount edit in the bill's own font (`e04`), a name swap in the bill's own font (`e06`) and a re-typeset bill (`e09`) were all approved; live, `e06` was approved too (the other two weren't read, see above). Only the vision model's visual judgement or arithmetic can catch them, and arithmetic only works when the forger forgets a line.
4. **Sloppy pastes are caught by arithmetic more often than by ELA.** A flat white patch in a serif font re-saved at q95 (`e01`, and the bundled tampered invoice `m06`) scored 0 on ELA; only "totals don't add up" fired, which sends the bill to a person rather than declining it. `tests/forensics.test.ts` asserts the USD rendering of the same forgery scores above 0.5, so ELA detection depends on what the patch covers. On `vw-proof@1.4` edited bills ended up mostly *reviewed* (5 of 11), not declined (3 of 11, and one of those, `e08`, is a rotated scan, which also declined genuine scans); on 1.5, 6 reviewed and 2 declined.
5. **Strong metadata evidence didn't combine.** A re-dated bill with Photoshop in `Software` *and* a capture time 191 days before the printed date (`e07`) went to review, not decline: `exifScore` took the larger of the two signals (0.7) instead of combining them, so the tamper score stopped at 0.7 (decline is at 0.8). **Acted on in `vw-proof@1.5`:** the two combine as independent evidence (0.85), and `e07` is now declined.
6. **Duplicates need the reader.** Every re-submission was declined when something read the bill (the content fingerprint matched). Without AI only the two byte-identical copies were; the re-encoded, resized, PNG and re-photographed copies went to a person (a near-identical dHash only adds a review reason).
7. **The vision model reads well but doesn't see pasted edits.** Live, it read every issuer, date and total correctly, but it reported `editing_signs` on only 3 bills (`e01`, `e10`, `m06`), each time because the totals didn't add up. It reported nothing on any pasted patch, including the sloppy ones in a serif font on a flat white box (`e03`, `e05`, `e07`). In practice the "visual edit signs" input is an arithmetic check said twice.
8. **Fixed: amounts written "Rs. 99" were read as 0.99.** `normaliseExtraction()` stripped every non-digit except "." and "-", so the dot of "Rs." stayed in front ("Rs. 500/-" became null). Found by the new stage tests, fixed in `parseAmount()`; it only affects a model answer given as text, so the offline numbers didn't move.
9. **Fixed: the keyword lexicon matched inside other words.** Live, a beach-resort bill for an Emergency vault (`w04`) went to a person instead of being declined: the model wrote "Please retain this document" into `text`, "please" contains the Housing word "lease" (weight 3, and Emergency vaults accept housing bills), and the keyword score lifted the purpose score from below 0.2 to 0.25, just past the automatic decline. Offline, "Gulab jamun" scored 32% for Health ("lab"), and "coffee" and "current" hit "fee" and "rent". `keywordScores()` now only matches a term at the start of a word (prefixes still count: "diagnos", "lab" in "laboratory"). Offline, no decision changed and two confidences moved (`w01`, `e05`).

## What changed (vw-proof@1.5)

On 2026-11-24, after the first runs, three findings were acted on in `src/lib/verification` (stage files `stages/tamper.ts`, `stages/decision.ts`, `forensics.ts`; tests in `tests/verification-stages.test.ts` and `tests/forensics.test.ts`). `PIPELINE_VERSION` went from `vw-proof@1.4` to `vw-proof@1.5`, so audit entries and `model_version` show which rules decided a bill.

1. **ELA alone never declines** (finding 1). A tamper score ≥ 0.8 declines only if a signal other than ELA backs it: editing software in the metadata, a capture time more than a week before the bill's date, totals that don't add up (a gap over 25%), edit signs reported by the vision model, or a near-identical image of an earlier proof with different content. ELA alone, however strong, adds a "Tamper evidence" warning and sends the bill to a person; it also can't tip the low-confidence rule into a decline.
2. **Inconclusive ELA is ignored** (finding 1a). When the block-error spread is zero (the image re-compresses unchanged, typically saved at JPEG quality ~75), `errorLevelAnalysis()` now reports `inconclusive: true` and the pipeline treats ELA as no evidence (an "info" check instead of a fail). On the dataset this separates cleanly: the three affected photos have a spread of exactly 0, every other bill at least 0.109. The ELA score itself is unchanged, so the KYC module, which shares the helper, behaves as before.
3. **"Asked for a person" can only send to a person** (finding 2). Hard fails now carry a kind: forensic (the tamper score) or not (exact duplicate, reused content, wrong purpose, future date, not a document). Without AI consent only non-forensic ones decline. An old bill was already a review, not a decline, and stays so.
4. **Metadata signals combine** (finding 5): editing software (0.5) and a capture-date gap (0.7) give 0.85 together, enough to decline on their own.

Offline, same dataset (`--no-generate`), before → after:

| | Oracle reader 1.4 | Oracle reader 1.5 | No AI 1.4 | No AI 1.5 |
|---|---|---|---|---|
| Decision as expected | 34/50 (68%) | 37/50 (74%) | 8/50 (16%) | 8/50 (16%) |
| Genuine approved | 13/19 | 15/19 | 0/19 | 0/19 |
| **False declines** | 3/19 (16%) | **0/19** | 3/19 (16%) | **0/19** |
| **False approvals** | 3/31 (10%) | 3/31 (10%) | 0/31 | 0/31 |
| Bad bills declined | 19/31 | 16/31 | 6/31 | 2/31 |
| Sent to a person | 12/50 (24%) | 16/50 (32%) | 41/50 (82%) | 48/50 (96%) |
| Fingerprint | `5e441defcd6ced44` | `1e2c43a496766f49` | `56bc4737a4a1d0c2` | `4be6d4d9e598020f` |

Bills whose decision changed (oracle reader):

| Bill | Class | 1.4 | 1.5 | Why |
|---|---|---|---|---|
| `g04-dental-stamped`, `g06-tuition-dependant` | genuine | decline | **approve** | Saved at q75: ELA inconclusive, nothing else wrong |
| `g03-lab-scan` | genuine | decline | review | Rotated scan: ELA 100% but uncorroborated |
| `s03-rent-210d-exif` | stale | decline | review | ELA inconclusive; the failed date check sends it to a person, as designed |
| `s05-repair-420d` | stale | decline | review | ELA uncorroborated; date check → person |
| `e07-date-sloppy-exif` | edited | review | **decline** | Editing software + capture 191 days before the printed date now combine |
| `e05-name-sloppy` | edited | decline | review | The cost: a real paste caught by ELA alone now needs a person |
| `e08-date-careful` | edited | decline | review | Its ELA hit was the rotated-scan effect that also hits genuine scans |

No AI: the same seven bills that were declined on ELA (`g03`, `g04`, `g06`, `s03`, `s05`, `e05`, `e08`) now go to the person the customer asked for; only the two byte-identical copies are declined.

The trade-off is explicit: false declines fall from 3 to 0 and every stale bill now reaches a person as designed, for one true decline lost (`e05`, now reviewed rather than declined). No bad bill is approved that wasn't before. The perceptual-reuse corroborator never fired on this dataset; note that a recurring bill from the same template (monthly rent) can look near-identical to last month's, so it should be watched on real data.

## Limits

- **Synthetic bills are not real-world edits.** The bills are clean vector drawings with simulated capture; real photos have perspective, glare, folds, thermal-paper fade and handwriting, and real forgers use other tools. The ELA findings in particular depend on how the synthetic images were saved. Treat every rate as a pointer, not a measurement of production accuracy.
- **Small n.** 50 bills, 11 edited: one bill moves a class rate by 5–17 points. There are no confidence intervals.
- **The oracle reader is generous and blind.** It reads every field perfectly and gives the right category 0.9, so offline wrong-purpose and duplicate results mostly test the rules' arithmetic, not the AI; and it never reports edit signs, so offline edit detection is forensics-only. The live run is the honest test of the model, on one pass (the model can answer differently on another day).
- **One market.** India only (INR, 120-day limit, Indian issuers and names). No custom vaults (a person always approves those), no emergency receipts, no HEIC.
- **Fonts and dates.** Fonts come from the OS (Arial, Verdana, Segoe UI, Times New Roman and Courier New on Windows), so another machine draws slightly different pixels; and dates move with the run date. The labels stay correct; exact fingerprints are comparable only for the same dataset (same day, same machine, or `--no-generate`).
- **Order matters for duplicates.** Reuse is detected against earlier proofs in the same run, as in production.

## Refactor check

`runPipeline()` was split from one 530-line function into a stage per file (`src/lib/verification/stages/`, see its [README](../../src/lib/verification/README.md)) on 2026-11-24. The offline evaluation was run on the same dataset before and after (`--no-generate`): every field of every bill except timings was identical in both offline configurations.

| Configuration | Before the split | After the split |
|---|---|---|
| Oracle reader | `fa91324a6373d85c` | `fa91324a6373d85c` |
| No AI | `56bc4737a4a1d0c2` | `56bc4737a4a1d0c2` |

All existing tests passed before and after. Changes after the check: `parseAmount()` (finding 8) left both fingerprints unchanged; the keyword fix (finding 9) moved two confidences in the oracle configuration (`5e441defcd6ced44`, no decision changed); the `vw-proof@1.5` policy changed decisions on purpose ([What changed](#what-changed-vw-proof15); now `1e2c43a496766f49` and `4be6d4d9e598020f`).

## Files

| File | What it holds |
|---|---|
| [eval/verification/generate.mjs](../../eval/verification/generate.mjs) | Bill templates, capture and edit simulation, the item list, the manifest |
| [eval/verification/evaluate.eval.ts](../../eval/verification/evaluate.eval.ts) | Runs the real pipeline over the dataset for one configuration; the oracle reader |
| [eval/verification/report.mjs](../../eval/verification/report.mjs) | Metrics, fingerprint, the results page |
| [eval/verification/run.mjs](../../eval/verification/run.mjs) | `npm run eval:verification`: generate, run each configuration, report |
| [eval/verification/vitest.config.mts](../../eval/verification/vitest.config.mts), [setup.ts](../../eval/verification/setup.ts) | Runs the evaluation with the app's imports in a throwaway database (not part of `npx vitest run`) |
| `eval/verification/out/` | Generated dataset and raw runs (git-ignored) |
