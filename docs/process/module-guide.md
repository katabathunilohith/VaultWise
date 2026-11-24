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
8. **Tests**: server logic in `tests/<name>.test.ts`; keep phone logic in pure functions so it's testable once the phone gets a test runner.
9. **README** with the switch and a removal table.
10. **Docs**: a page in `docs/features/` using the template below, plus any new routes, tables, env vars or commands in `docs/reference/`.

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

- A file over about 400 lines holding several jobs (see `src/lib/limits.ts` and `src/lib/verification/pipeline.ts` in the [maintainability review](../maintainability.md)).
- Two copies of the same rule on the server and phone that have started to differ.
- The phone parsing human sentences from the server instead of reading a field.
- A shared file growing a new `if (featureX)` branch for every feature: use a registry instead.
