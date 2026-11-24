# Building a feature module

> How this codebase applies SOLID, and a checklist for adding a feature the same way.

## The idea

Each feature is a **module**: one folder that owns its logic, with a few small, named connection points (seams) to the rest of the app. A module can be switched off with one flag, and removed by deleting its folder plus a short list of marked lines. That keeps the app easy to change while two people work on it.

## SOLID, as used here

| Principle | What it means here | Example in the code |
|---|---|---|
| **Single responsibility** | A file does one job. Routes parse and authorise; `src/lib` decides; `db.ts` stores. | `src/lib/ai-consent.ts` only reads the person's AI answer. The pipeline decides what to do with it. |
| **Open/closed** | Add behaviour by registering something new, not by editing a central file. | Practice save: each simulator part calls `registerPracticeSlice()` (`mobile/src/lib/api/demo/persist.ts`). The saving code never changes when a new part appears. |
| **Liskov substitution** | Anything that stands in for something else keeps its contract. | The Practice simulator `satisfies Api`, so every screen works the same against it as against the live server. |
| **Interface segregation** | Depend on the small interface you need, not a big object. | The Practice checkouts get a `PayLedger` (`vaults`, `hold`, `release`, `pay`), not the whole simulator (`mobile/src/lib/api/pay-sim.ts`). |
| **Dependency inversion** | High-level code depends on an interface; the detail is plugged in. | ID checks go through `KycProvider` (`src/lib/kyc/types.ts`), so a licensed partner can replace the practice provider. Tests swap the vision model with `setIdExtractor()`. |

## Anatomy of a module

### Phone (`mobile/src/features/<name>/`)

| File | Purpose |
|---|---|
| `config.ts` | The switch, e.g. `export const WALLET_ENABLED = true`. Builds can tie it to `lib/build.ts`. |
| `index.ts` | The barrel: the only file other code imports from. |
| `README.md` | What it does, how to switch it off, and a table of every touch point outside the folder. |
| Screens, hooks, `model.ts` | Pure logic in `model.ts` (easy to test), UI in components, state in hooks or a small store. |

The route file in `mobile/src/app/` stays a one-line wrapper: `export default WalletScreen`.

### Server (`src/lib/<name>/` or `src/lib/<name>.ts`)

| File | Purpose |
|---|---|
| `config.ts` | Reads its env switch, e.g. `WALLET_ENABLED`. |
| `store.ts` | Its tables and queries. It creates its own tables on first use if it's removable. |
| Logic files | Pure rules separate from storage where possible (`plan.ts`, `policy.ts`). |
| `index.ts` | What routes may call. |
| `README.md` | Switch, removal steps, touch points. |

Routes in `src/app/api/v1/<name>/` call `customer()` or `admin()`, validate with zod, and call one function from the module.

## Seams to reuse

| Need | Seam | Where |
|---|---|---|
| Hear when an API call succeeds without touching screens | `observeApi()` | `mobile/src/lib/api/observe.ts` |
| Save simulator memory on the device | `registerPracticeSlice()` | `mobile/src/lib/api/demo/persist.ts` |
| Clear your module's data on Delete account | `onDeviceReset()` | `mobile/src/lib/storage.ts` |
| Ask the person something before an action | an imperative `ensureX()` that opens a sheet route | `mobile/src/features/ai-consent/ask.ts` |
| Swap an external provider | an interface plus a registry | `src/lib/kyc/types.ts`, `src/lib/kyc/service.ts` |
| Swap an outside service in tests (no network) | a `setX()` override that `null` resets | `setPriceProvider()` (`src/lib/invest/prices.ts`), `setBillReader()` (`src/lib/verification/stages/ai-read.ts`), `setIdExtractor()` (`src/lib/kyc/analyse.ts`) |
| Make a route a money move (MPIN, ID gate, device cap) | one line in the money map | `MONEY_ROUTES` in `src/lib/money-routes.ts` |
| Read request headers deep in the server | `requestHeaders()` | `src/lib/auth/context.ts` |
| Check whether the phone is in Practice | `isPracticeMode()`, `usePracticeMode()` | `mobile/src/lib/api/practice.ts` |

