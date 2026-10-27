/**
 * wallet: the Practice wallet's starting state, kept in S.wallet (state.ts) so a reset brings it
 * back. It follows the snapshot's payday (the income credit in the accounts fixture, on the same
 * day each month): part of the last payday went into the wallet, and everyday spending has taken
 * it down since. Everything is dated relative to now, so the numbers stay believable whatever day
 * Practice is opened.
 *
 * This file imports nothing from state.ts, so state.ts can build its state from it.
 */
import accountsFx from "@/data/fixtures/accounts.json";
import vaultsFx from "@/data/fixtures/vaults.json";
import type { Millis, Minor } from "../types";
import type { AutoSaveSource, WalletActivity } from "../wallet-types";

export interface WalletState {
  balance: Minor;
  dailyLimit: Minor | null;
  /** When the limit was last raised or turned off (that's allowed once per 30 days). */
  limitRaisedAt: Millis | null;
  autoSaveSource: AutoSaveSource;
  /** Income credits into the bank, newest first: what payday is worked out from. */
  incomes: Millis[];
  /** Wallet movements, newest first. */
  moves: WalletActivity[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The share of each payday that goes into the wallet for everyday spending. */
const PAYDAY_TOP_UP: Minor = 3_600_000;

/** Small everyday spends, one most mornings (payee, minor units). */
const MORNING: [string, Minor][] = [
  ["Corner Café", 18_000],
  ["Daily Bread Bakery", 14_000],
  ["QuickCab", 31_000],
  ["Corner Café", 22_000],
  ["City Metro card", 50_000],
  ["Green Leaf Pharmacy", 42_000],
  ["Corner Café", 18_000],
];
/** Bigger spends, every other evening. */
const EVENING: [string, Minor, string | null][] = [
  ["Fresh Mart", 124_000, "Groceries for the week"],
  ["Spice Route", 160_000, "Dinner with Sam"],
  ["Book Nook", 65_000, null],
  ["Cinema Central", 76_000, null],
  ["Fresh Mart", 98_000, null],
];

/** The snapshot's payday: the income credit in the accounts fixture. */
function snapshotPayday() {
  const credit = (accountsFx as { transactions: { category: string; direction: string; created_at: number }[] }).transactions.find(
    (t) => t.direction === "credit" && t.category === "income",
  );
  return new Date(credit?.created_at ?? Date.UTC(2026, 9, 2)).getDate();
}

/** The last four paydays (newest first): 9 am on the snapshot's payday of each month, all in the past. */
function pastPaydays(now: number): Millis[] {
  const day = Math.min(28, snapshotPayday());
  const d = new Date(now);
  let month = d.getMonth();
  let year = d.getFullYear();
  if (new Date(year, month, day, 9).getTime() > now) month -= 1;
  return [0, 1, 2, 3].map((k) => new Date(year, month - k, day, 9).getTime());
}

let seq = 0;
const id = () => `wmv_seed${++seq}`;

export function freshWallet(now = Date.now()): WalletState {
  const incomes = pastPaydays(now);
  const payday = incomes[0];
  const rainyDay = (vaultsFx as { vaults: { name: string; category: string }[] }).vaults.find((v) => v.category === "emergency")?.name ?? "Rainy Day Fund";

  const moves: WalletActivity[] = [];
  const add = (at: Millis, m: Omit<WalletActivity, "id" | "createdAt">) => {
    if (at < now) moves.push({ id: id(), createdAt: at, ...m });
  };
  add(payday + HOUR, { kind: "top_up", memo: "Added to your wallet · From your bank", amount: PAYDAY_TOP_UP, counterparty: "Your bank", note: null });
  const dayStart = new Date(payday);
  dayStart.setHours(0, 0, 0, 0);
  for (let n = 1; dayStart.getTime() + n * DAY < now; n++) {
    const day = new Date(dayStart);
    day.setDate(day.getDate() + n);
    const at = (h: number, m: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
    if (n % 7 !== 6) {
      const [payee, amount] = MORNING[n % MORNING.length];
      add(at(9, 10), { kind: "spend", memo: `Paid ${payee} · From your wallet`, amount: -amount, counterparty: payee, note: null });
    }
    if (n === 5) add(at(12, 0), { kind: "move", memo: `Contribution to ${rainyDay} · From your wallet`, amount: -200_000, counterparty: rainyDay, note: null });
    if (n === 8) add(at(18, 0), { kind: "cash_out", memo: "Moved to your bank · From your wallet", amount: -300_000, counterparty: "Your bank", note: null });
    if (n % 2 === 0) {
      const [payee, amount, note] = EVENING[(n / 2) % EVENING.length];
      add(at(19, 30), { kind: "spend", memo: `Paid ${payee} · From your wallet`, amount: -amount, counterparty: payee, note });
    }
  }
  moves.sort((a, b) => b.createdAt - a.createdAt);

  return {
    balance: moves.reduce((s, m) => s + m.amount, 0),
    // Off to begin with, as on the server: turning one on is always allowed.
    dailyLimit: null,
    limitRaisedAt: null,
    autoSaveSource: "bank",
    incomes,
    moves,
  };
}
