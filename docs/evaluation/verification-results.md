# Verification evaluation: results

> Written by `npm run eval:verification` (offline) and `npm run eval:verification -- --live`. Do not edit by hand: re-run instead. Method, classes and limits: [README.md](README.md). Every number, check and reason: [verification-results.json](verification-results.json).

Expected decisions: genuine → approve; edited, duplicate and wrong-purpose → decline; stale (older than the market's limit) → review, because a failed date check sends a bill to a person by design. A *false decline* is a genuine bill declined automatically; a *false approval* is any non-genuine bill approved automatically.

## Headline

| | Offline · oracle reader | Offline · no AI (customer said no) | Live · Groq vision model | Live · only bills the AI read |
|---|---|---|---|---|
| Run | 2026-11-24 · `97436ec+uncommitted` | 2026-11-24 · `97436ec+uncommitted` | 2026-11-24 · `97436ec+uncommitted` | 2026-11-24 · `97436ec+uncommitted` |
| Bills | 50 | 50 | 50 | 38 |
| Decision as expected | 37/50 (74%) | 8/50 (16%) | 28/50 (56%) | 25/38 (66%) |
| Genuine approved | 15/19 (79%) | 0/19 (0%) | 12/19 (63%) | 12/16 (75%) |
| **False declines** (genuine declined) | 0/19 (0%) | 0/19 (0%) | 3/19 (16%) | 1/16 (6%) |
| **False approvals** (bad bill approved) | 3/31 (10%) | 0/31 (0%) | 1/31 (3%) | 1/22 (5%) |
| Bad bills declined | 16/31 (52%) | 2/31 (6%) | 14/31 (45%) | 12/22 (55%) |
| Sent to a person | 16/50 (32%) | 48/50 (96%) | 20/50 (40%) | 12/38 (32%) |
| AI read failed | n/a | n/a | 12 | 0 |
| Fingerprint | `1e2c43a496766f49` | `4be6d4d9e598020f` | `2ef1c84efc2a4244` | `915de9c0ad121b4b` |

> **Not like for like:** the live columns were measured on pipeline `vw-proof@1.4` (2026-11-24), before the changes under "What changed" in [README.md](README.md); the offline columns on `vw-proof@1.5`. Re-run the live pass on a fresh day's Groq quota to compare.

## Offline · oracle reader

- Run 2026-11-24 06:44 UTC · commit `97436ec+uncommitted` · pipeline `vw-proof@1.5`
- Reader: oracle stub (prints-what-is-on-the-bill, no edit judgement)
- Market IN: approve at ≥ 0.85, decline at ≤ 0.35, documents up to 120 days old
- Dataset generated for 2026-11-24, seed `0x5eed2026` · fingerprint `1e2c43a496766f49`

### Decisions by class

| Class | Expected | n | approve | decline | review | as expected |
|---|---|---|---|---|---|---|
| genuine | approve | 19 | 79% (15) | 0% (0) | 21% (4) | 15/19 (79%) |
| edited | decline | 11 | 27% (3) | 18% (2) | 55% (6) | 2/11 (18%) |
| duplicate | decline | 6 | 0% (0) | 100% (6) | 0% (0) | 6/6 (100%) |
| wrong-purpose | decline | 8 | 0% (0) | 100% (8) | 0% (0) | 8/8 (100%) |
| stale | review | 6 | 0% (0) | 0% (0) | 100% (6) | 6/6 (100%) |

### Expected vs actual decision

| expected ↓ / actual → | approve | decline | review |
|---|---|---|---|
| approve | **15** | 0 | 4 |
| decline | 3 | **16** | 6 |
| review | 0 | 0 | **6** |

False declines: none. False approvals: `e06-name-careful`, `e09-fabricated-retyped`, `e04-amount-consistent-careful`.

### Per bill

In processing order. ELA = error-level-analysis score ("inconcl." = the image re-compresses unchanged, so ELA is ignored). T = combined tamper score; at ≥ 0.8 it declines (from `vw-proof@1.5`: only with a signal other than ELA, and never for a customer who asked for a person).

| # | Bill | Class | Expected | Actual | Conf. | ELA / T | Why |
|---|---|---|---|---|---|---|---|
| 1 | `g13-towing` | genuine | approve | approve | 0.9663 | 0 / 0 | High confidence (97%) that this repair invoice supports the withdrawal |
| 2 | `w01-restaurant-health` | wrong-purpose | decline | decline | 0.6445 | 0 / 0 | The document doesn't match the Health / Medical purpose |
| 3 | `w04-resort-emergency` | wrong-purpose | decline | decline | 0.6085 | 0.3 / 0.255 | The document doesn't match the Emergency (general) purpose |
| 4 | `g05-hospital-110d` | genuine | approve | approve | 0.9722 | 0 / 0 | High confidence (97%) that this medical invoice supports the withdrawal |
| 5 | `g07-school-scan` | genuine | approve | approve | 0.9504 | 0 / 0 | High confidence (95%) that this school fee receipt supports the withdrawal |
| 6 | `g11-rent-initials` | genuine | approve | **review** ✗ | 0.8834 | 0.4 / 0.34 | Name on document: "V. Rao" shares the account holder's surname — likely a dependant · Error level analysis: Anomaly 40% · largest inconsistent region 18 blocks of 1635 |
| 7 | `g10-deposit-ereceipt` | genuine | approve | approve | 0.9632 | 0.05 / 0.042 | High confidence (96%) that this deposit invoice supports the withdrawal |
| 8 | `e05-name-sloppy` | edited | decline | **review** ✗ | 0.8021 | 1 / 0.85 | Error level analysis: Anomaly 100% · largest inconsistent region 46 blocks of 2190 · Tamper evidence: Error level analysis alone (100%) with nothing to corroborate it, s… |
| 9 | `m04-sample-coffee` | wrong-purpose | decline | decline | 0.6445 | 0 / 0 | The document doesn't match the Health / Medical purpose |
| 10 | `e03-amount-consistent-sloppy` | edited | decline | **review** ✗ | 0.8192 | 0.9 / 0.765 | Error level analysis: Anomaly 90% · largest inconsistent region 28 blocks of 2277 |
| 11 | `g14-hospital-emergency-vault` | genuine | approve | approve | 0.9352 | 0.1 / 0.085 | High confidence (94%) that this medical invoice supports the withdrawal |
| 12 | `g08-bookstore-receipt` | genuine | approve | approve | 0.947 | 0 / 0 | High confidence (95%) that this retail receipt supports the withdrawal |
| 13 | `s05-repair-420d` | stale | review | review | 0.7147 | 1 / 0.85 | Document date: 420 days old (policy: 120) · Error level analysis: Anomaly 100% · largest inconsistent region 56 blocks of 1777 |
| 14 | `e01-total-sloppy` | edited | decline | **review** ✗ | 0.8522 | 0 / 0.6 | Totals add up: Line items sum to 8960.00 but the total reads 28670.00 |
| 15 | `g03-lab-scan` | genuine | approve | **review** ✗ | 0.7995 | 1 / 0.85 | Error level analysis: Anomaly 100% · largest inconsistent region 46 blocks of 1707 · Tamper evidence: Error level analysis alone (100%) with nothing to corroborate it, s… |
| 16 | `e08-date-careful` | edited | decline | **review** ✗ | 0.7726 | 1 / 0.85 | Name on document: "Kabir Siddiqui" shares the account holder's surname — likely a dependant · Error level analysis: Anomaly 100% · largest inconsistent region 45 blocks … |
| 17 | `g15-pension-statement` | genuine | approve | approve | 0.9717 | 0 / 0 | High confidence (97%) that this pension statement supports the withdrawal |
| 18 | `s03-rent-210d-exif` | stale | review | review | 0.8918 | inconcl. / 0 | Document date: 210 days old (policy: 120) |
| 19 | `m02-sample-rent` | genuine | approve | approve | 0.9722 | 0 / 0 | High confidence (97%) that this rent receipt supports the withdrawal |
| 20 | `e10-total-careful-receipt` | edited | decline | **review** ✗ | 0.8518 | 0 / 0.6 | Totals add up: Line items sum to 547.57 but the total reads 2450.00 |
| 21 | `g12-plumbing-repair` | genuine | approve | **review** ✗ | 0.8824 | 0.45 / 0.383 | Error level analysis: Anomaly 45% · largest inconsistent region 19 blocks of 2352 |
| 22 | `w02-electronics-education` | wrong-purpose | decline | decline | 0.6595 | 0 / 0 | The document doesn't match the Education purpose |
| 23 | `m06-sample-tampered` | edited | decline | **review** ✗ | 0.8522 | 0 / 0.6 | Totals add up: Line items sum to 23800.00 but the total reads 103800.00 |
| 24 | `m01-sample-pharmacy` | genuine | approve | approve | 0.971 | 0 / 0 | High confidence (97%) that this pharmacy receipt supports the withdrawal |
| 25 | `g16-lab-hires` | genuine | approve | **review** ✗ | 0.869 | 0.6 / 0.51 | Error level analysis: Anomaly 60% · largest inconsistent region 22 blocks of 4038 |
| 26 | `w07-jewellery-retirement` | wrong-purpose | decline | decline | 0.6595 | 0 / 0 | The document doesn't match the Retirement purpose |
| 27 | `e07-date-sloppy-exif` | edited | decline | decline | 0.8018 | 0 / 0.85 | Strong signs that the document was digitally altered |
| 28 | `d05-png-screenshot` | duplicate | decline | decline | 0.8824 | 0.45 / 0.383 | This document was already used to justify another withdrawal |
| 29 | `g09-rent-photo` | genuine | approve | approve | 0.961 | 0.05 / 0.042 | High confidence (96%) that this rent receipt supports the withdrawal |
| 30 | `g02-pharmacy-receipt` | genuine | approve | approve | 0.9714 | 0 / 0 | High confidence (97%) that this pharmacy receipt supports the withdrawal |
| 31 | `m05-sample-old` | stale | review | review | 0.8922 | 0 / 0 | Document date: 345 days old (policy: 120) |
| 32 | `d03-reencoded` | duplicate | decline | decline | 0.9714 | 0 / 0 | This document was already used to justify another withdrawal |
| 33 | `w05-hospital-education` | wrong-purpose | decline | decline | 0.6595 | 0 / 0 | The document doesn't match the Education purpose |
| 34 | `s04-pharmacy-300d` | stale | review | review | 0.8914 | 0 / 0 | Document date: 300 days old (policy: 120) |
| 35 | `g01-hospital-photo` | genuine | approve | approve | 0.972 | 0 / 0 | High confidence (97%) that this medical invoice supports the withdrawal |
| 36 | `s02-tuition-160d` | stale | review | review | 0.8676 | 0 / 0 | Document date: 160 days old (policy: 120) · Name on document: "Anika Bose" shares the account holder's surname — likely a dependant |
| 37 | `w03-clothing-housing` | wrong-purpose | decline | decline | 0.6595 | 0 / 0 | The document doesn't match the Housing / Rent purpose |
| 38 | `e06-name-careful` | edited | decline | **approve** ✗ | 0.9714 | 0 / 0 | High confidence (97%) that this repair invoice supports the withdrawal |
| 39 | `e09-fabricated-retyped` | edited | decline | **approve** ✗ | 0.9721 | 0 / 0 | High confidence (97%) that this deposit invoice supports the withdrawal |
| 40 | `e02-total-sloppy-photoshop` | edited | decline | decline | 0.8076 | 0 / 0.8 | Strong signs that the document was digitally altered |
| 41 | `s01-hospital-125d` | stale | review | review | 0.8922 | 0 / 0 | Document date: 125 days old (policy: 120) |
| 42 | `g06-tuition-dependant` | genuine | approve | approve | 0.9447 | inconcl. / 0 | High confidence (94%) that this tuition invoice supports the withdrawal |
| 43 | `e04-amount-consistent-careful` | edited | decline | **approve** ✗ | 0.9552 | 0.1 / 0.085 | High confidence (96%) that this medical invoice supports the withdrawal |
| 44 | `d04-resized` | duplicate | decline | decline | 0.9447 | 0 / 0 | This document was already used to justify another withdrawal |
| 45 | `m03-sample-tuition` | genuine | approve | approve | 0.9469 | 0 / 0 | High confidence (95%) that this tuition invoice supports the withdrawal |
| 46 | `w06-rent-health` | wrong-purpose | decline | decline | 0.6595 | 0 / 0 | The document doesn't match the Health / Medical purpose |
| 47 | `g04-dental-stamped` | genuine | approve | approve | 0.972 | inconcl. / 0 | High confidence (97%) that this medical invoice supports the withdrawal |
| 48 | `d06-rephotographed` | duplicate | decline | decline | 0.972 | 0 / 0 | This document was already used to justify another withdrawal |
| 49 | `d01-exact-resubmit` | duplicate | decline | decline | 0.972 | 0 / 0 | This exact file was already used as proof |
| 50 | `d02-exact-other-account` | duplicate | decline | decline | 0.9285 | 0.05 / 0.042 | This exact file was already used as proof |

## Offline · no AI (customer said no)

- Run 2026-11-24 06:45 UTC · commit `97436ec+uncommitted` · pipeline `vw-proof@1.5`
- Reader: none (customer said no to the AI)
- Market IN: approve at ≥ 0.85, decline at ≤ 0.35, documents up to 120 days old
- Dataset generated for 2026-11-24, seed `0x5eed2026` · fingerprint `4be6d4d9e598020f`

### Decisions by class

| Class | Expected | n | approve | decline | review | as expected |
|---|---|---|---|---|---|---|
| genuine | approve | 19 | 0% (0) | 0% (0) | 100% (19) | 0/19 (0%) |
| edited | decline | 11 | 0% (0) | 0% (0) | 100% (11) | 0/11 (0%) |
| duplicate | decline | 6 | 0% (0) | 33% (2) | 67% (4) | 2/6 (33%) |
| wrong-purpose | decline | 8 | 0% (0) | 0% (0) | 100% (8) | 0/8 (0%) |
| stale | review | 6 | 0% (0) | 0% (0) | 100% (6) | 6/6 (100%) |

### Expected vs actual decision

| expected ↓ / actual → | approve | decline | review |
|---|---|---|---|
| approve | **0** | 0 | 19 |
| decline | 0 | **2** | 23 |
| review | 0 | 0 | **6** |

False declines: none. False approvals: none.

### Per bill

In processing order. ELA = error-level-analysis score ("inconcl." = the image re-compresses unchanged, so ELA is ignored). T = combined tamper score; at ≥ 0.8 it declines (from `vw-proof@1.5`: only with a signal other than ELA, and never for a customer who asked for a person).

| # | Bill | Class | Expected | Actual | Conf. | ELA / T | Why |
|---|---|---|---|---|---|---|---|
| 1 | `g13-towing` | genuine | approve | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 2 | `w01-restaurant-health` | wrong-purpose | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 3 | `w04-resort-emergency` | wrong-purpose | decline | **review** ✗ | 0.529 | 0.3 / 0.255 | You asked for a person to read this instead of the AI, so a person will check it |
| 4 | `g05-hospital-110d` | genuine | approve | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 5 | `g07-school-scan` | genuine | approve | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 6 | `g11-rent-initials` | genuine | approve | **review** ✗ | 0.512 | 0.4 / 0.34 | You asked for a person to read this instead of the AI, so a person will check it |
| 7 | `g10-deposit-ereceipt` | genuine | approve | **review** ✗ | 0.5715 | 0.05 / 0.042 | You asked for a person to read this instead of the AI, so a person will check it |
| 8 | `e05-name-sloppy` | edited | decline | **review** ✗ | 0.41 | 1 / 0.85 | You asked for a person to read this instead of the AI, so a person will check it |
| 9 | `m04-sample-coffee` | wrong-purpose | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 10 | `e03-amount-consistent-sloppy` | edited | decline | **review** ✗ | 0.427 | 0.9 / 0.765 | You asked for a person to read this instead of the AI, so a person will check it |
| 11 | `g14-hospital-emergency-vault` | genuine | approve | **review** ✗ | 0.563 | 0.1 / 0.085 | You asked for a person to read this instead of the AI, so a person will check it |
| 12 | `g08-bookstore-receipt` | genuine | approve | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 13 | `s05-repair-420d` | stale | review | review | 0.41 | 1 / 0.85 | You asked for a person to read this instead of the AI, so a person will check it |
| 14 | `e01-total-sloppy` | edited | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 15 | `g03-lab-scan` | genuine | approve | **review** ✗ | 0.41 | 1 / 0.85 | You asked for a person to read this instead of the AI, so a person will check it |
| 16 | `e08-date-careful` | edited | decline | **review** ✗ | 0.41 | 1 / 0.85 | You asked for a person to read this instead of the AI, so a person will check it |
| 17 | `g15-pension-statement` | genuine | approve | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 18 | `s03-rent-210d-exif` | stale | review | review | 0.58 | inconcl. / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 19 | `m02-sample-rent` | genuine | approve | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 20 | `e10-total-careful-receipt` | edited | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 21 | `g12-plumbing-repair` | genuine | approve | **review** ✗ | 0.5035 | 0.45 / 0.383 | You asked for a person to read this instead of the AI, so a person will check it |
| 22 | `w02-electronics-education` | wrong-purpose | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 23 | `m06-sample-tampered` | edited | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 24 | `m01-sample-pharmacy` | genuine | approve | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 25 | `g16-lab-hires` | genuine | approve | **review** ✗ | 0.478 | 0.6 / 0.51 | You asked for a person to read this instead of the AI, so a person will check it |
| 26 | `w07-jewellery-retirement` | wrong-purpose | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 27 | `e07-date-sloppy-exif` | edited | decline | **review** ✗ | 0.48 | 0 / 0.5 | You asked for a person to read this instead of the AI, so a person will check it |
| 28 | `d05-png-screenshot` | duplicate | decline | **review** ✗ | 0.5035 | 0.45 / 0.383 | You asked for a person to read this instead of the AI, so a person will check it |
| 29 | `g09-rent-photo` | genuine | approve | **review** ✗ | 0.5715 | 0.05 / 0.042 | You asked for a person to read this instead of the AI, so a person will check it |
| 30 | `g02-pharmacy-receipt` | genuine | approve | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 31 | `m05-sample-old` | stale | review | review | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 32 | `d03-reencoded` | duplicate | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it · Looks like a previously submitted document |
| 33 | `w05-hospital-education` | wrong-purpose | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 34 | `s04-pharmacy-300d` | stale | review | review | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 35 | `g01-hospital-photo` | genuine | approve | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 36 | `s02-tuition-160d` | stale | review | review | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 37 | `w03-clothing-housing` | wrong-purpose | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 38 | `e06-name-careful` | edited | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 39 | `e09-fabricated-retyped` | edited | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 40 | `e02-total-sloppy-photoshop` | edited | decline | **review** ✗ | 0.48 | 0 / 0.5 | You asked for a person to read this instead of the AI, so a person will check it |
| 41 | `s01-hospital-125d` | stale | review | review | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 42 | `g06-tuition-dependant` | genuine | approve | **review** ✗ | 0.58 | inconcl. / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 43 | `e04-amount-consistent-careful` | edited | decline | **review** ✗ | 0.563 | 0.1 / 0.085 | You asked for a person to read this instead of the AI, so a person will check it |
| 44 | `d04-resized` | duplicate | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 45 | `m03-sample-tuition` | genuine | approve | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 46 | `w06-rent-health` | wrong-purpose | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 47 | `g04-dental-stamped` | genuine | approve | **review** ✗ | 0.58 | inconcl. / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 48 | `d06-rephotographed` | duplicate | decline | **review** ✗ | 0.58 | 0 / 0 | You asked for a person to read this instead of the AI, so a person will check it |
| 49 | `d01-exact-resubmit` | duplicate | decline | decline | 0.58 | 0 / 0 | This exact file was already used as proof |
| 50 | `d02-exact-other-account` | duplicate | decline | decline | 0.5715 | 0.05 / 0.042 | This exact file was already used as proof |

## Live · Groq vision model

- Run 2026-11-24 06:06 UTC · commit `97436ec+uncommitted` · pipeline `vw-proof@1.4`
- Reader: Groq qwen/qwen3.8-27b · 8s pause between bills
- Market IN: approve at ≥ 0.85, decline at ≤ 0.35, documents up to 120 days old
- Dataset generated for 2026-11-24, seed `0x5eed2026` · fingerprint `2ef1c84efc2a4244`

### Decisions by class

| Class | Expected | n | approve | decline | review | as expected |
|---|---|---|---|---|---|---|
| genuine | approve | 19 | 63% (12) | 16% (3) | 21% (4) | 12/19 (63%) |
| edited | decline | 11 | 9% (1) | 18% (2) | 73% (8) | 2/11 (18%) |
| duplicate | decline | 6 | 0% (0) | 67% (4) | 33% (2) | 4/6 (67%) |
| wrong-purpose | decline | 8 | 0% (0) | 75% (6) | 25% (2) | 6/8 (75%) |
| stale | review | 6 | 0% (0) | 33% (2) | 67% (4) | 4/6 (67%) |

The model's answer was missing for 12 bills (the AI provider's daily usage limit has been reached, from bill 39 on). Those went to a person, or were declined on a hard fail that doesn't need the model (exact duplicate, ELA), so the table above mixes both. The bills the model did read:

