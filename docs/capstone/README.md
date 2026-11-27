# Vaultwise capstone review

**Proposed problem statement.** Delivery riders who buy their own fuel can run short for a shift or a household bill when an expected payout slips and they have already spent cash needed before it arrives.

**First audience.** Food and grocery delivery riders around Vijayawada and Guntur who pay for their own fuel or charging and face a bill near payout day. The choice makes local recruitment and a repeat-use test feasible. The frequency of delays and the cost to these riders still need to be measured. Ask about missed work, cash-out fees, borrowing and time spent checking balances. Record zero cost when the rider already has a good workaround.

The earlier capstone asked whether salaried savers would lock money behind proof of purpose. Its five spending interviews address that earlier question. This version asks whether a rider can make one better-informed spending decision between payouts. It combines work costs, household deadlines and a rider-chosen delay in a forecast they can check against the eventual payout.

On a later cycle the rider can apply the longest delay from up to six distinct recent payouts they actually checked in. Only plans saved before the expected payday qualify. This gives the rider a concrete alternative to guessing a delay. A small personal history cannot establish how likely another delay is.

## What to take into the review

| Audience question | Material |
|---|---|
| Who has this problem and what do they use today? | [Market note with user reviews, published field studies and four alternatives](market.md) |
| What does the user do, and how does the answer work? | [Planner walkthrough and architecture diagram](../features/payout-planner.md) |
| How do you know this is worth building? | [Field interview and validation workbook](fieldwork.md) with eight interview slots, six observed sessions and a [read-only pilot metric](pilot-metric.sql) |
| Who pays and how much would it cost? | [Pilot offer and cost per active rider](economics.md) |
| What can the panel take away? | [Printable market and economics brief](Pilot-Brief.pdf), one page per question |
| What do we present? | [Current editable review slides](Vaultwise-Payout-Planner-Review.pptx) and the timed script below |
| Which product changes belong to this review? | [Changelog](../../CHANGELOG.md). The [October evaluation deck](../../Vaultwise_Capstone_Problem_Statement_Evaluation_Presentation.pptx) preserves the earlier hypothesis. |

## Three-minute pitch and live demo

| Time | Presenter action and words |
|---|---|
| 0:00–0:30 | **Problem.** “A delivery rider can have money showing in an earnings app and still need cash for tomorrow’s fuel. We’re testing whether seeing the next uncovered expense helps when a payout slips.” Say who you plan to meet locally and why their actual workaround matters. |
| 0:30–1:05 | **Evidence.** Describe one firsthand rider account from the market note and how published field research identified fuel costs. Kosh already answers a daily-spend question and Giga tracks take-home pay. The test for Vaultwise is whether combining due dates and delayed pay changes a rider’s decision. After fieldwork, replace this part with one consented, coded incident and its measured cost. |
| 1:05–2:25 | **Live demo.** In an India account, open **Payout planner** and load the fictional example. Show ₹2,000 cash, ₹100/day for work, ₹1,000 rent, and ₹4,000 expected after five days. The plan leaves ₹500, or ₹100/day. Move payday two days later: two extra workdays and a ₹500 phone repair due on the original payday leave a **₹200 gap**. Point to the first uncovered expense. Save, reload and reopen. Enter an actual payout of ₹3,800 on the delayed date. Show the two-day delay and ₹200 less pay. The two ₹200 figures answer different questions. |
| 2:25–3:00 | **Next decision.** Name the eight rider interviews and six unassisted sessions still to run. Ask for introductions to off-shift riders and one collective budget owner. The proposed ₹1,500 group price is an offer to test. Show one decision the team would change if riders already handle this easily. |

