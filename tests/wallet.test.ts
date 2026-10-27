import { afterEach, describe, expect, it } from "vitest";
import { all, get } from "@/lib/db";
import { accountHistory, balanceOf, LedgerError, reconcile, transfer, userAccount, worldAccount } from "@/lib/ledger";
import { tick } from "@/lib/scheduler";
import { createUser, type User } from "@/lib/users";
import { createVault, getVaultRow } from "@/lib/vaults";
import {
  autoSaveSource,
  cashOut,
  DAY_MS,
  moveToVault,
  paydayEstimate,
  RAISE_WINDOW_MS,
  runDueWalletContributions,
  safeToSpend,
  spend,
  topUp,
  updateWalletSettings,
  walletAccount,
  walletSettings,
  walletView,
  WalletError,
} from "@/lib/wallet";

const HOUR = 3_600_000;

function newCustomer(name: string, funds: number, ts?: number) {
  const u = createUser({ name, jurisdiction: "US", pin: "1111" });
  transfer({ userId: u.id, from: worldAccount("USD").id, to: userAccount(u.id, "bank", "USD").id, amount: funds, kind: "income", memo: "seed", ts });
  return () => get<User>("SELECT * FROM users WHERE id = ?", u.id)!;
}

const bankOf = (u: User) => balanceOf(userAccount(u.id, "bank", u.currency).id);
const walletOf = (u: User) => balanceOf(walletAccount(u).id);
const vaultBalance = (u: User, vaultId: string) => balanceOf(getVaultRow(u, vaultId).account_id);

function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e instanceof WalletError ? e.code : e instanceof LedgerError ? "ledger" : String(e);
  }
  return null;
}

afterEach(() => {
  delete process.env.WALLET_ENABLED;
});

describe("wallet money moves", () => {
  it("tops up from the bank, moves to a vault, spends and cashes out, keeping the ledger balanced", () => {
    const fresh = newCustomer("Wally Spender", 1_000_00);
    const vaultId = createVault(fresh(), { name: "Health", category: "health", target: 2_000_00 });

    topUp(fresh(), 400_00);
    expect(bankOf(fresh())).toBe(600_00);
    expect(walletOf(fresh())).toBe(400_00);

    const moveJournal = moveToVault(fresh(), vaultId, 100_00);
    expect(walletOf(fresh())).toBe(300_00);
    expect(vaultBalance(fresh(), vaultId)).toBe(100_00);
    // Vault history reads like any deposit.
    const hist = accountHistory(getVaultRow(fresh(), vaultId).account_id);
    expect(hist[0]).toMatchObject({ journal_id: moveJournal, kind: "deposit", ref_type: "vault", ref_id: vaultId, amount: 100_00 });

    spend(fresh(), { amount: 45_50, payee: "Corner Shop", note: "Groceries" });
    expect(walletOf(fresh())).toBe(254_50);

    cashOut(fresh(), 54_50);
    expect(walletOf(fresh())).toBe(200_00);
    expect(bankOf(fresh())).toBe(654_50);

    const view = walletView(fresh());
    expect(view.balance).toBe(200_00);
    expect(view.bankBalance).toBe(654_50);
    expect(view.recent.map((r) => [r.kind, r.amount, r.counterparty])).toEqual([
      ["cash_out", -54_50, "Your bank"],
      ["spend", -45_50, "Corner Shop"],
      ["move", -100_00, "Health"],
      ["top_up", 400_00, "Your bank"],
    ]);
    expect(view.recent[1].note).toBe("Groceries");
    expect(view.spentToday).toBe(100_00); // spend + cash-out, not the top-up or the move

    // Every move is audited by the wallet as well as the ledger.
    const actions = all<{ action: string }>("SELECT action FROM audit_log WHERE user_id = ? AND action LIKE 'wallet.%' ORDER BY id", fresh().id).map(
      (a) => a.action,
    );
    expect(actions).toEqual(["wallet.topped_up", "wallet.moved_to_vault", "wallet.spent", "wallet.cashed_out"]);
    expect(reconcile().ok).toBe(true);
  });

  it("never lets the wallet (or the bank) go below zero, and leaves balances untouched on a refusal", () => {
    const fresh = newCustomer("Never Negative", 100_00);
    const vaultId = createVault(fresh(), { name: "Rainy", category: "emergency", target: 500_00 });
    expect(codeOf(() => topUp(fresh(), 100_01))).toBe("insufficient_funds");
    topUp(fresh(), 50_00);
    expect(codeOf(() => spend(fresh(), { amount: 50_01, payee: "Shop" }))).toBe("insufficient_funds");
    expect(codeOf(() => cashOut(fresh(), 60_00))).toBe("insufficient_funds");
    expect(codeOf(() => moveToVault(fresh(), vaultId, 70_00))).toBe("insufficient_funds");
    // The ledger itself refuses an overdraft of the wallet account.
    expect(() =>
      transfer({ userId: fresh().id, from: walletAccount(fresh()).id, to: worldAccount("USD").id, amount: 50_01, kind: "wallet_spend", memo: "x" }),
    ).toThrow(/Insufficient funds in Wallet/);
    expect(walletOf(fresh())).toBe(50_00);
    expect(bankOf(fresh())).toBe(50_00);
    expect(vaultBalance(fresh(), vaultId)).toBe(0);
    expect(codeOf(() => topUp(fresh(), 0))).toBe("bad_amount");
    expect(codeOf(() => spend(fresh(), { amount: 1_00, payee: " " }))).toBe("bad_payee");
  });
});

