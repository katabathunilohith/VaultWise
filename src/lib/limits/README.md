# Personal limits (limits module)

A commitment device. A customer can **lower** a limit at any time, but **raising** one is rationed to once per calendar
month. Outside that allowance an **emergency exception** can be requested: a deterministic screen and an AI assessor
score it, a pure policy decides, unclear cases go to a person, and an approved increase expires after a fixed window.
Feature doc: [docs/features/limits.md](../../../docs/features/limits.md).

There is no switch: limits are always on. Other code imports only from `@/lib/limits` (this folder's `index.ts`).

## Files

| File | Job | Main functions |
|---|---|---|
| `index.ts` | The module's public surface (re-exports only) | everything listed below that is exported |
| `bounds.ts` | Rules every limit obeys (pure apart from reading the market) | `Limits`, `LIMIT_KEYS`, `Bound`, `limitBounds(rules)`; internal `validate(user, next)` (400 out of bounds), `diff(before, after)` → `{ loosened, tightened }` |
| `period.ts` | Calendar boundaries, in the server's local time | internal `dayStart()`, `monthStart()`, `nextMonthStart()` |
| `store.ts` | `user_limits` reads and writes; the `limit_changes` row shape | `getLimits(user)` (stored or market default, clamped to the market maximum), `effectiveEmergencyCap(user)`; internal `saveLimits()`, `ChangeRow` |
| `usage.ts` | Daily and monthly counters, and the withdrawal guard | `withdrawnToday(user)`, `assertWithinWithdrawalLimits(user, amount)` (400 with the amount left today); internal `standardChangesThisMonth()`, `emergencyRequestsThisMonth()` |
| `change.ts` | Standard change: lower any time, raise once a month | `changeLimits(user, next)` (400 "Nothing changed", 409 allowance used); a raise supersedes any active emergency increase |
| `screen.ts` | Deterministic text screen (scam phrases, text aimed at the assessor) | `screenText(text)` → `TextScreen` |
| `policy.ts` | Pure decision over the model's scores and the screen | `decideLimitRequest(ai, ctx)`, `LimitAssessment`, `StoredAssessment` |
| `assess.ts` | The AI assessor: account facts, prompt, model call (scores only) | internal `accountFacts(user, rules, now)`, `assessWithModel(...)` → `{ ai, aiError, model }` |
| `emergency-request.ts` | Emergency exception end to end: checks, screen, assessment, policy, row, audit, fraud flag | `requestEmergencyLimitChange(user, input)` |
| `increase.ts` | The arithmetic of temporary increases | internal `planIncrease(user, filedBefore, filedAfter)` → `{ limits, before, after }`, `fallBack(user, row, now)` |
| `expiry.ts` | Scheduler tick: approved emergency increases expire | `revertExpiredLimitIncreases(user)` (limits fall back, never loosen) |
| `review.ts` | The person's side: queue and decision | `pendingLimitReviews()`, `reviewLimitChange(id, decision, reviewer, note)` (404, 409 not awaiting review) |
| `view.ts` | What the screens read | `limitsOverview(user)` (limits, bounds, usage, quota, emergency usage, active increases, last 20 changes), `viewChange(row)` |

"Internal" means exported between files in this folder but not from `index.ts`.

## Emergency request flow

1. `validate`, reason code, explanation of 20+ characters, at least one limit going up, and fewer than
   `emergencyRequestsPerMonth` requests this month (429).
2. `screenText()` runs on the explanation whatever the model does.
3. `assessWithModel()` asks the vision model (document attached) or the text model, only when `aiEnabled()` and the
   person said yes to AI (`aiConsented()`); a model error is kept as `aiError`, never thrown.
4. `decideLimitRequest()` decides `approved` / `in_review` / `denied`. The model never approves on its own: strong scam
   phrases deny, text aimed at the assessor goes to a person, no scores go to a person, a raise above
   `maxEmergencyIncreaseRatio` goes to a person.
5. One transaction checks the monthly number of requests again (429, same message: requests that passed step 1
   together while the model was asked can't all be recorded), writes the `limit_changes` row (assessment JSON), applies
   an approved increase on top of the limits as they are then (below; it expires after `emergencyIncreaseDays`),
   audits and raises at most one fraud flag.

## Temporary increases (increase.ts)

An approved emergency increase, whether the policy approves it at once or a reviewer approves it later, is applied on
top of the limits **as they are when it is applied**, read inside the same transaction, not as they were when the
request was filed:

- a limit the request **raises** goes to the requested value (or stays higher, if it is higher by then). This holds even
  if the customer lowered that limit after filing: it is what they asked for and what was approved, and when the
  increase expires the limit falls back to the lowered value;
- a limit the request **lowers** goes to the lower of its current and requested values;
- **every other limit keeps its current value**, so a limit lowered while the request waited, or during the AI call,
  stays lowered.

For an applied increase the row stores, per raised limit, `before_limits` = the level it falls back to (the lower of the
limit when applied and the fall-back of any other increase still applied to that limit) and `after_limits` = the level
this increase grants; other limits hold their value when it was applied. When an increase expires, each limit it raised
falls back to the higher of its fall-back level and what any other still-active increase grants that limit, never above
the current value; limits it didn't raise are left alone. So an expiring increase never undoes another active one, and
a chain of overlapping increases ends at the level before the first.

**Behaviour changes (2026-11-24):** before, an approval saved the request's filed `after_limits` whole (undoing any
limit lowered since), the monthly number was checked only before the AI call, and an expiry set every limit to the lower
of now and the expiring request's `before` (undoing other active increases early). Rows and audit details changed with
it: a reviewer's approval now rewrites the row's `before_limits` / `after_limits` to the applied increase (the queue
showed the filed values), `limits.emergency_approved` details carry the applied `before` / `after` (the same as the
filed ones unless the limits changed meanwhile or another increase was active), and `limits.reviewed_*` rows are stamped
with the decision time passed in (`ts: now`) instead of the clock.

## Tables (created in `src/lib/db.ts`)

`user_limits (user_id, single_withdrawal, daily_withdrawal, monthly_emergency, updated_at)` and
`limit_changes` (`kind`: `tighten` / `standard` / `emergency`; `status`: `applied` / `in_review` / `denied` /
`reverted` / `superseded`; before and after limits as JSON, the reason, the assessment JSON, the reviewer and expiry).

## Audit and flags

| Where | Audit action | Fraud flag (`source: "limits"`) |
|---|---|---|
| `change.ts` | `limits.tighten`, `limits.standard` | |
| `emergency-request.ts` | `limits.emergency_approved` / `_in_review` / `_denied` (actor: the model, or `limits-policy`) | high: denied with scam risk 0.6+; medium: text aimed at the assessor; medium: scam risk 0.6+ otherwise |
| `expiry.ts` | `limits.emergency_expired` (actor `scheduler`) | |
| `review.ts` | `limits.reviewed_approved` / `_denied` (`ts` = the decision time) | |

## Market rules (`src/lib/compliance.ts`)

`rules.limits.singleWithdrawal` and `dailyWithdrawal` (`max`, `default`), `loosenPerMonth`, `emergencyRequestsPerMonth`,
`emergencyIncreaseDays`, `maxEmergencyIncreaseRatio`; `rules.emergency.monthlyCap` bounds the personal emergency limit.

## Touch points outside this folder

| File | Uses |
|---|---|
| `src/lib/vaults.ts` | `assertWithinWithdrawalLimits()` before a withdrawal |
| `src/lib/emergency.ts` | `effectiveEmergencyCap()` |
| `src/lib/scheduler.ts` | `revertExpiredLimitIncreases()` |
| `src/app/api/v1/limits/route.ts` | `GET` overview, `PUT` standard change (MPIN for a raise) |
| `src/app/api/v1/limits/emergency/route.ts` | `POST` emergency request (multipart) |
| `src/app/api/v1/admin/overview/route.ts`, `admin/limit-requests/[id]/route.ts` | review queue and decision |
| `src/lib/alerts` | `alertLimitLoosened()` lines marked `// alerts` in `change.ts`, `emergency-request.ts`, `review.ts` |

## Tests

`tests/limits.test.ts` (rules, policy, screen, emergency flow, review, expiry, increases meeting later changes,
parallel requests, overlapping increases), plus `tests/alerts.test.ts`,
`tests/groq.test.ts` and `tests/mpin.test.ts`.
