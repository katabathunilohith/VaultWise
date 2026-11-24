# Investing (server)

The risk profile, the **Core** sleeve (a model portfolio of index ETFs: one-off buys and recurring SIPs, paid from
the linked bank, never from a vault) and the opt-in **Satellite** sleeve (a systematic paper-trading engine with
backtests and a governance gate). All money is pretend and execution is simulated; prices are real, delayed quotes.

## Switch

None. Satellite availability per region comes from `src/lib/compliance.ts` (`rulesFor(jurisdiction).satellite`).

## Prices: the provider seam (B21)

Every price read goes through `getSeries()` / `latestPrice()` in `market.ts`, which ask the **price provider**
(`prices.ts`) and cache the answer in `market_cache` (5 minutes for hourly bars up to 12 hours for monthly).

| Piece | What |
|---|---|
| `PriceProvider` | `{ source, fetchCandles(symbol, interval, range) }`: candles oldest first plus their currency; throws when unavailable. `interval` is never `4h` (4-hour bars are built from hourly ones). |
| `yahooProvider` (`yahoo.ts`) | The default: the Yahoo Finance chart API, 12-second timeout. The only file that calls Yahoo. |
| `setPriceProvider(p \| null)` | Swaps the provider; `null` goes back to Yahoo. Tests use it (`tests/helpers/prices.ts`: `fakePrices()`, `downPrices()`); the test setup installs the fake for every test file, and blocks `fetch`, so no test reaches the network. |

When the provider fails, `getSeries()` falls back to the stale cache, then to `syntheticCandles()` (a deterministic
random walk). A series' `source` is the provider's name (`"yahoo"`), `"cache"` or `"synthetic"`.

## Strategies are per customer (B9)

`strategies` (in `src/lib/db.ts`) has one row per customer and strategy, key `(user_id, id)`, where `id` is
`strategyId(symbol, tf)` (`smc:BTC-USD:1h`). `backtestMarket()` saves only the caller's row and
`satelliteOverview()` reads only the caller's rows (`strategies.ts`: `strategyFor()`, `saveStrategyBacktest()`). The
reviewer console lists everyone's (`allStrategies()`, with the customer's name). Databases from before this change
are migrated on open (`splitSharedStrategies()` in db.ts): each old shared row goes to the customer who ran that
backtest (the newest `strategy.gate_*` audit entry for it); a row with no such entry is dropped.

## Money actions (MPIN)

From the policy map in `src/lib/money-routes.ts`; each takes the MPIN as `pin` in the JSON body and checks it with
`requireMpin()` before any money moves (errors `mpin_required` 401, `mpin_wrong` 403, `mpin_locked` 423).

| Route | Action | MPIN | ID gate |
|---|---|---|---|
| `POST /api/v1/invest/core/buy` | `invest_buy` | always | yes |
| `POST /api/v1/invest/core/sip` | `invest_sip` | setting one up, or a change that moves more money (`sipNeedsMpin()` in `sip-rule.ts`) | yes |
| `DELETE /api/v1/invest/core/sip` (pause) | | no | no |
| `POST /api/v1/invest/satellite/opt-in` | `satellite_opt_in` | always (opting in and every later allocation) | yes |
| `POST /api/v1/invest/satellite/opt-out` | | no (money goes back to the bank) | no |
| `POST /api/v1/invest/satellite/run` | | no: it records paper positions only and never moves ledger money | yes (unchanged) |

`sipNeedsMpin(current, next)`: no active plan → yes; a higher amount per month than now (weekly counts as 52/12 a
month, so monthly → weekly at the same amount is a raise) → yes; a `startDate` before the current next debit (a past
date runs up to 6 missed debits at once) → yes; otherwise (lower, the same, or later) → no. It is pure and has no
imports, so the web form (`src/app/invest/core/page.tsx`) imports `sip-rule.ts` directly to show the MPIN box by the
same rule; the server's check is the one that counts. SIP debits made later by the scheduler (`runDueSips()`) need no
PIN: they were authorised when the plan was set up or raised.

## Files

| File | What |
|---|---|
| `profile.ts` | Questionnaire, `scoreAnswers()`, risk bands, `modelPortfolio()` (pure) |
| `market.ts` | `getSeries()`, `latestPrice()`, the cache, `syntheticCandles()`, `SATELLITE_UNIVERSE` |
| `prices.ts`, `yahoo.ts` | The price-provider interface and registry; the Yahoo adapter |
| `core.ts` | `executeSip()` (buys), `coreHoldings()`, SIP plans (`activeSip()`, `upsertSip()`, `cancelSip()`, `runDueSips()`), history and projection |
| `sip-rule.ts` | `sipNeedsMpin()`, `sipPerMonth()` (pure, browser-safe) |
| `satellite.ts` | Eligibility, opt-in/out, the paper engine, overview, `backtestMarket()`, `marketAnalysis()` |
| `strategies.ts` | Per-customer strategy rows |
| `smc.ts`, `backtest.ts` | The Smart Money Concepts analysis and the walk-forward backtest (pure) |
| `index.ts` | The module's public surface: import from `@/lib/invest` (the browser imports only `sip-rule.ts`) |

Tables (in `src/lib/db.ts`): `sip_plans`, `holdings`, `orders`, `strategies`, `paper_positions`, `paper_state`,
`market_cache`.

## Touch points outside this folder

| File | What |
|---|---|
| `src/app/api/v1/invest/**`, `dashboard`, `portfolio`, `admin/overview` | The routes |
| `src/lib/scheduler.ts` | `runDueSips()` on every tick |
| `src/lib/seed.ts` | Practice data buys and runs the paper engine |
| `src/lib/money-routes.ts` | `invest_buy`, `invest_sip`, `satellite_opt_in` |
| `src/app/invest/**` | The web screens (MPIN boxes for buy, SIP and opt-in) |
| `tests/scheduler.test.ts`, `tests/invest-money.test.ts`, `tests/invest-strategies.test.ts`, `tests/smc.test.ts`, `tests/invest-profile.test.ts` | Tests |
