import { describe, expect, it } from "vitest";
import { all, get, run } from "@/lib/db";
import { executeEmergency, settleEmergencies } from "@/lib/emergency";
import { runDueSips, upsertSip } from "@/lib/invest/core";
import { scoreAnswers } from "@/lib/invest/profile";
import { balanceOf, transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createUser, type User } from "@/lib/users";
import { createVault, deposit } from "@/lib/vaults";

const HOUR = 3_600_000;

function newCustomer(name: string, funds: number) {
  const u = createUser({ name, jurisdiction: "US", pin: "1111" });
  transfer({ userId: u.id, from: worldAccount("USD").id, to: userAccount(u.id, "bank", "USD").id, amount: funds, kind: "income", memo: "seed" });
  return () => get<User>("SELECT * FROM users WHERE id = ?", u.id)!;
}

describe("emergency scheduling", () => {
  it("applies a cooling-off hold on repeat use within 72 hours, then releases", () => {
    const fresh = newCustomer("Cool Off", 5_000_00);
    const health = createVault(fresh(), { name: "Health", category: "health", target: 5_000_00 });
    deposit(fresh(), health, 1_000_00);
    const t0 = Date.now();
    executeEmergency(fresh(), { amount: 50_00, reasonCode: "medical", attest: true }, t0);
    executeEmergency(fresh(), { amount: 50_00, reasonCode: "medical", attest: true, note: "Follow-up visit for same injury" }, t0 + HOUR);
    const third = executeEmergency(
      fresh(),
      { amount: 50_00, reasonCode: "medical", attest: true, note: "Prescription refill after visit" },
      t0 + 2 * HOUR,
    );
    expect(third.status).toBe("cooling_off");
    const healthAcct = get<{ account_id: string }>("SELECT account_id FROM vaults WHERE id = ?", health)!.account_id;
    expect(balanceOf(healthAcct)).toBe(900_00); // third not released yet

    settleEmergencies(fresh(), t0 + 10 * HOUR);
    expect(balanceOf(healthAcct)).toBe(900_00); // still inside the 24h cooling-off
    settleEmergencies(fresh(), t0 + 27 * HOUR);
    expect(balanceOf(healthAcct)).toBe(850_00);
    expect(get<{ status: string }>("SELECT status FROM emergency_requests WHERE id = ?", third.id)?.status).toBe("released");
  });

  it("marks requested receipts overdue after the window and raises a risk flag", () => {
    const fresh = newCustomer("Late Receipt", 5_000_00);
    const health = createVault(fresh(), { name: "Health", category: "health", target: 5_000_00 });
    const rainy = createVault(fresh(), { name: "Rainy", category: "emergency", target: 5_000_00 });
    deposit(fresh(), health, 10_00);
    deposit(fresh(), rainy, 500_00);
    const t0 = Date.now() - 20 * 24 * HOUR;
    // Tier 2 involvement → a receipt is requested.
    const r = executeEmergency(fresh(), { amount: 100_00, reasonCode: "home_repair", attest: true, pin: "1111" }, t0);
    expect(get<{ receipt_status: string }>("SELECT receipt_status FROM emergency_requests WHERE id = ?", r.id)?.receipt_status).toBe("requested");
    settleEmergencies(fresh());
    expect(get<{ receipt_status: string }>("SELECT receipt_status FROM emergency_requests WHERE id = ?", r.id)?.receipt_status).toBe("overdue");
    const flags = all<{ description: string }>("SELECT description FROM fraud_flags WHERE user_id = ? AND ref_id = ?", fresh().id, r.id);
    expect(flags.some((f) => /overdue/.test(f.description))).toBe(true);
    // Settling again doesn't raise a duplicate flag.
    settleEmergencies(fresh());
    expect(all("SELECT 1 FROM fraud_flags WHERE user_id = ? AND ref_id = ? AND description LIKE '%overdue%'", fresh().id, r.id)).toHaveLength(1);
  });
});

describe("SIP scheduler", () => {
  it("runs every missed SIP date (bounded), records misses when the bank is short, and advances the schedule", async () => {
    const fresh = newCustomer("Sip Saver", 250_00);
    const profile = scoreAnswers({ age: 1, horizon: 3, income: 2, cushion: 2, drawdown: 2, experience: 2, goal: 2 });
    run("UPDATE users SET risk_profile = ? WHERE id = ?", JSON.stringify({ ...profile, completedAt: Date.now() }), fresh().id);
    upsertSip(fresh(), 100_00, "monthly", Date.now() - 65 * 24 * HOUR); // three dates are due
    const results = await runDueSips(fresh());
    expect(results.map((r) => r.status)).toEqual(["filled", "filled", "missed"]);
    expect(balanceOf(userAccount(fresh().id, "bank", "USD").id)).toBe(50_00);
    const next = get<{ next_run_at: number }>("SELECT next_run_at FROM sip_plans WHERE user_id = ?", fresh().id)!.next_run_at;
    expect(next).toBeGreaterThan(Date.now());
    // Running again immediately does nothing.
    expect(await runDueSips(fresh())).toHaveLength(0);
  });
});
