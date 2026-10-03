# Vaultwise — purpose-locked savings, verified redemption & automated investing

A working prototype of the **Capstone Entrepreneurship Blueprint**: a category-based wallet where savings are released only against verified proof of use, with a tiered emergency path and a Core/Satellite investing engine.

> "Vaultwise" is a working brand name — change it in `src/lib/shared.ts` (`BRAND`).

---

## Quick start

```bash
npm install
cp .env.example .env.local   # then add your GROQ_API_KEY
npm run dev
```

Open http://localhost:3000. Onboarding asks for a name, your country (pre-selected from your network region, time zone or browser language) and a 4–6 digit PIN. The country sets the wallet currency and the rulebook. Leave **Start with demo history** on to get four months of realistic activity (about 15 s — it pulls live market data). The PIN you choose is what Tier 2 emergency access asks for.

| Script                                                  | What it does                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                           | Development server                                                                                                                                                                                                                                                     |
| `npm run build && npm start`                            | Production build                                                                                                                                                                                                                                                       |
| `npm test`                                              | Unit tests: ledger & audit chain, emergency cascade, scheduler (cooling-off, overdue receipts, SIPs), SMC no-lookahead, forensics, vault rules, region detection, personal limits & the emergency-exception policy, and a randomised ledger fuzz test                  |
| `npm run build && npm run test:e2e`                     | End-to-end API suite against an isolated production server with a throwaway database (never touches `./data`)                                                                                                                                                          |
| `E2E_AI_SAMPLES=1 npm run test:e2e`                     | …plus the live-AI regression: every sample document, the custom-vault tier, an emergency receipt and five emergency limit-exception scenarios (genuine, scam, shopping, prompt injection, disproportionate) — about 13 Groq calls. `E2E_ONLY_AI=1` runs just that part |
| `npm run typecheck` / `npm run lint` / `npm run format` | Static checks                                                                                                                                                                                                                                                          |

Requires Node 22.5+ (uses the built-in `node:sqlite`). Data lives in `./data` (git-ignored); **Settings → Reset demo** wipes it.

---

## Five-minute demo script

1. **Overview** — net worth, AI weekly insight, saving streak, vault cards, emergency readiness, milestones.
2. **Vaults → Family Health Fund → Withdraw with proof** — enter `297.50` to _City General Hospital_, pick the **Hospital invoice** sample, and watch the six-stage pipeline approve it in ~3 s.
3. Repeat with the **Edited hospital invoice** sample → auto-declined: totals don't add up, ELA finds the pasted region (toggle **ELA** on the report), the vision model notices the edit, and the content was already used. Try the **Coffee shop receipt** (purpose mismatch) and the **Ten-month-old invoice** (sent to a human).
4. **Emergency access** — request more than the Health vault holds: Tier 1 releases instantly, the remainder cascades to Tier 2 (PIN + hold, live countdown), guardrails update, and a receipt is requested afterwards without blocking the money.
5. **Invest → Core** — model portfolio with live ETF quotes, a 10-year SIP illustration on real monthly closes, and a Monte Carlo range of outcomes.
6. **Invest → Satellite** — live SMC chart (FVGs, order blocks, BOS/CHoCH, sweeps, volume profile), confluence breakdown, **Backtest** → walk-forward folds and the governance gate.
7. **Ops console** — review queue with SLA timers (decide the seeded rent case), risk flags, model metrics, ledger reconciliation, and the audit-chain integrity check.
8. **Settings → Your limits** — lower a limit (instant), raise one (allowed once a month), then try to raise another: the dialog switches to an emergency request that the AI assesses. Requests it can't confidently approve land in **Ops console → Limit requests**.
9. **Assistant** — ask "Am I on track for my Health vault goal?"

---

## How the blueprint maps to the code

