import { all, get } from "../db";
import { balanceOf, userAccount } from "../ledger";
import type { User } from "../users";
import { walletEnabled } from "./config";
import { walletAccount } from "./moves";
import { limitState, paydayEstimate, safeToSpend, spentOn, upcomingFromWallet } from "./plan";
import { timeZoneFor } from "../timezones";
import { ensureWalletTables, paymentById, walletSettings, type AutoSaveSource } from "./store";

export type WalletActivityKind = "top_up" | "move" | "auto_save" | "spend" | "cash_out" | "other";

export interface WalletActivity {
  id: string;
  kind: WalletActivityKind;
  memo: string;
  /** Signed, minor units: positive into the wallet, negative out of it. */
  amount: number;
  createdAt: number;
  /** "Your bank", the vault's name, or the payee. */
  counterparty: string | null;
  /** The note on a spend, if any. */
  note: string | null;
}

export interface WalletView {
  enabled: boolean;
  currency: string;
  balance: number;
  bankBalance: number;
  safeToSpendToday: number;
  daysToPayday: number;
  nextPayday: number;
  paydayBasis: "income" | "default";
  dailyLimit: number | null;
  spentToday: number;
  limitLeftToday: number | null;
  limitRaiseAvailable: boolean;
  nextRaiseAt: number | null;
  autoSaveSource: AutoSaveSource;
  upcomingFromWallet: number;
  recent: WalletActivity[];
}

const KINDS: Record<string, WalletActivityKind> = {
  wallet_top_up: "top_up",
  deposit: "move",
  contribution_rule: "auto_save",
  wallet_spend: "spend",
  wallet_cash_out: "cash_out",
};

export function walletActivity(user: User, limit = 20): WalletActivity[] {
  ensureWalletTables();
  const rows = all<{ id: string; kind: string; memo: string; ref_type: string | null; ref_id: string | null; created_at: number; amount: number }>(
    `SELECT j.id, j.kind, j.memo, j.ref_type, j.ref_id, j.created_at, e.amount
     FROM ledger_entries e JOIN journals j ON j.id = e.journal_id
     WHERE e.account_id = ? ORDER BY e.created_at DESC, e.id DESC LIMIT ?`,
    walletAccount(user).id,
    limit,
  );
  return rows.map((r) => {
    const kind = KINDS[r.kind] ?? "other";
    let counterparty: string | null = null;
    let note: string | null = null;
    if (kind === "top_up" || kind === "cash_out") counterparty = "Your bank";
    else if (r.ref_type === "vault" && r.ref_id) counterparty = get<{ name: string }>("SELECT name FROM vaults WHERE id = ?", r.ref_id)?.name ?? null;
    else if (r.ref_type === "wallet_payment" && r.ref_id) {
      const p = paymentById(r.ref_id);
      counterparty = p?.payee ?? null;
      note = p?.note ?? null;
    }
    return { id: r.id, kind, memo: r.memo, amount: r.amount, createdAt: r.created_at, counterparty, note };
  });
}

/** Everything the wallet screen shows, in minor units. */
export function walletView(user: User, now = Date.now()): WalletView {
  ensureWalletTables();
  const wallet = walletAccount(user);
  const settings = walletSettings(user.id);
  const source: AutoSaveSource = walletEnabled() ? settings.autoSaveSource : "bank";
  const balance = balanceOf(wallet.id);
  const payday = paydayEstimate(user.id, now);
  const upcoming = upcomingFromWallet(user.id, source, payday.nextPayday);
  // The daily limit's day is the customer's own (their market's time zone), not the server's.
  const limits = limitState(settings, spentOn(wallet.id, now, timeZoneFor(user)), now);
  return {
    enabled: walletEnabled(),
    currency: user.currency,
    balance,
    bankBalance: balanceOf(userAccount(user.id, "bank", user.currency).id),
    safeToSpendToday: safeToSpend({ balance, upcoming, daysToPayday: payday.daysToPayday, limitLeftToday: limits.limitLeftToday }),
    daysToPayday: payday.daysToPayday,
    nextPayday: payday.nextPayday,
    paydayBasis: payday.basis,
    dailyLimit: limits.dailyLimit,
    spentToday: limits.spentToday,
    limitLeftToday: limits.limitLeftToday,
    limitRaiseAvailable: limits.limitRaiseAvailable,
    nextRaiseAt: limits.nextRaiseAt,
    autoSaveSource: source,
    upcomingFromWallet: upcoming,
    recent: walletActivity(user),
  };
}
