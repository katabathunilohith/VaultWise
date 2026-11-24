import { describe, expect, it } from "vitest";
import { db, get, run } from "@/lib/db";
import { balanceOf, transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createUser, type User } from "@/lib/users";
import {
  balanceSeries,
  cancelWithdrawal,
  createVault,
  creditIncome,
  createWithdrawal,
  expireStaleWithdrawals,
  getVaultRow,
  recordSpend,
  runDueContributions,
  sweepRoundups,
  toView,
} from "@/lib/vaults";

const created = createUser({ name: "Rowan Diaz", jurisdiction: "EU", pin: "1357" });
const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", created.id)!;
transfer({
  userId: created.id,
  from: worldAccount("EUR").id,
  to: userAccount(created.id, "bank", "EUR").id,
  amount: 1_000_00,
  kind: "income",
  memo: "seed",
});

describe("vault rules", () => {
  it("runs due fixed contributions on schedule and records misses", () => {
    const id = createVault(fresh(), {
      name: "Rent",
      category: "housing",
      target: 3_000_00,
      ruleType: "fixed",
      ruleAmount: 400_00,
      ruleFrequency: "weekly",
    });
    run("UPDATE vaults SET next_run_at = ? WHERE id = ?", Date.now() - 15 * 86_400_000, id);
    const results = runDueContributions(fresh());
    // Three runs are due: two succeed (800 of 1,000), the third can't be funded.
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "missed"]);
    expect(balanceOf(getVaultRow(fresh(), id).account_id)).toBe(800_00);
  });

  it("moves a percentage of detected income", () => {
    const id = createVault(fresh(), { name: "College", category: "education", target: 10_000_00, ruleType: "percent_income", rulePercent: 10 });
    creditIncome(fresh(), 2_000_00, "Employer");
    expect(balanceOf(getVaultRow(fresh(), id).account_id)).toBe(200_00);
  });

  it("rounds up card spend and sweeps the spare change", () => {
    const id = createVault(fresh(), { name: "Rainy", category: "emergency", target: 500_00, ruleType: "roundup" });
    recordSpend(fresh(), "Coffee", "coffee", 3_40);
    recordSpend(fresh(), "Groceries", "groceries", 12_75);
    const r = sweepRoundups(fresh());
    expect(r.swept).toBe(60 + 25);
    expect(balanceOf(getVaultRow(fresh(), id).account_id)).toBe(85);
  });

  it("holds funds for a pending withdrawal so they can't be spent twice", () => {
    const id = createVault(fresh(), { name: "Med", category: "health", target: 1_000_00, ruleType: "none" });
    transfer({
      userId: created.id,
      from: userAccount(created.id, "bank", "EUR").id,
      to: getVaultRow(fresh(), id).account_id,
      amount: 100_00,
      kind: "deposit",
      memo: "fund",
    });
    createWithdrawal(fresh(), id, 80_00, "Clinic");
    expect(toView(getVaultRow(fresh(), id), "EUR").available).toBe(20_00);
    expect(() => createWithdrawal(fresh(), id, 30_00, "Clinic")).toThrow(/available balance/);
  });

  it("lets an unproven request be cancelled, releasing the hold", () => {
    const id = createVault(fresh(), { name: "Cancel me", category: "health", target: 1_000_00, ruleType: "none" });
    transfer({
      userId: created.id,
      from: userAccount(created.id, "bank", "EUR").id,
      to: getVaultRow(fresh(), id).account_id,
      amount: 50_00,
      kind: "deposit",
      memo: "fund",
    });
    const wid = createWithdrawal(fresh(), id, 40_00, "Clinic");
    expect(toView(getVaultRow(fresh(), id), "EUR").available).toBe(10_00);
    cancelWithdrawal(fresh(), wid);
    expect(toView(getVaultRow(fresh(), id), "EUR").available).toBe(50_00);
    expect(() => cancelWithdrawal(fresh(), wid)).toThrow(/waiting for proof/);
  });

  it("expires requests left without proof for 24 hours", () => {
    const id = createVault(fresh(), { name: "Abandoned", category: "health", target: 1_000_00, ruleType: "none" });
    transfer({
      userId: created.id,
      from: userAccount(created.id, "bank", "EUR").id,
      to: getVaultRow(fresh(), id).account_id,
      amount: 30_00,
      kind: "deposit",
      memo: "fund",
    });
    createWithdrawal(fresh(), id, 30_00, "Clinic");
    expect(toView(getVaultRow(fresh(), id), "EUR").available).toBe(0);
    expect(expireStaleWithdrawals(fresh(), Date.now() + 23 * 3_600_000)).toBe(0);
    expect(expireStaleWithdrawals(fresh(), Date.now() + 25 * 3_600_000)).toBeGreaterThanOrEqual(1);
    expect(toView(getVaultRow(fresh(), id), "EUR").available).toBe(30_00);
  });
});

describe("contribution runs", () => {
  it("never pays a run twice when something unexpected fails part-way through", () => {
    const u = createUser({ name: "Tam Okafor", jurisdiction: "EU", pin: "1357" });
    const me = () => get<User>("SELECT * FROM users WHERE id = ?", u.id)!;
    transfer({ userId: u.id, from: worldAccount("EUR").id, to: userAccount(u.id, "bank", "EUR").id, amount: 1_000_00, kind: "income", memo: "seed" });
    const id = createVault(me(), { name: "Car", category: "emergency", target: 5_000_00, ruleType: "fixed", ruleAmount: 100_00, ruleFrequency: "weekly" });
    // Three weekly runs are due.
    run("UPDATE vaults SET next_run_at = ? WHERE id = ?", Date.now() - 15 * 86_400_000, id);
    const paid = () => get<{ n: number }>("SELECT COUNT(*) AS n FROM journals WHERE ref_id = ? AND kind = 'contribution_rule'", id)!.n;
    // The second run hits an unexpected database error, not a funding problem.
    db().exec(
      `CREATE TEMP TRIGGER fail_second_run BEFORE INSERT ON journals
       WHEN NEW.ref_id = '${id}' AND (SELECT COUNT(*) FROM journals WHERE ref_id = '${id}' AND kind = 'contribution_rule') >= 1
       BEGIN SELECT RAISE(ABORT, 'disk unavailable'); END`,
    );
    expect(() => runDueContributions(me())).toThrow(/disk unavailable/);
    db().exec("DROP TRIGGER fail_second_run");
    expect(paid()).toBe(1);
    // The next tick carries on from where it stopped: two more runs, not three.
    expect(runDueContributions(me()).map((r) => r.status)).toEqual(["ok", "ok"]);
    expect(paid()).toBe(3);
    expect(balanceOf(getVaultRow(me(), id).account_id)).toBe(300_00);
  });
});

describe("vault chart", () => {
  it("starts from the balance before the oldest posting shown, so it ends at the real balance", () => {
    // Newest first, as accountHistory() returns them; earlier postings are outside the window.
    const history = [
      { amount: 50_00, created_at: 3 },
      { amount: -20_00, created_at: 2 },
      { amount: 100_00, created_at: 1 },
    ];
    expect(balanceSeries(1_000_00, history)).toEqual([
      { t: 1, balance: 970_00 },
      { t: 2, balance: 950_00 },
      { t: 3, balance: 1_000_00 },
    ]);
  });
});