describe("daily spending limit", () => {
  it("counts spends and cash-outs (not top-ups or moves) per calendar day", () => {
    const fresh = newCustomer("Limit Counter", 1_000_00);
    const vaultId = createVault(fresh(), { name: "Home", category: "housing", target: 5_000_00 });
    // 09:00 in New York (the US customer's day), whatever the server's own time zone.
    const day = Date.UTC(2026, 8, 10, 13);
    topUp(fresh(), 500_00, { ts: day });
    updateWalletSettings(fresh(), { dailyLimit: 100_00 }, { ts: day });

    spend(fresh(), { amount: 60_00, payee: "Cafe" }, { ts: day + HOUR });
    cashOut(fresh(), 30_00, { ts: day + 2 * HOUR });
    moveToVault(fresh(), vaultId, 200_00, { ts: day + 3 * HOUR }); // not limited
    topUp(fresh(), 10_00, { ts: day + 3 * HOUR }); // not limited

    expect(walletView(fresh(), day + 4 * HOUR)).toMatchObject({ spentToday: 90_00, limitLeftToday: 10_00 });
    expect(codeOf(() => spend(fresh(), { amount: 20_00, payee: "Cafe" }, { ts: day + 5 * HOUR }))).toBe("daily_limit");
    expect(codeOf(() => cashOut(fresh(), 10_01, { ts: day + 5 * HOUR }))).toBe("daily_limit");
    spend(fresh(), { amount: 10_00, payee: "Cafe" }, { ts: day + 5 * HOUR }); // exactly what's left
    expect(codeOf(() => spend(fresh(), { amount: 1, payee: "Cafe" }, { ts: day + 6 * HOUR }))).toBe("daily_limit");

    // A new day starts fresh.
    const tomorrow = Date.UTC(2026, 8, 11, 4, 5); // 00:05 in New York
    expect(walletView(fresh(), tomorrow)).toMatchObject({ spentToday: 0, limitLeftToday: 100_00 });
    spend(fresh(), { amount: 100_00, payee: "Market" }, { ts: tomorrow });
    expect(walletOf(fresh())).toBe(500_00 + 10_00 - 60_00 - 30_00 - 200_00 - 10_00 - 100_00);
  });

  it("resets at the customer's midnight, not the server's", () => {
    const u = createUser({ name: "Kolkata Kiran", country: "IN", pin: "1111" });
    const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", u.id)!;
    transfer({ userId: u.id, from: worldAccount("INR").id, to: userAccount(u.id, "bank", "INR").id, amount: 10_000_00, kind: "income", memo: "seed" });
    // 23:00 IST on 10 Sep is 17:30 UTC; 00:30 IST on 11 Sep is 19:00 UTC, the same UTC day.
    const lateEvening = Date.UTC(2026, 8, 10, 17, 30);
    const afterMidnight = Date.UTC(2026, 8, 10, 19, 0);
    topUp(fresh(), 5_000_00, { ts: lateEvening - HOUR });
    updateWalletSettings(fresh(), { dailyLimit: 1_000_00 }, { ts: lateEvening - HOUR });
    spend(fresh(), { amount: 1_000_00, payee: "Store" }, { ts: lateEvening });
    expect(codeOf(() => spend(fresh(), { amount: 1, payee: "Store" }, { ts: lateEvening + 60_000 }))).toBe("daily_limit");
    expect(walletView(fresh(), afterMidnight)).toMatchObject({ spentToday: 0, limitLeftToday: 1_000_00 });
    spend(fresh(), { amount: 1_000_00, payee: "Store" }, { ts: afterMidnight });
  });

  it("lets the limit be turned on or lowered any time, but raised or turned off once per 30 days", () => {
    const fresh = newCustomer("Limit Setter", 10_00);
    const t = new Date(2026, 6, 1, 12).getTime();

    // Turning on is not a raise.
    expect(updateWalletSettings(fresh(), { dailyLimit: 100_00 }, { ts: t })).toMatchObject({ dailyLimit: 100_00, limitRaisedAt: null });
    expect(updateWalletSettings(fresh(), { dailyLimit: 50_00 }, { ts: t + HOUR }).dailyLimit).toBe(50_00);
    // First raise is allowed and starts the 30-day window.
    expect(updateWalletSettings(fresh(), { dailyLimit: 200_00 }, { ts: t + 2 * HOUR })).toMatchObject({ dailyLimit: 200_00, limitRaisedAt: t + 2 * HOUR });
    expect(walletView(fresh(), t + 3 * HOUR)).toMatchObject({ limitRaiseAvailable: false, nextRaiseAt: t + 2 * HOUR + RAISE_WINDOW_MS });

    // Inside the window: no raise, no turning off, lowering still fine.
    expect(codeOf(() => updateWalletSettings(fresh(), { dailyLimit: 300_00 }, { ts: t + DAY_MS }))).toBe("limit_raise_locked");
    expect(codeOf(() => updateWalletSettings(fresh(), { dailyLimit: null }, { ts: t + DAY_MS }))).toBe("limit_raise_locked");
    expect(updateWalletSettings(fresh(), { dailyLimit: 80_00 }, { ts: t + DAY_MS }).dailyLimit).toBe(80_00);
    expect(codeOf(() => updateWalletSettings(fresh(), { dailyLimit: 90_00 }, { ts: t + 29 * DAY_MS }))).toBe("limit_raise_locked");
    expect(walletSettings(fresh().id).dailyLimit).toBe(80_00);

    // After 30 days, turning it off is the one raise; then the window starts again.
    const later = t + 2 * HOUR + RAISE_WINDOW_MS;
    expect(walletView(fresh(), later)).toMatchObject({ limitRaiseAvailable: true, nextRaiseAt: null });
    expect(updateWalletSettings(fresh(), { dailyLimit: null }, { ts: later })).toMatchObject({ dailyLimit: null, limitRaisedAt: later });
    // Off → on again is always allowed, but raising it right after is not.
    updateWalletSettings(fresh(), { dailyLimit: 40_00 }, { ts: later + HOUR });
    expect(codeOf(() => updateWalletSettings(fresh(), { dailyLimit: 41_00 }, { ts: later + 2 * HOUR }))).toBe("limit_raise_locked");

    expect(codeOf(() => updateWalletSettings(fresh(), { dailyLimit: 0 }))).toBe("bad_amount");
    const changes = all("SELECT 1 FROM audit_log WHERE user_id = ? AND action = 'wallet.settings_changed'", fresh().id);
    expect(changes).toHaveLength(6);
  });
});

