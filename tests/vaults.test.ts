import { describe, expect, it } from "vitest";
import { get, run } from "@/lib/db";
import { balanceOf, transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createUser, type User } from "@/lib/users";
import { createVault, creditIncome, createWithdrawal, getVaultRow, recordSpend, runDueContributions, sweepRoundups, toView } from "@/lib/vaults";

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
});
