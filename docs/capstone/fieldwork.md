# Rider interviews and observed sessions

Use this workbook with the proposed Vijayawada–Guntur pilot. The old evaluation deck records five conversations about personal spending. The repo contains no rider interviews or observed rider sessions for this problem. Public posts, classroom demos and automated tests have separate evidence roles. Fill the tables with participant codes. Keep identifiable notes in the founders’ private research records.

## 1. Agree on the problem, independently

Before the interview round, each founder writes one sentence from memory naming the rider, the decision and the consequence. Compare the two and log any difference. After the interviews, revise the statement using the words that recur. CEO draft ___ · CTO draft ___ · agreed wording and date ___.

## 2. Interview eight riders

Recruit people who paid their own work expenses and received, or expected, a delivery payout within the last four weeks. Seek at least five off campus. The CTO leads at least three of the eight. Aim to include riders who cash out daily and riders who wait several days. Ask in the language each person prefers and note when an English quotation is a translation. Speak off-shift with permission to keep anonymous notes.

1. Take me back to the last time you paid for fuel or charging before a payout. What cash did you have and what else was due?
2. When did you expect the payout? When and how much arrived? How did you find out?
3. Walk me through what you used that day. What did you check first? Did you set aside cash, cash out early, change shifts, ask someone or use an app?
4. What happened next? Record any amount borrowed, fee paid, purchase postponed or minutes spent. If everything worked, capture how.
5. How many times in your last four weeks did you face this decision? Can you remember the most recent two? Mark estimates as estimates.
6. When did your current method work well enough that changing it would be extra work? What have you tried or paid for before?

| ID | Date / off campus? | Lead | Last incident and frequency | Exact words | Workaround and measured cost | Pattern / contrary case |
|---|---|---|---|---|---|---|
| I01 | | | | | | |
| I02 | | | | | | |
| I03 | | | | | | |
| I04 | | | | | | |
| I05 | | | | | | |
| I06 | | | | | | |
| I07 | | | | | | |
| I08 | | | | | | |

At synthesis, count riders who describe an actual incident, those who already solve it easily, and missing cost/frequency values. For each pattern list IDs, a representative phrase and a contrary case. Proposed decision rule before recruitment: proceed if four of eight can recall a specific overlap with a consequence. Otherwise revisit the audience or problem; this small sample can guide the next build but cannot establish local prevalence.

## 3. Observe six people use the web prototype

Give each participant a fresh test account and a phone browser. Use invented figures they are comfortable discussing. For a consistent timed task, use ₹2,000 in hand, ₹100 a day for work, ₹1,000 rent due on day three, ₹4,000 expected after five days, and a ₹500 repair due on payday. Tell them the payout might arrive two days late. Ask them to find what money is available each day, identify the first uncovered expense, save the plan and retrieve it after a reload. For the check-in task, use a past-dated fictional cycle with an actual payout of ₹3,800 two days late.

Observe silently until the participant asks for help or stops. Record which label they tapped or misunderstood, whether they counted the expected ₹4,000 as cash, time to an answer, and the answer in their own words. A clean run identifies ₹100/day on time, the repair as the first uncovered bill, and a ₹200 gap before delayed pay. Record assistance even if the participant eventually succeeds.

| ID | Date / build / language | Independent completion? Time | Answer and exact sticking point | Help given | Fix / severity / retest |
|---|---|---|---|---|---|
| V01 | | | | | |
| V02 | | | | | |
| V03 | | | | | |
| V04 | | | | | |
| V05 | | | | | |
| V06 | | | | | |

**Session summary to complete.** Unassisted ___ / 6. Most common error ___ (IDs ___). Most consequential error ___. Top fixes in order ___; owner and retest date ___. Suggested release decision: at least five of six identify the shortfall unaided and nobody counts forecast income as spendable. If that fails, fix the first misleading step and repeat the test with new riders.

Ask which method they would use next cycle and whether they will actually return with a fresh plan. Explore pricing after the task: what was their last paid workaround, who paid and what did it cost? In a separate sponsor conversation request a budget owner, decision date and actual pilot commitment at the proposed price. Keep verbal interest and written commitments distinct.

## 4. Track the first real payout check-in

**One pilot metric:** of riders whose first prospective plan has had a full seven days after expected payday, what percentage recorded what actually arrived by that deadline? Report both counts with the percentage. This measures forecast follow-up. Record a rider’s later explanation separately before attributing a missed payment or a saving to the product.

Use an isolated pilot instance with individual sign-in and consenting riders. The single-account local demo, class tests and the example button cannot provide a pilot denominator. Review weekly using the read-only query below on the pilot database. It filters to INR, excludes tagged examples and plans created on or after expected payday, uses India civil dates, and counts each rider once. A blank percentage means no eligible observations. Sponsors would receive only an aggregate agreed with participants.

```sh
sqlite3 -header -readonly /path/to/pilot/vaultwise.db < docs/capstone/pilot-metric.sql
```

| Week ending | Riders due | Checked in | Percentage | What one rider said / resulting decision |
|---|---|---|---|---|
| Baseline before recruitment | — | — | — | Field pilot pending |

For longer-term retention, separately ask whether the rider made a new plan next cycle. A shortfall on screen is a calculated scenario. Claiming savings requires observed outcomes and a credible comparison.