describe("safe to spend today", () => {
  it("divides what's left after wallet auto-saves by the days to payday, capped by the daily limit", () => {
    expect(safeToSpend({ balance: 1_000_00, upcoming: 0, daysToPayday: 10, limitLeftToday: null })).toBe(100_00);
    expect(safeToSpend({ balance: 1_000_00, upcoming: 400_00, daysToPayday: 3, limitLeftToday: null })).toBe(200_00);
    expect(safeToSpend({ balance: 100, upcoming: 0, daysToPayday: 3, limitLeftToday: null })).toBe(33); // rounds down
    expect(safeToSpend({ balance: 100_00, upcoming: 150_00, daysToPayday: 5, limitLeftToday: null })).toBe(0); // never negative
    expect(safeToSpend({ balance: 1_000_00, upcoming: 0, daysToPayday: 2, limitLeftToday: 40_00 })).toBe(40_00);
    expect(safeToSpend({ balance: 1_000_00, upcoming: 0, daysToPayday: 0, limitLeftToday: null })).toBe(1_000_00); // days ≥ 1
  });

  it("estimates payday from the median gap between incomes, and falls back to 30 days", () => {
    const now = new Date(2026, 5, 15, 12).getTime();
    const fresh = newCustomer("Payday Pat", 1_000_00, new Date(2026, 2, 1, 9).getTime());
    const credit = (at: Date) =>
      transfer({ userId: fresh().id, from: worldAccount("USD").id, to: userAccount(fresh().id, "bank", "USD").id, amount: 2_000_00, kind: "income", memo: "Salary", ts: at.getTime() });
    credit(new Date(2026, 3, 1, 9));
    credit(new Date(2026, 4, 1, 9));
    credit(new Date(2026, 5, 1, 9));
    credit(new Date(2026, 5, 1, 15)); // a second credit the same day is the same payday
    credit(new Date(2026, 11, 1, 9)); // after `now`: ignored

    // Gaps of 31, 30 and 31 days → 31 → 2 July.
    const p = paydayEstimate(fresh().id, now);
    expect(p.basis).toBe("income");
    expect(new Date(p.nextPayday).getDate()).toBe(2);
    expect(new Date(p.nextPayday).getMonth()).toBe(6);
    expect(p.daysToPayday).toBe(17);

    // A payday that came and went with no income rolls forward by whole gaps.
    const late = paydayEstimate(fresh().id, new Date(2026, 6, 5, 12).getTime());
    expect(new Date(late.nextPayday).getMonth()).toBe(7);
    expect(late.daysToPayday).toBeGreaterThan(25);

    // Payday is today → one day left, never zero.
    expect(paydayEstimate(fresh().id, new Date(2026, 6, 2, 20).getTime()).daysToPayday).toBe(1);

    // A single income: last income + 30 days.
    const single = newCustomer("One Payday", 500_00, new Date(2026, 5, 10, 9).getTime());
    const s = paydayEstimate(single().id, now);
    expect(s.daysToPayday).toBe(25);

    // No income at all: 30 days from today.
    const none = createUser({ name: "No Income", jurisdiction: "US", pin: "1111" });
    expect(paydayEstimate(none.id, now)).toMatchObject({ basis: "default", daysToPayday: 30, lastIncomeAt: null });
  });

  it("holds back auto-saves due from the wallet before payday", () => {
    const now = new Date(2026, 5, 15, 12).getTime();
    const fresh = newCustomer("Careful Carla", 3_000_00, new Date(2026, 4, 2, 9).getTime());
    transfer({ userId: fresh().id, from: worldAccount("USD").id, to: userAccount(fresh().id, "bank", "USD").id, amount: 1, kind: "income", memo: "Salary", ts: new Date(2026, 5, 1, 9).getTime() });
    // Runs on 20 June (before the 1 July payday) and 20 July (after).
    createVault(fresh(), { name: "Car", category: "custom", target: 5_000_00, ruleType: "fixed", ruleAmount: 50_00, ruleFrequency: "monthly", createdAt: new Date(2026, 4, 20, 9).getTime() });
    // Runs on 5 July: after payday, so not held back.
    createVault(fresh(), { name: "Trip", category: "custom", target: 5_000_00, ruleType: "fixed", ruleAmount: 70_00, ruleFrequency: "monthly", createdAt: new Date(2026, 5, 5, 9).getTime() });
    topUp(fresh(), 1_000_00, { ts: now - HOUR });

    const fromBank = walletView(fresh(), now);
    expect(fromBank).toMatchObject({ autoSaveSource: "bank", upcomingFromWallet: 0, daysToPayday: 16 });
    expect(fromBank.safeToSpendToday).toBe(Math.floor(1_000_00 / 16));

    updateWalletSettings(fresh(), { autoSaveSource: "wallet" }, { ts: now });
    const fromWallet = walletView(fresh(), now);
    expect(fromWallet).toMatchObject({ autoSaveSource: "wallet", upcomingFromWallet: 50_00 });
    expect(fromWallet.safeToSpendToday).toBe(Math.floor(950_00 / 16));

    updateWalletSettings(fresh(), { dailyLimit: 30_00 }, { ts: now });
    spend(fresh(), { amount: 10_00, payee: "Bakery" }, { ts: now });
    expect(walletView(fresh(), now).safeToSpendToday).toBe(20_00);
  });
});

