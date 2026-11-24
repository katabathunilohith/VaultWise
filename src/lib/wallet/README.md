# Wallet (server)

A spending balance inside the app. Money comes in from the linked bank and goes out to a vault, to someone the customer pays, or back to the bank. A customer can also choose to have their vaults' auto-saves come from the wallet instead of the bank.

Money moves the same way as everything else here: each move the person makes is one double-entry journal on the ledger and two audit rows, in one transaction: the ledger's `ledger.<kind>` row (every journal gets one, from `post()` in `src/lib/ledger.ts`) and the wallet's own row for what the person did (`wallet.topped_up`, `wallet.moved_to_vault`, `wallet.spent`, `wallet.cashed_out`). A scheduled auto-save from the wallet writes only the ledger's row. The wallet is a ledger account of kind `wallet` and can never go below zero.

## What it does

| Move | Ledger | Journal kind | Counts toward the daily limit |
|---|---|---|---|
| Top up | bank → wallet | `wallet_top_up` | no |
| Move to a vault | wallet → vault | `deposit` (same as a bank deposit, so vault history reads the same) | no |
| Auto-save, when the customer chose the wallet | wallet → vault | `contribution_rule` | no |
| Spend (payee + optional note) | wallet → world | `wallet_spend` | yes |
| Cash out | wallet → bank | `wallet_cash_out` | yes |

Money never goes from a vault to the wallet. Vaults release money only through proof-checked withdrawals.

- **Daily limit** (optional, off by default). Turning it on or lowering it works any time. Raising it or turning it off works once per 30 days. Spends and cash-outs count toward it, per calendar day in the customer's own time zone (midnight in their country's main zone, from `src/lib/timezones.ts`; India is Asia/Kolkata), so "resets at midnight" is their midnight wherever the server runs. Payday days and personal limits still use the server's day.
- **Auto-save source**: `bank` (default) or `wallet`. Only fixed recurring rules follow it. Percent-of-income rules and round-ups stay on the bank, because they are tied to money arriving in or leaving the bank. A run the wallet can't cover is recorded as `contribution.missed` and skipped, exactly like a run the bank can't cover today; the bank is not used as a fallback. Each run (paid or missed) commits together with its move of the vault's next run date, so a failure part-way through a catch-up never pays a run twice (`runDueWalletContributions()`, like `runDueContributions()` in `src/lib/vaults.ts`).
- **Payday** = last income credit + the median gap between the last seven paydays (credits on the same day count as one). With one payday, the gap is 30 days. With none, payday is 30 days from now. A payday that passed with no income rolls forward by whole gaps. Days to payday is at least 1.
- **Safe to spend today** = max(0, balance − fixed auto-saves due from the wallet before payday) ÷ days to payday, rounded down, then capped by what is left of the daily limit if one is set.

## Files

| File | What |
|---|---|
| `config.ts` | the switch, `WalletError` (an `HttpError` with a `code`) |
| `store.ts` | the module's tables, created on first use per database: `wallet_settings`, `wallet_payments` (payee and note of each spend) |
| `plan.ts` | payday estimate, auto-saves due from the wallet, spent today, limit state, safe to spend |
| `moves.ts` | top up, move, spend, cash out, settings, and the scheduler's wallet auto-save run |
| `view.ts` | what `GET /api/v1/wallet` returns, and recent wallet activity |
| `index.ts` | the module's public surface |

## API

All amounts in requests are major units. All amounts in responses are minor units. Errors are `{ error, code? }`.

Money routes opt in with `customer({ money: "<action>" })`: the policy map in `src/lib/money-routes.ts` decides the ID-check gate, and the route checks the body's `pin` (the MPIN, see `src/lib/mpin/README.md`) and, for money out, the new-device cap (`src/lib/devices`).

| Route | Access | Body | Answer |
|---|---|---|---|
| `GET /api/v1/wallet` | `customer({ access: "read" })` | | `WalletView` (see `view.ts`) |
| `POST /api/v1/wallet/top-up` | `customer({ tick: false, money: "wallet_top_up" })` (money in from the bank: the ID gate, no MPIN) | `{ amount }` | 201 `{ journalId, wallet }` |
| `POST /api/v1/wallet/move` | `customer({ tick: false, money: "wallet_move" })` | `{ vaultId, amount, pin }` | 201 `{ journalId, wallet }` |
| `POST /api/v1/wallet/spend` | `customer({ tick: false, money: "wallet_spend" })`, new-device cap | `{ amount, payee, note?, pin }` | 201 `{ journalId, wallet }` |
| `POST /api/v1/wallet/cash-out` | `customer({ tick: false, money: "wallet_cash_out" })`, new-device cap | `{ amount, pin }` | 201 `{ journalId, wallet }` |
| `PUT /api/v1/wallet/settings` | `customer({ tick: false })`; raising or removing the daily limit checks the MPIN as `wallet_limit_raise` | `{ dailyLimit?: number \| null, autoSaveSource?: "bank" \| "wallet", pin? }` | 200 `{ wallet }` |

Error codes from this module: `insufficient_funds`, `daily_limit`, `limit_raise_locked` (409), `bad_amount`, `bad_payee`, `vault_closed`, `wallet_off` (404).

## Switch it off

Set `WALLET_ENABLED=false` on the server. Then:

- top-up, move, spend and settings changes answer 404 `wallet_off`;
- auto-saves draw from the bank again, whatever the customer chose (their choice is kept for when it comes back);
- `GET /api/v1/wallet` still answers, with `enabled: false`, and cash-out still works, so money already in a wallet is never stuck.

## Remove it completely

1. Make sure every wallet balance is zero (cash everyone out), or the money stays on the ledger in `wallet` accounts.
2. Delete `src/lib/wallet/`, `src/app/api/v1/wallet/` and `tests/wallet.test.ts`.
3. Remove each line marked `// wallet`:

| Where | What to remove |
|---|---|
| `src/lib/ledger.ts` | `"wallet"` in `AccountKind`, in `NON_NEGATIVE`, and the `wallet: "Wallet"` account name |
| `src/lib/scheduler.ts` | the `./wallet` import, and the `if` around `runDueContributions` (keep `runDueContributions(user, now)`) |

The module's tables (`wallet_settings`, `wallet_payments`) are created on first use and nothing else reads them, so they can be dropped or left. Wallet journals stay in the ledger history; `/api/v1/activity` lists them like any other journal (entries show the account `Wallet`, kind `wallet`).