For an offline classroom presentation use the editable deck and its worked example. For a live local demo follow the [project quick start](../../README.md#quick-start). To demonstrate individual sign-up and saved plans across devices, use the configured Firebase mode.

**Technical verification, 27 November 2026.** A browser test started with a fresh local practice account at a 390-pixel viewport, opened the planner after onboarding, saved the example, reloaded it and recorded ₹3,800 two days late. A separate historical test record confirmed that a rider can apply a 14-day scenario for a previously recorded 18-day delay. The production build, typecheck, lint and all 72 production API checks passed. The web/server test suite passed 594 tests, with one optional live-AI test skipped. Field validation and a hosted Firebase sign-up trial for this revision are still pending. [Saved example screenshot](../images/payout-planner.png)

## Ten questions to rehearse

| Question | Answer supported today |
|---|---|
| Why choose delivery riders? | They must buy operating inputs before or during work. Published rider research identifies fuel costs, and the target group is accessible for a local test. |
| How often do riders run short and what does it cost? | We have no local rate. The interview workbook asks for incidents in the last four weeks, money deferred or borrowed, fees and minutes lost. |
| Why would someone switch from a bank balance or paper? | Our hypothesis is that seeing the date and name of the first uncovered expense helps. Compare the rider’s usual method and the planner on the same task. |
| What if instant cash-out solves it? | Include those riders. Record fees, eligibility and whether they already get cash when needed. Narrow or drop the segment if their workaround wins. |
| How does the forecast work? | Starting with available cash, subtract the daily work cost and bills due each day before payout. Repeat with a later date. The expected payout never funds a pre-payout expense. |
| Is there AI or a connection to a delivery platform? | The planner uses arithmetic on typed inputs. A rider can inspect the result without linking their earnings account or uploading a bill. |
| What happens if an assumption is wrong? | The user can try different costs or dates and save another scenario. The actual payout check-in measures the date and amount difference. Daily costs are flat and the model covers one expected payout at a time. |
| Who pays? | The current hypothesis is a collective or welfare sponsor. The proposed fee is ₹1,500 for up to 50 active riders a month. We have no paid commitment. |
| Can it make money at that price? | One full group would lose ₹1,050/month under our assumptions. Two full groups sharing infrastructure would leave ₹100 before excluded costs. Use invoices and timed support to revisit the price. |
| What result would make you stop? | Few last-month incidents, a faster existing workaround, repeated confusion about spendable cash, or no buyer willing to fund a pilot would each change the next decision. |

## Shared plan and carry-forward register

The founders own the field milestones in order. The implemented prototype and desk research are available for testing while local evidence is collected.

| Step | Lead | Status and exit evidence |
|---|---|---|
| 1. Agree the one-line problem | CEO | Proposed above. Each founder still writes theirs separately, compares and dates the agreed version. |
| 2. Understand the most recent incident | CEO, with CTO leading at least three | Eight rider notes pending, including five off campus. Bring exact words, recurring patterns and counterexamples. |
| 3. Compare alternatives | CEO | Desk research complete. Add which alternatives riders actually used, their costs and reasons to switch or stay. |
| 4. Explain the architecture together | CTO | Diagram and code available. Each founder draws the flow from memory and explains a server failure and a payout-day boundary. Record both walkthroughs. |
| 5. Complete the core task from a new account | CTO | Web prototype implemented. Demonstrate onboarding, forecast, save/reload and actual payout. Observe a new rider completing it unaided. |
| 6. Watch real users and fix friction | Both | Six sessions pending. Rank the top failures, assign owners, implement fixes and record retests. |
| 7. Pitch with field proof | CEO | Current deck explicitly labels desk evidence and the fictional example. Replace the field-proof slot only when an interview/session ID supports each claim. |
| 8. Swap roles | Both | CEO demos and fields a technical question. CTO explains the audience, evidence, sponsor offer and economics. Record date, questions each missed and repeat without prompting. |

| Decision or open item | Reason / next evidence | Owner | State |
|---|---|---|---|
| Lead with cash before the next payout | Public reports identify work expenses paid from cash on hand. Verify timing and frequency locally. | Both | Prototype decision, founder sign-off pending |
| Use a phone browser and manual entry | Allows the full core task without an app install or a platform integration. Test entry time, language preference, connectivity and trust on riders’ own phones. | CTO | Implemented on web |
| Show on-time and delayed results together | Test whether riders understand bills on the original payday when the payout slips. | CTO | Implemented, usability pending |
| Follow up when the rider gets paid | Track the first real check-in with the aggregate query. Discuss why people return or stop. | Both | Instrument ready, baseline pending |
| Offer a personal delay scenario on the next cycle | Compare the longest delay from recent checked-in cycles with the rider’s own choice. Ask whether the difference changes a spending decision. | CTO | Available after an eligible check-in, impact unmeasured |
| Test a collective-paid pilot | Measure recruitment effort and actual buyer authority, then revise the cost model. | CEO | No buyer commitment recorded |
| Review every field claim before the next pitch | For each stage bring at least one rider’s observation to the other founder. Record evidence ID, changed decision, owner and next review date. | Both | Open |

**CEO practice.** Use *The Mom Test* to rehearse past-event questions before interviews. Follow one request in the browser, API and database with the CTO, then explain it to a first-year student. Keep a list of terms you cannot explain and close each by finding it in the code. Practice the ten questions above aloud. Use the cost note to explain which additional rider first covers the pilot’s costs. Follow the learning resources for the stage you are currently completing. [The Mom Test](https://www.momtestbook.com/) · [MDN client–server overview](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Server-side/First_steps/Client-Server_overview) · [Harvard CS50 Web](https://cs50.harvard.edu/web/) · [YC Startup School](https://www.startupschool.org/)