describe("auto-saves from the wallet", () => {
  const dueVault = (u: User, amount: number) =>
    createVault(u, { name: "Rainy day", category: "emergency", target: 5_000_00, ruleType: "fixed", ruleAmount: amount, ruleFrequency: "monthly", createdAt: Date.now() - 40 * DAY_MS });

  it("leaves today's behaviour alone by default: auto-saves draw from the bank", async () => {
    const fresh = newCustomer("Bank Saver", 500_00);
    topUp(fresh(), 200_00);
    const vaultId = dueVault(fresh(), 25_00);
    expect(autoSaveSource(fresh())).toBe("bank");
    await tick(fresh());
    expect(vaultBalance(fresh(), vaultId)).toBe(25_00);
    expect(bankOf(fresh())).toBe(275_00);
    expect(walletOf(fresh())).toBe(200_00);
  });

  it("draws from the wallet when chosen, and records a miss (without touching the bank) when the wallet is short", async () => {
    const fresh = newCustomer("Wallet Saver", 500_00);
    topUp(fresh(), 30_00);
    updateWalletSettings(fresh(), { autoSaveSource: "wallet" });
    const vaultId = dueVault(fresh(), 25_00);
    await tick(fresh());
    expect(vaultBalance(fresh(), vaultId)).toBe(25_00);
    expect(walletOf(fresh())).toBe(5_00);
    expect(bankOf(fresh())).toBe(470_00);
    const j = accountHistory(getVaultRow(fresh(), vaultId).account_id)[0];
    expect(j).toMatchObject({ kind: "contribution_rule", ref_type: "vault", ref_id: vaultId });
    // Posted at its scheduled time, like a bank auto-save.
    expect(walletView(fresh()).recent.find((r) => r.kind === "auto_save")).toMatchObject({ counterparty: "Rainy day", amount: -25_00 });
    expect(getVaultRow(fresh(), vaultId).next_run_at).toBeGreaterThan(Date.now());

    // Next run: the wallet has 5.00 for a 25.00 save → missed, skipped, schedule moves on.
    const short = dueVault(fresh(), 25_00);
    const results = runDueWalletContributions(fresh());
    expect(results).toEqual([{ vaultId: short, status: "missed", amount: 25_00 }]);
    expect(walletOf(fresh())).toBe(5_00);
    expect(bankOf(fresh())).toBe(470_00);
    const missed = get<{ details: string }>("SELECT details FROM audit_log WHERE user_id = ? AND action = 'contribution.missed' AND entity_id = ?", fresh().id, short);
    expect(JSON.parse(missed!.details)).toMatchObject({ amount: 25_00, source: "wallet" });
    expect(getVaultRow(fresh(), short).next_run_at).toBeGreaterThan(Date.now());
    expect(reconcile().ok).toBe(true);
  });
});