| Blueprint                                                                    | Implementation                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §4.1 Purpose-locked vaults, sub-ledgers, double entry, event sourcing        | `src/lib/vaults.ts`, `src/lib/ledger.ts` — append-only `ledger_entries` (DB triggers block UPDATE/DELETE), a `balances` projection reconciled against a full replay             |
| §4.1 Contribution rules (fixed, % of income, round-ups)                      | `runDueContributions`, `creditIncome`, `recordSpend` / `sweepRoundups`; lazy scheduler in `src/lib/scheduler.ts`                                                                |
| §4.2 6-stage proof verification                                              | `src/lib/verification/pipeline.ts` (intake → pre-processing & forensics → OCR/layout → classification → tamper/reuse → decision), `forensics.ts`, `classify.ts`                 |
| §4.2 Human review, appeals, active learning, false-decline metric            | `reviewDecision`, `appeal`; Ops console review queue and model metrics                                                                                                          |
| §4.3 Emergency cascade + guardrails + post-hoc receipts                      | `src/lib/emergency.ts`, `src/lib/fraud.ts` (risk score)                                                                                                                         |
| §4.4 Core sleeve: risk profile, model portfolios, SIP                        | `src/lib/invest/profile.ts`, `core.ts`                                                                                                                                          |
| §4.4 Satellite: SMC/FVG engine, risk management, governance                  | `src/lib/invest/smc.ts`, `backtest.ts`, `satellite.ts`                                                                                                                          |
| §4.5 Round-ups, joint vaults, open banking, gamification, nudges, tax export | Linked accounts page, joint vault members, `src/lib/engagement.ts`, `/api/v1/reports/tax`                                                                                       |
| §5 Layered architecture                                                      | Next.js client pages → REST route handlers (`src/app/api/v1`) → domain services (`src/lib`) → SQLite                                                                            |
| §8 API surface                                                               | All illustrative endpoints exist under `/api/v1` (see below)                                                                                                                    |
| §9 Jurisdiction-aware compliance engine                                      | `src/lib/compliance.ts` — countries → markets, per-market caps, limits, thresholds, asset classes, disclosures, data regime; `src/lib/region.ts` detects the customer's country |
| §4.3 Guardrails (customer-set)                                               | `src/lib/limits.ts` — personal withdrawal limits, once-a-month loosening, AI-assessed emergency exceptions                                                                      |
| §10 Auditability                                                             | Hash-chained `audit_log` (`src/lib/audit.ts`); integrity check in the Ops console                                                                                               |

---

## AI / ML

**Provider:** Groq. `qwen/qwen3.8-27b` (vision) reads documents; `openai/gpt-oss-120b` writes the weekly insight and powers the assistant. The key is read server-side from `.env.local` and never reaches the browser. Without a key the app still works: verification routes everything to human review and the insight falls back to rules.

**Verification pipeline** — every stage is persisted as it runs, so the UI shows progress live:

1. **Intake** — type/size checks, SHA-256 exact-duplicate search across all accounts.
2. **Pre-processing & forensics** — auto-orient, trim, normalise, denoise; EXIF (editing software, capture vs. modify time).
3. **OCR & layout** — the vision model returns structured fields (issuer, recipient, date, total, subtotal, tax, line items), per-purpose category scores and visual edit signs.
4. **Classification** — model scores blended with an explainable keyword lexicon; checks amount coverage, document age, name match (surname-only = likely dependant), and whether line items add up to the total.
5. **Tamper & reuse** — error-level analysis on 8×8 JPEG-grid blocks (luminance, edge-normalised, spatially clustered — calibrated so clean scans score 0 and pasted edits 0.75–1.0), a 256-bit perceptual hash, and content fingerprints (issuer + reference, or issuer + total + date) so a _re-photographed_ bill is caught but two different bills on the same hospital template are not.
6. **Decision** — weighted confidence; auto-approve only when ≥ 85 % _and_ no check failed; auto-decline on hard failures or ≤ 35 %; everything else goes to a person (custom vaults without a template always do). Every decision is hash-chained into the audit log with model version and confidence.

Groq's free tier allows ~8k tokens/minute per model, so bursts of uploads wait and retry automatically (the UI shows "waiting for model capacity").

---

## Countries, currencies & personal limits

**Countries.** 28 countries map onto 8 rulebooks — US (USD), euro area (21 countries, EUR), UK (GBP), India (INR), Singapore (SGD), Canada (CAD), Australia (AUD) and the UAE (AED). Each rulebook in `compliance.ts` declares its currency, regulators, data regime, cooling-off period, asset classes and limits. Money defaults are written once in USD and scaled by currency (`CURRENCY_SCALE`, rounded to clean numbers), with explicit overrides where a market needs its own value — so adding a market is one `defineMarket({...})` entry plus the countries that use it. Markets without local ETFs on file fall back to global ETFs priced through live FX.

**Region detection** (`src/lib/region.ts`) suggests a country at onboarding from, in order: a CDN geo header (`x-vercel-ip-country`, `cf-ipcountry`, `cloudfront-viewer-country`), the browser's IANA time zone, then the region in its preferred languages. It prefers the first _supported_ signal, says which signal it used, and lets the customer change it. Unsupported countries are refused with a clear message rather than silently mapped. The country is fixed after onboarding because every balance and limit is held in that currency.

**Personal limits** — per-withdrawal, daily, and monthly emergency access, each within the market's maximum:

