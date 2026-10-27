/**
 * wallet: response shapes of `/api/v1/wallet` (WalletView in src/lib/wallet/view.ts on the server).
 * Money in responses is minor units; the request bodies the client sends are major units.
 */
import type { Millis, Minor } from "./types";

/** Where vault auto-saves come from. The bank is the default, so nothing changes until chosen. */
export type AutoSaveSource = "bank" | "wallet";

/** top_up: bank → wallet. move / auto_save: wallet → vault. spend: wallet → a payee. cash_out: wallet → bank. */
export type WalletActivityKind = "top_up" | "move" | "auto_save" | "spend" | "cash_out" | "other";

export interface WalletActivity {
  id: string;
  kind: WalletActivityKind;
  memo: string;
  /** Signed: positive into the wallet, negative out of it. */
  amount: Minor;
  createdAt: Millis;
  /** "Your bank", the vault's name, or the payee. */
  counterparty: string | null;
  /** The note on a payment, if any. */
  note: string | null;
}

export interface Wallet {
  /** False when the server has the wallet switched off: only cashing out still works. */
  enabled: boolean;
  currency: string;
  balance: Minor;
  /** What the bank has, for adding money. */
  bankBalance: Minor;
  safeToSpendToday: Minor;
  /** Calendar days to payday, today included. At least 1. */
  daysToPayday: number;
  nextPayday: Millis;
  /** "default" when there was no income to go on, so payday is a 30-day guess. */
  paydayBasis: "income" | "default";
  /** Null when there's no daily limit. */
  dailyLimit: Minor | null;
  /** Spends and cash-outs today (the local calendar day). */
  spentToday: Minor;
  /** What the limit still allows today; null with no limit. */
  limitLeftToday: Minor | null;
  /** Whether raising (or turning off) the limit is allowed now. */
  limitRaiseAvailable: boolean;
  /** When a raise is next allowed; null when it's allowed now. */
  nextRaiseAt: Millis | null;
  autoSaveSource: AutoSaveSource;
  /** Fixed auto-saves due from the wallet before payday (0 while they come from the bank). */
  upcomingFromWallet: Minor;
  /** The last 20 movements, newest first. */
  recent: WalletActivity[];
}

/** What a money move answers (201). */
export interface WalletMoveResult {
  journalId: string;
  wallet: Wallet;
}

/** Settings change, in major units. `dailyLimit: null` turns the limit off. */
export interface WalletSettingsInput {
  dailyLimit?: number | null;
  autoSaveSource?: AutoSaveSource;
}

export interface WalletSettingsResult {
  wallet: Wallet;
}

/** The server's limits on a single amount, in major units. */
export const WALLET_MAX_AMOUNT = 100_000_000;
export const WALLET_PAYEE_MAX = 80;
export const WALLET_NOTE_MAX = 200;