describe("the wallet switch", () => {
  it("stops new moves and wallet auto-saves when off, but still lets money out", async () => {
    const fresh = newCustomer("Switch Off", 300_00);
    topUp(fresh(), 100_00);
    updateWalletSettings(fresh(), { autoSaveSource: "wallet" });
    process.env.WALLET_ENABLED = "false";
    expect(codeOf(() => topUp(fresh(), 1_00))).toBe("wallet_off");
    expect(codeOf(() => spend(fresh(), { amount: 1_00, payee: "Shop" }))).toBe("wallet_off");
    expect(codeOf(() => updateWalletSettings(fresh(), { dailyLimit: 10_00 }))).toBe("wallet_off");
    expect(autoSaveSource(fresh())).toBe("bank");
    const vaultId = createVault(fresh(), { name: "Fund", category: "emergency", target: 1_000_00, ruleType: "fixed", ruleAmount: 10_00, ruleFrequency: "monthly", createdAt: Date.now() - 40 * DAY_MS });
    await tick(fresh());
    expect(walletOf(fresh())).toBe(100_00);
    expect(vaultBalance(fresh(), vaultId)).toBe(10_00);
    expect(walletView(fresh())).toMatchObject({ enabled: false, autoSaveSource: "bank" });
    cashOut(fresh(), 100_00);
    expect(walletOf(fresh())).toBe(0);
    expect(bankOf(fresh())).toBe(290_00);
  });
});
