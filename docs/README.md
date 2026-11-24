  # Vaultwise documentation

Everything you need to understand, change and release Vaultwise. Start with the architecture, then read the feature you're working on.

> Written against commit `012a9fc` plus the Practice-save change and the server work for plans 03, 05, 06 and 07, 22 November 2026. If the code and a doc disagree, the code wins: fix the doc in the same pull request.

## Start here

| Doc | Read it when |
|---|---|
| [Architecture](architecture.md) | You're new, or a change crosses the server, web app and phone app |
| [Development process](process/development-process.md) | Before your first pull request, and before each release |
| [Building a feature module](process/module-guide.md) | Before you add a feature: how this codebase applies SOLID |
| [Security overview](security.md) | Before touching sign-in, PINs, money moves or personal data |
| [Maintainability review](maintainability.md) | When planning clean-up work |
| [Roadmap and plans](plans/roadmap.md) | To see what's next, in what order, and why |
| [Contracts](plans/contracts.md) | The interfaces agreed for plans 02 to 08, and where the code deviates ("Deviations as built") |

## Features

| Feature | Doc |
|---|---|
| Vaults, deposits, withdrawals, the ledger and the scheduler | [features/vaults.md](features/vaults.md) |
| Personal limits and emergency limit increases | [features/limits.md](features/limits.md) |
| Custom vault rules | [features/custom-rules.md](features/custom-rules.md) |
| Countries, currencies and per-market rules | [features/countries-and-compliance.md](features/countries-and-compliance.md) |
| Proof-of-purpose checks | [features/proof-verification.md](features/proof-verification.md) |
| AI: the Groq client, consent, assistant and live test | [features/ai.md](features/ai.md) |
| Emergency money | [features/emergency.md](features/emergency.md) |
| Fraud signals and the audit log | [features/fraud-and-audit.md](features/fraud-and-audit.md) |
| Wallet | [features/wallet.md](features/wallet.md) |
| Pay with Vaultwise | [features/pay-with-vaultwise.md](features/pay-with-vaultwise.md) |
| Investing | [features/investing.md](features/investing.md) |
| Sign-in, ID checks (KYC, including the PAN, DigiLocker and bank steps) and account recovery | [features/identity.md](features/identity.md) |
| MPIN: the server-checked PIN for every money move, and its lock | [features/mpin.md](features/mpin.md) |
| Registered devices, alerts and texted codes (OTP) | [features/devices-alerts-otp.md](features/devices-alerts-otp.md) |
| Running the server online: start-up guard, headers, rate limits, error ids, proxy trust, policy pages, backups | [features/running-online.md](features/running-online.md) |
| Practice mode (the on-phone simulator) | [features/practice-mode.md](features/practice-mode.md) |
| Account, onboarding and settings on the phone | [features/account-and-settings.md](features/account-and-settings.md) |
| Phone security today | [features/phone-security.md](features/phone-security.md) |

## Phone app

| Doc | What it covers |
|---|---|
| [App structure](mobile/app-structure.md) | Routes, guards, feature modules, build profiles, updates, tester build |
| [Data layer](mobile/data-layer.md) | The API client, live vs Practice, queries, storage |
| [Design system](mobile/design-system.md) | UI kit, theme, icons, haptics |

## Reference

| Doc | What it lists |
|---|---|
| [API](reference/api.md) | Every `/api/v1` route, who can call it, what it takes and returns |
| [Data model](reference/data-model.md) | Every database table, and every key the phone stores |
| [Configuration](reference/configuration.md) | Environment variables, feature switches, build profiles |
| [Commands](reference/commands.md) | Every script, the server deploy scripts, and the common Expo and EAS commands |

## Other docs in the repo

- [README.md](../README.md): what Vaultwise is, quick start, demo script, how the blueprint maps to the code.
- [mobile/README.md](../mobile/README.md): running the phone app, releases and updates.
- [deploy/README.md](../deploy/README.md): putting the server online step by step (AWS Lightsail, Caddy, systemd, backups), with [deploy/restore.md](../deploy/restore.md) for restoring.
- [mobile/DESIGN.md](../mobile/DESIGN.md) and [mobile/RESEARCH.md](../mobile/RESEARCH.md): the design rules and the research behind them.
- [CHANGELOG.md](../CHANGELOG.md) and [mobile/CHANGELOG.md](../mobile/CHANGELOG.md): what changed on the server and web app, and in each phone app version.
- Module READMEs sit next to the code they describe, for example [src/lib/wallet/README.md](../src/lib/wallet/README.md). Each one says how to switch the module off and how to remove it.

## Keeping docs current

- A pull request that changes behaviour updates the matching doc. Reviewers check it (see the [development process](process/development-process.md)).
- New feature: add a doc in `docs/features/` from the template in the [module guide](process/module-guide.md), and link it above.
- New route, table, environment variable or command: add it to the matching page in `docs/reference/`.
- Finished a plan: mark it done in the [roadmap](plans/roadmap.md) and move what was built into the feature docs.
