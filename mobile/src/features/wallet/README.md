# Wallet (phone)

A spending balance inside the app. Money comes in from the bank and goes out to a vault, to someone you pay, or back to the bank. The wallet shows what's safe to spend each day until payday, can have a daily spending limit, and can be where vault auto-saves come from. The server side is `src/lib/wallet` (see its README).

## What's here

| Screen | Route | What it does |
|---|---|---|
| Wallet | `wallet/index` (pushed) | Balance, safe to spend today with days to payday, Add money / Move to a vault / Pay someone / Cash out, the daily limit, where auto-saves come from, recent moves |
| Add money | `wallet/add` (full-screen modal) | Bank → wallet: amount, confirm, done |
| Move to a vault | `wallet/move` (`?vaultId=` skips the picker) | Wallet → vault: pick, amount, confirm with the vault's release contract, coin drop (`deposit.coinDrop`), milestone celebration if one is crossed. Never the other way |
| Pay someone | `wallet/spend` | Payee (with past payees), amount, review, press and hold to pay. `irreversible.commit` once paid, no celebration |
| Cash out | `wallet/cash-out` | Wallet → bank: amount, confirm. `irreversible.commit` once moved |
| Daily limit | `wallet/limit` | Turn on, lower, raise or turn off. Lower or turn on any time; raise or turn off once every 30 days, after the scam check |
| Home card | `HomeScreen` | Balance and safe to spend today; opens the Wallet screen |
| Limits card | `settings/limits` | The daily spending limit next to the vault limits; opens `wallet/limit` |

Money out (pay, cash out) is checked against the balance and what the daily limit still allows before anything is sent, with one `warning` haptic as an amount crosses a stop. If the server answers `kyc_required` (403), the flow says so calmly and links straight to the ID check (`VERIFY_ID_HREF`); `recovery_restricted` links to Settings. If a move gets no answer (a timeout or a dropped connection, `ApiError` status 0 or 504), it may still have gone through: the flow says it couldn't confirm it, refreshes the wallet, and offers "Check your wallet" instead of the same move again. While a recovery is being checked the server answers wallet reads with 403 `recovery_restricted` too: the Home card hides, and the Wallet screen and flows say the wallet is available once a person confirms it's you. When the server's wallet is off (`enabled: false`), only cashing out is offered, so money is never stuck.

Practice runs the same rules on the simulator (`lib/api/demo/wallet.ts`, seeded by `demo/wallet-state.ts`): the snapshot's payday (the income credit in the accounts fixture, the same day each month), part of the last payday in the wallet, everyday spending since, no daily limit to begin with, auto-saves from the bank. Settings → Delete account in Practice starts it over.

## Switch it off

Set `WALLET_ENABLED` to `false` in `config.ts`. Home and Your limits show no wallet, the wallet query isn't fetched, and the wallet routes go back Home. On the server, `WALLET_ENABLED=false` switches it off there (cashing out keeps working).

## Remove it completely

Delete this folder, `mobile/src/app/wallet/`, `mobile/src/lib/api/wallet.ts`, `mobile/src/lib/api/wallet-types.ts`, `mobile/src/lib/api/demo/wallet.ts` and `mobile/src/lib/api/demo/wallet-state.ts`, then remove each line marked `wallet`:

| Where | What to remove |
|---|---|
| `mobile/src/app/_layout.tsx` | the two `wallet/...` `Stack.Screen` lines |
| `mobile/src/lib/api/client.ts` | the `walletLive` import and `...walletLive` |
| `mobile/src/lib/api/demo/index.ts` | the `walletDemo` import and `...walletDemo` |
| `mobile/src/lib/api/keys.ts` | `qk.wallet` and `"wallet"` in `MONEY_QUERIES` |
| `mobile/src/lib/api/demo/state.ts` | the `wallet-state` import, `State.wallet` and `wallet: freshWallet()` |
| `mobile/src/features/home/HomeScreen.tsx` | the `WalletCard` import, `"wallet"` in `HOME_QUERIES`, and `<WalletCard />` |
| `mobile/src/features/home/activity-model.ts` | the `BankIcon`, `PaperPlaneRightIcon` and `WalletIcon` imports, the "From your wallet" detail in `deposit`, and the `wallet_top_up`, `wallet_spend` and `wallet_cash_out` cases |
| `mobile/src/features/account/settings/limits/LimitsScreen.tsx` | the `WalletLimitCard` import and `<WalletLimitCard />` |
| `src/lib/wallet` and `src/app/api/v1/wallet` (server) | see the server README |

No tables live on the phone. Nothing else needs undoing.
