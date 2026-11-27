# Vaultwise

**Will today’s cash cover fuel and bills if a delivery payout comes late?**

[![CI](https://github.com/katabathunilohith/VaultWise/actions/workflows/ci.yml/badge.svg)](https://github.com/katabathunilohith/VaultWise/actions/workflows/ci.yml)

Vaultwise is a two-founder financial-inclusion capstone. The current web prototype helps delivery riders compare an on-time payout with a delayed one. Enter available cash, daily work costs and dated bills. See which expense first goes uncovered, save the plan, then return on payday to compare the date and amount received with the forecast. On a later cycle you can test the longest delay from your own recent payout check-ins.

**Try the core flow:** run the [local web app](#quick-start), choose India during account setup, open **Payout planner** and load its fictional delivery week. With ₹2,000 in hand, ₹100/day in work costs and ₹1,000 in rent, the rider has ₹100/day left until the expected payday. A two-day delay brings a ₹500 repair into the same window and leaves a ₹200 gap. Save the example and record an actual payout to finish the demo.

![The fictional rider's saved plan shows ₹100 a day on time, a ₹200 shortfall if pay is two days late, and the eventual payout check-in](docs/images/payout-planner.png)

The [capstone review guide](docs/capstone/README.md) includes the new problem statement, [market evidence](docs/capstone/market.md), [editable pitch slides](docs/capstone/Vaultwise-Payout-Planner-Review.pptx), live demo, interview materials and pricing test. The planner runs in a mobile or desktop browser. The earlier savings, wallet, emergency and investing prototypes are available on the web and in the [Expo app](mobile/README.md).

> **All money is pretend.** Vaultwise is a student prototype, not a bank, payment service or investment adviser. No real money moves, and the ID checks run against test providers.

**Hosted deployment:** the project uses [vaultwise.online](https://vaultwise.online), an EC2 server in Mumbai with HTTPS and Firebase sign-in. The planner in this checkout requires deploying this revision before hosted testers can use it. The Android `tester-live` build talks to the same backend for its existing features, and the native Practice build runs independently. [Deployment guide](deploy/README.md)

| Web app: overview | Web app: emergency access | Ops console: audit chain |
|---|---|---|
| ![Overview: vault balances, saving streak and weekly insight](docs/images/web-overview.jpg) | ![Emergency access: Tier 1 and Tier 2 with guardrails](docs/images/web-emergency.jpg) | ![Ops console: hash-chained audit log, intact](docs/images/web-ops-audit.jpg) |

| Phone: Home (Practice) | Phone: security settings |
|---|---|
| <img src="docs/images/phone-home.jpg" alt="Phone Home: vault total, wallet, actions and to-do, in Practice mode" width="260"> | <img src="docs/images/phone-security.jpg" alt="Phone security settings: app lock, MPIN, devices and phone number" width="260"> |

---

## What it does

| Area | What a person can do | Docs |
|---|---|---|
| Payout planner (web) | Test a late delivery payout against work costs and bills, then check the saved forecast against the payout received | [Payout planner](docs/features/payout-planner.md) |
| Vaults | Save into purpose vaults by rule (fixed, % of income, round-ups); joint vaults | [vaults](docs/features/vaults.md) |
| Proof checks | Withdraw by uploading a bill: image forensics, an AI read (only with consent), rules, then approve, decline or send to a person; appeals | [proof-verification](docs/features/proof-verification.md) |
| Emergency | Tier 1 releases the Health vault instantly; Tier 2 opens other vaults with the MPIN and a short hold; receipts afterwards | [emergency](docs/features/emergency.md) |
| Wallet and Pay | A spending balance with a daily limit; pay a merchant from a vault, checked at checkout | [wallet](docs/features/wallet.md), [pay](docs/features/pay-with-vaultwise.md) |
| Investing | Core model portfolios and SIPs; a Satellite price-action engine that stays in paper trading (it didn't pass its own backtest gate) | [investing](docs/features/investing.md) |
| Security | 6-digit MPIN on every money move, registered devices with a new-device cap, alerts, texted codes, app lock and screenshot blocking on the phone | [mpin](docs/features/mpin.md), [devices](docs/features/devices-alerts-otp.md), [phone](docs/features/phone-security.md) |
| Identity | Firebase sign-in; ID check by photo (AI + a person) or, for India, PAN → Aadhaar via DigiLocker → a ₹1 bank check; account recovery | [identity](docs/features/identity.md) |
| Markets | 28 countries on 8 rulebooks (currency, caps, thresholds, disclosures) | [countries](docs/features/countries-and-compliance.md) |

## Architecture

```mermaid
flowchart LR
  subgraph Clients
    W["Web app<br/>Next.js pages (src/app)"]
    P["Phone app<br/>Expo (mobile/)<br/>Practice mode runs offline"]
  end
  subgraph Server["Vaultwise server (Next.js 16, Node 24)"]
    API["REST route handlers<br/>src/app/api/v1"]
    POL["Policy: sign-in, MPIN, devices,<br/>ID gate, rate limits<br/>src/lib/money-routes.ts, auth, mpin, devices"]
    DOM["Domain modules (src/lib)<br/>ledger, vaults, verification,<br/>emergency, wallet, invest, kyc, recovery"]
    DB[("SQLite (node:sqlite)<br/>append-only ledger,<br/>hash-chained audit log")]
    FILES[("Uploaded bills and IDs")]
  end
  W -->|HTTPS + Firebase token| API
  W --> Forecast["Payout forecast in browser"]
  API --> Plans["Validate and save payout plans"] --> DB
  P -->|HTTPS + Firebase token<br/>x-device-id, x-ai-consent| API
  API --> POL --> DOM --> DB
  DOM --> FILES
  DOM -.-> Groq["Groq AI<br/>(only with consent)"]
  DOM -.-> Yahoo["Yahoo Finance<br/>(cached)"]
  DOM -.-> Ext["Setu (PAN, DigiLocker, bank)<br/>Twilio (SMS), Expo Push"]
  API -.-> FB["Firebase Auth<br/>(token check)"]
```

Request path: a route handler resolves the session (sign-in, device, rate limit), applies the money policy for its action (ID gate, MPIN, new-device cap), then calls a domain module, which writes balanced ledger entries and an audit row. More in [docs/architecture.md](docs/architecture.md).

## Where it runs

| Piece | What we use |
|---|---|
| Server | One AWS EC2 instance (`t3.small`, Ubuntu) in Mumbai, `ap-south-1`, with an Elastic IP |
| Domain and HTTPS | [vaultwise.online](https://vaultwise.online); Caddy gets and renews the certificate and proxies to the app |
| App and data | Next.js 16 on Node 24 under systemd; SQLite and uploaded photos in `/var/lib/vaultwise`, with a nightly backup script (`deploy/backup.sh`) |
| Sign-in | Firebase Authentication (email and password) |
| AI | A Groq vision model, only for people who agree |
| Phone builds and updates | Expo EAS: an Android APK for testers (`tester-live`) and over-the-air updates |
| Checks | GitHub Actions on every push and pull request ([ci.yml](.github/workflows/ci.yml)) |

Setup, updates, backups and restores: [deploy/README.md](deploy/README.md) and [deploy/restore.md](deploy/restore.md).

## Quick start

Needs **Node 24** (any Node from 22.18 works: the server uses the built-in `node:sqlite`, and `npm run audit:verify` runs TypeScript with Node's type stripping).

```bash
npm install
cp .env.example .env.local   # add GROQ_API_KEY for AI reading (optional)
npm run dev
```

Open [the local app](http://localhost:3000). Onboarding asks for a name, country and six-digit MPIN and opens the payout planner from the home route. Wallet demo history is optional and off by default. The planner has its own **Try a fictional week** action. Without Firebase settings the server uses a single practice customer. Use an individual signed-in account per rider for field testing. [Sign-in configuration](docs/reference/configuration.md)

**Phone app:** `cd mobile && npm install && npm run web` (or `npm run start:go` for Expo Go). Practice mode needs no server; the Practice MPIN is `246810` and texted codes are `123456`. See [mobile/README.md](mobile/README.md).

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build (refuses to start without sign-in unless told otherwise) |
| `npm test` | Unit and integration tests (vitest) |
| `npm run test:e2e` | End-to-end API suite against a throwaway production server |
| `npm run test:ai` | Live AI checks of the sample documents (needs `GROQ_API_KEY`) |
| `npm run eval:verification` | Evaluation of the bill checks on a generated, labelled set (add `-- --live` to use the real AI) |
| `npm run audit:verify` | Re-walks the audit chain and checks it against the anchors kept outside the database |
| `npm run typecheck` / `npm run lint` | Static checks (also run in CI) |
| `cd mobile && npm test` | Phone unit tests and the shared contract tests (Jest) |

All commands, including the phone and deploy scripts: [docs/reference/commands.md](docs/reference/commands.md).

## Security

- Every money move needs the MPIN, checked by the server before any money, upload or AI call; wrong tries lock money moves for longer each time.
- A new phone or browser can only move small amounts until it's trusted with a texted code and the MPIN; signed-out devices stay out.
- AI reads a bill or question only after an explicit yes; a missing answer means no.
- Rate limits, security headers, generic errors with an error id, and a production server that refuses to start without sign-in.
- An append-only ledger (database triggers block edits) and a hash-chained audit log, anchored daily to a file outside the database (`npm run audit:verify` checks it).
- Four independent code reviews on 22 November 2026; every finding and fix is listed in [docs/security.md](docs/security.md), with the OWASP MASVS checklist in [docs/security/](docs/security/README.md).

Secrets live only in `.env.local` (git-ignored, never committed). The git history was scanned for keys on 24 November 2026 and is clean.

## How well do the bill checks work?

`npm run eval:verification` generates 50 labelled bills (genuine, edited, duplicate, wrong-purpose and stale, dated relative to the run day) and runs them through the real pipeline. Results on 24 November 2026, pipeline `vw-proof@1.5`, offline with a stand-in reader that returns exactly what's printed on the bill:

| | Result |
|---|---|
| Genuine bills wrongly declined | 0 of 19 (was 3 of 19 before the rule changes the evaluation prompted) |
| Bad bills wrongly approved | 3 of 31: careful same-font edits that look genuine |
| Duplicates and wrong-purpose bills declined | 14 of 14 |
| Sent to a person | 16 of 50 |

The live pass with the real AI read 38 of the 50 bills before hitting Groq's daily limit, on the earlier `vw-proof@1.4`; it needs a re-run. The evaluation is synthetic and small, and says so: [docs/evaluation](docs/evaluation/README.md) has the method, every bill's result and the known weaknesses.

## What's real and what's simulated

| Real | Simulated |
|---|---|
| Double-entry ledger, holds, reconciliation, hash-chained audit log | Bank accounts, e-money and payouts (money moves between ledger accounts) |
| Image forensics, AI document reading, decision rules, review queue | Licensed KYC: the India steps use a test provider until Setu sandbox keys are added |
| MPIN, devices, alerts, rate limits, sign-in (Firebase) | SMS: test mode shows the code in the app until Twilio is set up |
| Market data, FX, SIP illustration, backtests | Brokerage and custody (fills recorded at live prices) |

The Satellite engine never cleared its own walk-forward gate (out-of-sample profit factor ≥ 1.1, positive expectancy, ≤ 20 % drawdown), so it stays in paper trading. Compliance values are illustrative planning defaults, not legal advice.

## Documentation

- [docs/README.md](docs/README.md): architecture, every feature with its files and functions, the API, data model and configuration.
- [docs/process/development-process.md](docs/process/development-process.md) and [module guide](docs/process/module-guide.md): how changes are planned, built, tested and released.
- [docs/plans/roadmap.md](docs/plans/roadmap.md): what was built in which order, and what's next.
- [CHANGELOG.md](CHANGELOG.md) (server and web) and [mobile/CHANGELOG.md](mobile/CHANGELOG.md) (phone).
