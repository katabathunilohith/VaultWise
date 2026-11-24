# How this was built

> A short, honest note on how Vaultwise was made: who decided what, what the AI coding assistant did, and how the work was checked.

## In short

Vaultwise is a two-person student capstone. Much of the code and the docs were written with an AI coding assistant (Claude Code), directed and reviewed by the two students. The repo shows this openly:

- [CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md) in the root, and [mobile/AGENTS.md](../mobile/AGENTS.md), are instructions for the assistant (for example: read the framework's docs for the exact version in use before writing code).
- Plan headers name who did what, for example plan 03: "Owner: Claude (code), Shaik (review)" ([plans/03-mpin.md](plans/03-mpin.md)).

The assistant wrote code and docs to the students' plans. The students decided what to build, in what order, and what was accepted.

## What the students decided

| Decision | Where it shows |
|---|---|
| Product direction: purpose-locked savings released against proof, an emergency path that never waits, then a phone-first app | [README.md](../README.md); the commit "switch to mobile app" (`24ee17d`) |
| Scope: what is real and what is simulated; public builds stay Practice-only; SQLite until the end | README, "What's real and what's simulated"; roadmap step 9, [PostgreSQL](plans/09-postgres.md): "Later (on purpose: SQLite until the end)" |
| Priorities: the order of the roadmap steps | [plans/roadmap.md](plans/roadmap.md), "Principles behind the order" |
| Accepting or rejecting each change | Reviews of the assistant's work before it was kept; plan headers ("Shaik (review)") |
| Account set-up and anything needing a real identity: Firebase, Expo and EAS, AWS, Twilio, Setu sandbox keys, the MobSF scan | roadmap, "What only you can do" |

The assistant never created accounts, held keys or chose scope.

## The process, as the repo shows it

1. **Plans first.** Each step on the [roadmap](plans/roadmap.md) has a plan file ([01](plans/01-practice-data-saved.md) to [09](plans/09-postgres.md)) with a goal, scope, design, changes, tests, acceptance criteria, risks and "who does what". Code was written against the plan, and the plan was updated when the step was done.
2. **Contracts as binding interfaces.** [plans/contracts.md](plans/contracts.md) fixes the interfaces for plans 02 to 08 (error shapes, headers, the MPIN rules, devices, OTP, KYC) so the server, web app, phone app and Practice simulator agree. "Change this file first if a contract has to change." Where the built code differs, it is recorded under [Deviations as built](plans/contracts.md#deviations-as-built).
3. **Parallel work with strict file ownership.** Larger steps were split across several assistant sessions working at the same time, each given a fixed list of files it could change. The [module guide](process/module-guide.md) makes this possible: one folder per feature, small seams, and lines in shared files marked with the module's name (`// mpin`, `// wallet`), so every change can be found, reviewed and removed.
4. **Independent review passes.** Separate review passes, run apart from the work they reviewed, looked for problems in the new code. Four reviews of the server and web app and two of the phone app found real issues, including several rated High (for example a way to take over the MPIN through a new phone number). Every finding and its fix is in [security.md](security.md#security-review-2026-11-22). A maintainability review listed bugs, duplication and files doing too many jobs, with IDs used in later fixes ([maintainability.md](maintainability.md)).
5. **Tests as the safety net.** `npm test` runs the server tests in `tests/`. Each test file gets its own throwaway database and never calls the AI provider (`tests/setup.ts`). A random test (`tests/fuzz.test.ts`) checks every ledger rule after each of hundreds of operations. There is an end-to-end API suite (`npm run test:e2e`) and a live AI check (`npm run test:ai`). CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and a build for the server and the phone app.
6. **Docs in the same change.** A change that alters behaviour updates its doc in the same change ([docs/README.md](README.md), "Keeping docs current"). Feature docs list the files and functions they describe, so a reviewer can check them against the code.

## Being able to explain it

The students should be able to explain any part of the code without the tool. That is the rule for keeping a change: if neither of us can explain it, it isn't finished.

To prepare, the [walkthroughs](walkthroughs/ledger.md) cover the core: [the ledger](walkthroughs/ledger.md), [the MPIN](walkthroughs/mpin.md) and [the verification pipeline](walkthroughs/verification-pipeline.md). Each one follows the code step by step, lists the rules with their tests, and ends with exercises: run a test, change one value, and see which test fails.

## What this approach got wrong, or left open

- **Large commits.** Most work reached `main` in a few very large commits (several touch more than 300 files), so the history doesn't show the steps or who reviewed what. Only one pull request (#1) is in the history, although the [development process](process/development-process.md) asks for a reviewed pull request per change.
- **Confident mistakes.** AI-written code can look finished and still be wrong. The review passes found High-severity issues in new code that looked finished. That is why the reviews and tests matter more than how the code looks.
- **Not everything is tried on real devices or services.** The roadmap marks what still needs a real phone, Twilio or Setu's sandbox.

## Contributions

To be filled in by the two team members. Don't infer it from the commit counts below.

| Area | Shaik Aayan Javed | Lohith Katabathuni |
|---|---|---|
| Product idea and direction | | |
| Scope and priorities (roadmap order) | | |
| Plans written or approved | | |
| Server and web app: directed and reviewed | | |
| Phone app: directed and reviewed | | |
| Testing by hand (browser, phones) | | |
| Accounts and set-up (Firebase, Expo, AWS, Twilio, Setu) | | |
| Docs and capstone report | | |
| Demo and backup video | | |

Commit counts from `git shortlog -sne --all` on 24 November 2026:

| Name | Commits |
|---|---|
| Shaik Aayan Javed | 5 |
| Lohith Katabathuni | 3 (one is the merge of pull request #1) |

Commit counts understate the work and say little about who did what: there are only 8 commits, several of them very large, and a commit's author is whoever committed it, not whoever planned, directed or reviewed the change.

## Commit practice from now on

- **Small commits, one change per commit.** A bug fix, a refactor and a new feature go in separate commits.
- **Clear messages.** In the imperative, saying what changed and why: `Add MPIN lockout after five wrong tries`. See [Branches and commits](process/development-process.md#branches-and-commits).
- **A branch and a pull request per change**, reviewed by the other student before it reaches `main` ([Review](process/development-process.md#5-review)).
- **Tests and docs in the same commit or pull request** as the change they cover.
- **Say when the assistant wrote it.** If an AI assistant wrote most of a commit, note it in the message (for example a `Co-Authored-By:` line). The person who commits it has reviewed it and can explain it.