#### Decisions by class, bills the AI read

| Class | Expected | n | approve | decline | review | as expected |
|---|---|---|---|---|---|---|
| genuine | approve | 16 | 75% (12) | 6% (1) | 19% (3) | 12/16 (75%) |
| edited | decline | 8 | 13% (1) | 25% (2) | 63% (5) | 2/8 (25%) |
| duplicate | decline | 2 | 0% (0) | 100% (2) | 0% (0) | 2/2 (100%) |
| wrong-purpose | decline | 7 | 0% (0) | 86% (6) | 14% (1) | 6/7 (86%) |
| stale | review | 5 | 0% (0) | 40% (2) | 60% (3) | 3/5 (60%) |

### Expected vs actual decision

| expected ↓ / actual → | approve | decline | review |
|---|---|---|---|
| approve | **12** | 3 | 4 |
| decline | 1 | **12** | 12 |
| review | 0 | 2 | **4** |

False declines: `g03-lab-scan`, `g06-tuition-dependant`, `g04-dental-stamped`. False approvals: `e06-name-careful`. AI read failed on: `e09-fabricated-retyped`, `e02-total-sloppy-photoshop`, `s01-hospital-125d`, `g06-tuition-dependant`, `e04-amount-consistent-careful`, `d04-resized`, `m03-sample-tuition`, `w06-rent-health`, `g04-dental-stamped`, `d06-rephotographed`, `d01-exact-resubmit`, `d02-exact-other-account`.

