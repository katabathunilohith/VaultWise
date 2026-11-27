# 10. Payout planner

**Status:** built for the web app (27 November 2026); not in the phone app yet · **Owner:** Lohith (feature), Shaik (review) · **Size:** M

## Goal

Help a student see whether the money they haven't locked in a vault will last until their next allowance, stipend or pay, and what happens if that money arrives late. Vaults protect money set aside for a goal. A student also has to get through the month on what's left, and if that runs out they raid the vault or borrow. The planner covers that gap, and it tells them how much they can safely lock away.

## Who it's for

The same students as the rest of Vaultwise: people living on money that arrives in lumps (a monthly allowance, a stipend, part-time pay) with daily costs like travel and food and bills like a hostel mess fee in between. Their money often arrives later than expected, and a single "balance" number doesn't show which bill will be missed.

## Scope

- **In:** a form for cash on hand, the date and amount of the next money, daily costs, bills with due dates and a delay to test; on-time and late forecasts; saved plans; recording what actually arrived; a personal delay history; the account export and account closing.
- **Out, for now:** the phone app, money earned during the wait, costs that change from day to day, more than one expected payment, and any link to a bank or to the vaults.

## Design decisions, and why

| Decision | Why |
|---|---|
| Web first, in the browser | Works on any phone browser with no install or app update, so it could be tried quickly. The phone app can follow once the idea proves useful. |
| Plain arithmetic, no AI | A forecast has to be checkable by hand. There's nothing to get silently wrong, and each forecast costs nothing to run. |
| No ledger and no money movement | It's planning, not a transaction. So it needs no MPIN and can be used before the ID check, and it can't affect a balance. |
| Two scenarios side by side (on time and late) | The risk is lateness. Showing the first bill that can't be covered when the money is late is more useful than one number. |
| The expected money never pays for anything before it arrives | Otherwise the forecast would look safe when it isn't. |
| Record what actually arrived | Closes the loop: the student sees how their plan compared, and builds their own history. |
| Personal delay history: the longest delay from the last six recorded paydays, counting only plans made before each payday | Gives a delay the student has actually lived through, instead of a guess, without pretending to predict. Plans made after the money arrived would be hindsight, so they don't count. |
| Retry-safe saves (an ID made by the browser, insert-or-nothing on the server) | Pressing Save twice, or a retry on a bad connection, never creates two plans. |
| Calendar dates and whole paise | No rounding errors, and no day lost or gained across a daylight-saving change in other countries. |

## What was built

| File | Change |
|---|---|
| `src/lib/payout-planner.ts` | The input rules (`payoutPlanSchema`) and the forecast (`forecastPayout()`), shared by the browser and the server |
| `src/lib/payout-plan-store.ts` | Save, check in, list, and the delay history |
| `src/app/api/v1/payout-plans/route.ts` | `GET`, `POST`, `PATCH` |
| `src/app/payout-planner/` | The screens |
| `src/lib/db.ts` | The `payout_plans` table |
| `src/app/api/v1/me/export/route.ts`, `src/lib/auth/account.ts` | Plans in the account export; deleted on account close |
| `src/app/privacy/page.tsx`, `src/app/terms/page.tsx` | What the planner stores, and that it only uses figures you type in |
| `src/components/shell.tsx` | A navigation entry under Emergency access |

How it works, with a worked example: [features/payout-planner.md](../features/payout-planner.md).

## Tests

`tests/payout-plans.test.ts` (7 tests): the payday boundary and the first shortfall; rounding, a daylight-saving change and exact coverage; rejected inputs; saving without an ID check, safe retries, check-in and the export; account isolation and deletion on close; the delay history, including excluding hindsight plans.

## Acceptance

- [x] The worked example gives ₹100 a day on time and a ₹200 gap two days late, with the phone repair as the first uncovered bill.
- [x] Saving twice returns one plan; a different plan under the same ID is refused.
- [x] Another account can't read or change a plan.
- [x] Plans appear in the account export and are deleted when the account closes.
- [x] Type check, lint and the full server suite pass.
- [ ] Students try it on their own phones, and at least five of six find the first uncovered bill without help.

## What's next

1. **Connect it to the vaults:** after the forecast, offer to set aside the money for an upcoming bill in a vault, or show how much can safely go into a goal vault this month.
2. **Phone app version,** once students say they'd use it.
3. Costs that change from day to day, and money earned during the wait.
