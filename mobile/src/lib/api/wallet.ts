/**
 * Wallet API (live). client.ts spreads these into `live`, and demo/wallet.ts implements the same
 * methods for Practice. Amounts go out in major units; responses come back in minor units.
 * See mobile/src/features/wallet/README.md.
 */
import { post, request } from "./http";
import type { Wallet, WalletMoveResult, WalletSettingsInput, WalletSettingsResult } from "./wallet-types";

export type { AutoSaveSource, Wallet, WalletActivity, WalletActivityKind, WalletMoveResult, WalletSettingsInput, WalletSettingsResult } from "./wallet-types";

export const walletLive = {
  wallet: () => request<Wallet>("/wallet"),
  /** Bank → wallet. */
  walletTopUp: (amountMajor: number) => post<WalletMoveResult>("/wallet/top-up", { amount: amountMajor }),
  /** Wallet → vault. Money never goes the other way: vaults release only against proof. `pin`: the MPIN (features/mpin). */
  walletMove: (vaultId: string, amountMajor: number, pin?: string) => post<WalletMoveResult>("/wallet/move", { vaultId, amount: amountMajor, pin }),
  /** Wallet → someone else. Counts toward the daily limit. */
  walletSpend: (amountMajor: number, payee: string, note?: string | null, pin?: string) =>
    post<WalletMoveResult>("/wallet/spend", { amount: amountMajor, payee, note: note ?? null, pin }),
  /** Wallet → bank. Counts toward the daily limit. */
  walletCashOut: (amountMajor: number, pin?: string) => post<WalletMoveResult>("/wallet/cash-out", { amount: amountMajor, pin }),
  /**
   * `dailyLimit: null` turns the limit off. Lowering or turning on works any time; raising or turning off, once per 30 days,
   * with the MPIN in `input.pin`.
   */
  walletSettings: (input: WalletSettingsInput) => request<WalletSettingsResult>("/wallet/settings", { method: "PUT", body: JSON.stringify(input) }),
};