### Per bill

In processing order. ELA = error-level-analysis score ("inconcl." = the image re-compresses unchanged, so ELA is ignored). T = combined tamper score; at ≥ 0.8 it declines (from `vw-proof@1.5`: only with a signal other than ELA, and never for a customer who asked for a person).

| # | Bill | Class | Expected | Actual | Conf. | ELA / T | What the AI read | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | `g13-towing` | genuine | approve | approve | 0.955 | 0 / 0 | repair_invoice, 2026-11-23, 6395.6, fit 0.95, 0 edit sign(s) | High confidence (95%) that this repair invoice supports the withdrawal |
| 2 | `w01-restaurant-health` | wrong-purpose | decline | decline | 0.6629 | 0 / 0 | retail_receipt, 2026-11-22, 1533, fit 0.00, 0 edit sign(s) | The document doesn't match the Health / Medical purpose |
| 3 | `w04-resort-emergency` | wrong-purpose | decline | **review** ✗ | 0.6852 | 0.3 / 0.255 | hotel_invoice, 2026-11-12, 31348.8, fit 0.10, 0 edit sign(s) | Matches Emergency (general): Model 10% · keywords 68% (lease) · Error level analysis: Anomaly 30% · largest inconsistent region 16 blocks of 1679 |
| 4 | `g05-hospital-110d` | genuine | approve | approve | 0.9871 | 0 / 0 | medical_invoice, 2026-08-06, 3190, fit 1.00, 0 edit sign(s) | High confidence (99%) that this medical invoice supports the withdrawal |
| 5 | `g07-school-scan` | genuine | approve | approve | 0.9787 | 0 / 0 | tuition_invoice, 2026-10-25, 46610, fit 1.00, 0 edit sign(s) | High confidence (98%) that this tuition invoice supports the withdrawal |
| 6 | `g11-rent-initials` | genuine | approve | **review** ✗ | 0.9117 | 0.4 / 0.34 | rent_receipt, 2026-10-15, 20150, fit 1.00, 0 edit sign(s) | Name on document: "V. Rao" shares the account holder's surname — likely a dependant · Error level analysis: Anomaly 40% · largest inconsistent region 18 blocks of 1635 |
| 7 | `g10-deposit-ereceipt` | genuine | approve | approve | 0.9913 | 0.05 / 0.042 | rent_receipt, 2026-11-06, 67510, fit 1.00, 0 edit sign(s) | High confidence (99%) that this rent receipt supports the withdrawal |
| 8 | `e05-name-sloppy` | edited | decline | decline | 0.7944 | 1 / 0.85 | medical_invoice, 2026-11-15, 3000, fit 0.95, 0 edit sign(s) | Strong signs that the document was digitally altered |
| 9 | `m04-sample-coffee` | wrong-purpose | decline | decline | 0.635 | 0 / 0 | retail_receipt, 2026-10-09, 748, fit 0.00, 0 edit sign(s) | The document doesn't match the Health / Medical purpose |
| 10 | `e03-amount-consistent-sloppy` | edited | decline | **review** ✗ | 0.8454 | 0.9 / 0.765 | rent_receipt, 2026-11-10, 73780, fit 1.00, 0 edit sign(s) | Error level analysis: Anomaly 90% · largest inconsistent region 28 blocks of 2277 |
| 11 | `g14-hospital-emergency-vault` | genuine | approve | approve | 0.951 | 0.1 / 0.085 | medical_invoice, 2026-11-19, 4650, fit 1.00, 0 edit sign(s) | High confidence (95%) that this medical invoice supports the withdrawal |
| 12 | `g08-bookstore-receipt` | genuine | approve | approve | 0.947 | 0 / 0 | retail_receipt, 2026-11-20, 2160, fit 0.90, 0 edit sign(s) | High confidence (95%) that this retail receipt supports the withdrawal |
| 13 | `s05-repair-420d` | stale | review | **decline** ✗ | 0.7129 | 1 / 0.85 | repair_invoice, 2025-09-30, 6749.6, fit 0.95, 0 edit sign(s) | Strong signs that the document was digitally altered |
| 14 | `e01-total-sloppy` | edited | decline | **review** ✗ | 0.8425 | 0 / 0.72 | medical_invoice, 2026-11-17, 28670, fit 1.00, 1 edit sign(s) | Totals add up: Line items sum to 8960.00 but the total reads 28670.00 · Visual edit signs: The sum of the line items (930 + 5640 + 480 + 1910) equals 8960, which matches… |
| 15 | `g03-lab-scan` | genuine | approve | **decline** ✗ | 0.8084 | 1 / 0.85 | medical_invoice, 2026-11-09, 1720, fit 1.00, 0 edit sign(s) | Strong signs that the document was digitally altered |
| 16 | `e08-date-careful` | edited | decline | decline | 0.7857 | 1 / 0.85 | tuition_invoice, 2026-11-12, 34610, fit 1.00, 0 edit sign(s) | Strong signs that the document was digitally altered |
| 17 | `g15-pension-statement` | genuine | approve | approve | 0.9831 | 0 / 0 | pension_statement, 2026-10-30, 30920, fit 1.00, 0 edit sign(s) | High confidence (98%) that this pension statement supports the withdrawal |
| 18 | `s03-rent-210d-exif` | stale | review | **decline** ✗ | 0.7484 | 1 / 0.85 | rent_receipt, 2026-04-28, 20880, fit 1.00, 0 edit sign(s) | Strong signs that the document was digitally altered |
| 19 | `m02-sample-rent` | genuine | approve | approve | 0.9999 | 0 / 0 | rent_receipt, 2026-10-07, 96000, fit 1.00, 0 edit sign(s) | High confidence (100%) that this rent receipt supports the withdrawal |
| 20 | `e10-total-careful-receipt` | edited | decline | **review** ✗ | 0.8541 | 0 / 0.72 | pharmacy_receipt, 2026-11-21, 2450, fit 1.00, 1 edit sign(s) | Totals add up: Line items sum to 547.57 but the total reads 2450.00 · Visual edit signs: Totals do not add up: Subtotal (547.57) + Tax (65.71) equals 613.28, but the pri… |
| 21 | `g12-plumbing-repair` | genuine | approve | **review** ✗ | 0.857 | 0.45 / 0.383 | repair_invoice, 2026-11-21, 7115.4, fit 0.95, 0 edit sign(s) | Name on document: "Siddarth Menon" shares the account holder's surname — likely a dependant · Error level analysis: Anomaly 45% · largest inconsistent region 19 blocks o… |
| 22 | `w02-electronics-education` | wrong-purpose | decline | decline | 0.6616 | 0 / 0 | retail_receipt, 2026-11-16, 61112.2, fit 0.05, 0 edit sign(s) | The document doesn't match the Education purpose |
| 23 | `m06-sample-tampered` | edited | decline | **review** ✗ | 0.8419 | 0 / 0.72 | medical_invoice, 2026-10-06, 103800, fit 1.00, 1 edit sign(s) | Totals add up: Line items sum to 23800.00 but the total reads 103800.00 · Visual edit signs: The line items sum to ₹23,800.00, which matches the subtotal, but the final … |
| 24 | `m01-sample-pharmacy` | genuine | approve | approve | 0.9803 | 0 / 0 | pharmacy_receipt, 2026-10-08, 6912, fit 1.00, 0 edit sign(s) | High confidence (98%) that this pharmacy receipt supports the withdrawal |
| 25 | `g16-lab-hires` | genuine | approve | **review** ✗ | 0.8798 | 0.6 / 0.51 | medical_invoice, 2026-11-16, 2160, fit 1.00, 0 edit sign(s) | Error level analysis: Anomaly 60% · largest inconsistent region 22 blocks of 4038 |
| 26 | `w07-jewellery-retirement` | wrong-purpose | decline | decline | 0.6763 | 0 / 0 | retail_receipt, 2026-11-04, 103648.9, fit 0.10, 0 edit sign(s) | The document doesn't match the Retirement purpose |
| 27 | `e07-date-sloppy-exif` | edited | decline | **review** ✗ | 0.8427 | 0 / 0.7 | medical_invoice, 2026-11-15, 6230, fit 1.00, 0 edit sign(s) | Timestamp consistency: Photo captured 191 days before the document's own date |
| 28 | `d05-png-screenshot` | duplicate | decline | decline | 0.857 | 0.45 / 0.383 | repair_invoice, 2026-11-21, 7115.4, fit 0.95, 0 edit sign(s) | This document was already used to justify another withdrawal |
| 29 | `g09-rent-photo` | genuine | approve | approve | 0.9906 | 0.05 / 0.042 | rent_receipt, 2026-11-12, 24000, fit 1.00, 0 edit sign(s) | High confidence (99%) that this rent receipt supports the withdrawal |
| 30 | `g02-pharmacy-receipt` | genuine | approve | approve | 0.9991 | 0 / 0 | pharmacy_receipt, 2026-11-22, 676.24, fit 1.00, 0 edit sign(s) | High confidence (100%) that this pharmacy receipt supports the withdrawal |
| 31 | `m05-sample-old` | stale | review | review | 0.9074 | 0 / 0 | medical_invoice, 2025-12-14, 23800, fit 1.00, 0 edit sign(s) | Document date: 345 days old (policy: 120) |
| 32 | `d03-reencoded` | duplicate | decline | decline | 0.9991 | 0 / 0 | pharmacy_receipt, 2026-11-22, 676.24, fit 1.00, 0 edit sign(s) | This document was already used to justify another withdrawal |
| 33 | `w05-hospital-education` | wrong-purpose | decline | decline | 0.6485 | 0 / 0 | medical_invoice, 2026-11-14, 8220, fit 0.00, 0 edit sign(s) | The document doesn't match the Education purpose |
| 34 | `s04-pharmacy-300d` | stale | review | review | 0.9191 | 0 / 0 | pharmacy_receipt, 2026-01-28, 465.36, fit 1.00, 0 edit sign(s) | Document date: 300 days old (policy: 120) |
| 35 | `g01-hospital-photo` | genuine | approve | approve | 0.9837 | 0 / 0 | medical_invoice, 2026-11-18, 3970, fit 1.00, 0 edit sign(s) | High confidence (98%) that this medical invoice supports the withdrawal |
| 36 | `s02-tuition-160d` | stale | review | review | 0.884 | 0 / 0 | tuition_invoice, 2026-06-17, 8860, fit 1.00, 0 edit sign(s) | Document date: 160 days old (policy: 120) · Name on document: "Anika Bose" shares the account holder's surname — likely a dependant |
| 37 | `w03-clothing-housing` | wrong-purpose | decline | decline | 0.65 | 0 / 0 | retail_receipt, 2026-11-19, 8534.4, fit 0.00, 0 edit sign(s) | The document doesn't match the Housing / Rent purpose |
| 38 | `e06-name-careful` | edited | decline | **approve** ✗ | 0.9672 | 0 / 0 | repair_invoice, 2026-11-18, 4413.2, fit 0.95, 0 edit sign(s) | High confidence (97%) that this repair invoice supports the withdrawal |
| 39 | `e09-fabricated-retyped` | edited | decline | **review** ✗ | 0.58 | 0 / 0 | failed: the AI provider's daily usage limit has been reached | Automated reading wasn't possible (the AI provider's daily usage limit has been reached), so a person will check this |
| 40 | `e02-total-sloppy-photoshop` | edited | decline | **review** ✗ | 0.48 | 0 / 0.5 | failed: the AI provider's daily usage limit has been reached | Automated reading wasn't possible (the AI provider's daily usage limit has been reached), so a person will check this |
| 41 | `s01-hospital-125d` | stale | review | review | 0.58 | 0 / 0 | failed: the AI provider's daily usage limit has been reached | Automated reading wasn't possible (the AI provider's daily usage limit has been reached), so a person will check this |
| 42 | `g06-tuition-dependant` | genuine | approve | **decline** ✗ | 0.41 | 1 / 0.85 | failed: the AI provider's daily usage limit has been reached | Strong signs that the document was digitally altered |
| 43 | `e04-amount-consistent-careful` | edited | decline | **review** ✗ | 0.563 | 0.1 / 0.085 | failed: the AI provider's daily usage limit has been reached | Automated reading wasn't possible (the AI provider's daily usage limit has been reached), so a person will check this |
| 44 | `d04-resized` | duplicate | decline | **review** ✗ | 0.58 | 0 / 0 | failed: the AI provider's daily usage limit has been reached | Automated reading wasn't possible (the AI provider's daily usage limit has been reached), so a person will check this |
| 45 | `m03-sample-tuition` | genuine | approve | **review** ✗ | 0.58 | 0 / 0 | failed: the AI provider's daily usage limit has been reached | Automated reading wasn't possible (the AI provider's daily usage limit has been reached), so a person will check this |
| 46 | `w06-rent-health` | wrong-purpose | decline | **review** ✗ | 0.58 | 0 / 0 | failed: the AI provider's daily usage limit has been reached | Automated reading wasn't possible (the AI provider's daily usage limit has been reached), so a person will check this |
| 47 | `g04-dental-stamped` | genuine | approve | **decline** ✗ | 0.41 | 1 / 0.85 | failed: the AI provider's daily usage limit has been reached | Strong signs that the document was digitally altered |
| 48 | `d06-rephotographed` | duplicate | decline | **review** ✗ | 0.58 | 0 / 0 | failed: the AI provider's daily usage limit has been reached | Automated reading wasn't possible (the AI provider's daily usage limit has been reached), so a person will check this |
| 49 | `d01-exact-resubmit` | duplicate | decline | decline | 0.58 | 0 / 0 | failed: the AI provider's daily usage limit has been reached | This exact file was already used as proof |
| 50 | `d02-exact-other-account` | duplicate | decline | decline | 0.5715 | 0.05 / 0.042 | failed: the AI provider's daily usage limit has been reached | This exact file was already used as proof |