Features never import the Practice simulator (`mobile/src/lib/api/demo`) directly. They go through `lib/api/client.ts` and `lib/api/practice.ts`.

## Checklist for a new module

1. **Plan** it in `docs/plans/` (see the [development process](development-process.md)).
2. **Folder** under `mobile/src/features/` and, if it has server logic, `src/lib/`.
3. **Switch** in `config.ts`, off by default if it isn't finished.
4. **Barrel** in `index.ts`. Nothing outside imports deeper files.
5. **Seams, not edits.** Prefer registering (slices, observers, providers) over editing shared files. Where you must touch a shared file, add the fewest lines and mark them `// <name>`.
6. **Server first.** Put the rule on the server; mirror it in the simulator only if Practice needs it, and say so in a comment.
7. **Data**: own tables, created on first use or added through `migrate()` in `db.ts`. Clear phone storage through `onDeviceReset`.
8. **Tests**: server logic in `tests/<name>.test.ts`, phone logic in a `__tests__` folder next to it; keep logic in pure functions so it's easy to test. A rule that exists on both sides gets a contract vector ([Tests](#tests) below).
9. **README** with the switch and a removal table.
10. **Docs**: a page in `docs/features/` using the template below, plus any new routes, tables, env vars or commands in `docs/reference/`.

## Tests

| Side | Runner | Where tests go | Command |
|---|---|---|---|
| Server and web | Vitest (`vitest.config.mts`, setup `tests/setup.ts`) | `tests/<name>.test.ts`; shared helpers in `tests/helpers/` (for example `fakePrices()`) | `npm test` (root) |
| Phone | Jest with jest-expo (`mobile/jest.config.js`, setup `mobile/src/test/setup.ts`) | A `__tests__` folder next to the code, `<what>.test.ts`; never under `mobile/src/app/` (every file there is a screen). Helpers in `mobile/src/test/` | `npm test` (`mobile/`) |
| Both: contract tests | Each side's runner | One vector file per rule in `tests/contract/vectors/<rule>.json`; the server's runner `tests/contract/<rule>.test.ts`, the phone's `mobile/src/**/__tests__/contract-<rule>.test.ts` | Part of `npm test` on each side |

- Server tests never use the network: `tests/setup.ts` gives each run its own data folder, removes the Groq key, installs a fake price provider and makes `fetch` fail. Swap an outside service with its `setX()` seam, not by calling it.
- Phone tests import the module under test, not screens. The Practice simulator is tested through its functions (`mobile/src/test/practice.ts` runs calls under fake timers).
- **Contract vectors.** When the server and the phone (often the Practice simulator) both implement a rule, write its cases once in `tests/contract/vectors/<rule>.json` (`why`, `input`, `expected`) and run them against both copies. Change the rule, change the vector, and both suites must pass. Register a new vector file in both coverage lists (`tests/contract/vectors.test.ts` and `mobile/src/test/__tests__/contract-coverage.test.ts`), which fail on a vector file with no runner. Format and the rules covered: [tests/contract/README.md](../../tests/contract/README.md).

## Feature doc template

```markdown
# <Feature>
> One-line summary.
**Status:** built / Practice-simulated / partly built · **Switch:** <flag or "always on">
## What it does
## How it works
## Where the code is      (Server / Web app / Phone app tables: File | What it holds | Key exports)
## API endpoints          (Method | Path | Who can call | Purpose)
## Data
## Rules and limits
## Configuration
## Tests
## Known limits and open issues
## Maintainability notes
```

## Signs a module is going wrong

- A file over about 400 lines holding several jobs (`src/lib/invest/satellite.ts` today, S4 in the [maintainability review](../maintainability.md)). `src/lib/limits.ts`, `src/lib/recovery/service.ts` and the 530-line `runPipeline()` were split on 24 November 2026; their READMEs (`src/lib/limits/`, `src/lib/recovery/`, `src/lib/verification/`) show the shape to aim for: one job per file and a barrel that keeps the imports the same.
- Two copies of the same rule on the server and phone with no contract vector holding them together.
- The phone parsing human sentences from the server instead of reading a field.
- A shared file growing a new `if (featureX)` branch for every feature: use a registry instead.