| Change                        | Rule                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Lower a limit                 | Always allowed, instantly                                                                       |
| Raise a limit                 | Once per calendar month                                                                         |
| Raise again in the same month | Emergency request (max 2 a month): reason + explanation + optional document, assessed by the AI |

The model scores the request (genuine, urgent, proportionate, scam risk, attempted manipulation, document support), but a deterministic policy makes the decision. A keyword screen for common scam scripts (gift cards, "safe account", crypto transfers, someone instructing you to pay) declines and raises a high-severity flag; text that tries to instruct the assessor goes to a person regardless of what the model says; anything uncertain or more than 3× the current limit goes to the **Limit requests** queue. Approved increases last 14 days, then revert — never above what the customer had before, and keeping any tightening they made in between.

---

## Investing engine — and an honest result

The Satellite engine scores six price-action components into a 0–100 confluence (higher-timeframe bias, BOS/CHoCH, fair value gap, order block, liquidity sweep, premium/discount + POC). It is strictly causal — swings are only "known" after confirmation, the HTF bias uses completed bars — and a test proves a bar's signal is identical with or without future data.

The backtester enters at the next open, resolves same-bar stop/target ambiguity against itself, charges asset-class costs, sizes at 1 % risk, applies daily/weekly drawdown circuit breakers, and runs an anchored walk-forward (thresholds chosen in-sample, tested on the next unseen window).

**Across the eight markets and three timeframes surveyed, no configuration cleared the gate** (out-of-sample profit factor ≥ 1.1, positive expectancy, ≤ 20 % drawdown, t ≥ 1). That's consistent with the blueprint's own caution about SMC/FVG, so the product behaves accordingly: Satellite capital sits in cash, the engine paper-trades, and "live" stays locked behind a licensed brokerage partner.

Market data comes from Yahoo Finance (cached; falls back to a deterministic synthetic series offline). Core ETF prices are converted to the wallet currency with live FX.

---

## API surface (`/api/v1`)

```
GET/POST  /vaults                    GET/PATCH /vaults/{id}
POST      /vaults/{id}/deposits      POST      /vaults/{id}/withdrawals
POST      /vaults/{id}/proofs        GET       /proofs/{id}   (+ /file, /appeal)
DELETE    /withdrawals/{id}          (cancel a request still waiting for proof)
GET       /emergency                 POST      /emergency/preview
POST      /emergency/withdrawals     POST      /emergency/{id}/receipt
GET/POST  /invest/profile            GET       /invest/core   (+ /buy, /sip, /history, /projection)
GET       /invest/satellite          POST      /invest/satellite/opt-in | /opt-out | /run | /backtest
GET       /invest/satellite/analysis PATCH     /invest/satellite/markets
GET       /portfolio                 GET       /audit/{userId}   (admin; "all" for global)
GET       /accounts                  POST      /accounts/simulate | /accounts/sweep
GET       /region                    (suggested country from headers)
GET/PUT   /limits                    POST      /limits/emergency   (multipart: limits, reason, explanation, file?)
GET       /dashboard | /insight | /activity | /badges | /me | /me/export | /reports/tax
POST      /assistant (streams text)  GET/POST  /admin/overview | /admin/reviews/{proofId} | /admin/flags/{id}
POST      /admin/limit-requests/{id}
```

---

## What's real and what's simulated

| Real                                                                  | Simulated                                                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Double-entry ledger, holds, reconciliation, hash-chained audit log    | Banking-as-a-service, e-money issuance and payouts (money moves between ledger accounts) |
| AI document reading, image forensics, decisioning, review queue       | KYC/AML provider (always "verified")                                                     |
| Market data, FX, historical SIP illustration, SMC analysis, backtests | Brokerage and crypto custody (fills are recorded at live prices)                         |
| Emergency guardrails and risk scoring                                 | Open-banking aggregation (salary/card events via **Linked accounts → Simulate**)         |

**Prototype limits:** single customer per database (no authentication — the Ops console is open), SQLite instead of Postgres/Kafka, JPEG/PNG/WebP proofs only (no PDF or HEIC — iPhones convert HEIC to JPEG on upload; HEIC files get a clear message), error-level analysis skips photos above 25 MP (other tamper checks still run), the country is fixed at onboarding (every limit is set in the wallet's currency), region detection is a suggestion — not KYC proof of residence, no real device attestation or biometrics. Compliance values in `compliance.ts` are illustrative planning defaults, not legal advice.

**Security note:** the Groq key lives only in `.env.local` (git-ignored). Because it was shared in a chat, rotate it in the Groq console before sharing this project.
