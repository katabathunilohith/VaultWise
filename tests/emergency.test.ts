import { describe, expect, it } from "vitest";
import { get, run } from "@/lib/db";
import { executeEmergency, planEmergency, settleEmergencies } from "@/lib/emergency";
import { balanceOf, transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createUser, type User } from "@/lib/users";
import { createVault, deposit, getVaultRow, heldFor } from "@/lib/vaults";

const created = createUser({ name: "Casey Lee", jurisdiction: "US", pin: "2468" });
const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", created.id)!;
transfer({
  userId: created.id,
  from: worldAccount("USD").id,
  to: userAccount(created.id, "bank", "USD").id,
  amount: 5_000_00,
  kind: "income",
  memo: "seed",
});
const health = createVault(fresh(), { name: "Health", category: "health", target: 2_000_00 });
const rainy = createVault(fresh(), { name: "Rainy day", category: "emergency", target: 2_000_00 });
deposit(fresh(), health, 500_00);
deposit(fresh(), rainy, 1_000_00);

describe("emergency cascade", () => {
  it("covers small requests from the Health vault alone (Tier 1, no PIN)", () => {
    const p = planEmergency(fresh(), 300_00);
    expect(p.tier1).toBe(300_00);
    expect(p.tier2).toBe(0);
    expect(p.needsPin).toBe(false);
    expect(p.blocked).toBe(false);
  });

  it("cascades the remainder to other vaults only once Health is exhausted", () => {
    const p = planEmergency(fresh(), 800_00);
    expect(p.tier1).toBe(500_00);
    expect(p.tier2).toBe(300_00);
    expect(p.items.find((i) => i.tier === 2)?.vaultId).toBe(rainy);
    expect(p.needsPin).toBe(true);
  });

  it("requires the PIN for Tier 2", () => {
    expect(() => executeEmergency(fresh(), { amount: 800_00, reasonCode: "medical", attest: true, pin: "0000" })).toThrow(/PIN/);
  });

  it("releases Tier 1 instantly and holds Tier 2 until its release time", () => {
    const now = Date.now();
    const r = executeEmergency(fresh(), { amount: 800_00, reasonCode: "medical", attest: true, pin: "2468" }, now);
    expect(r.status).toBe("processing");
    expect(balanceOf(getVaultRow(fresh(), health).account_id)).toBe(0);
    expect(heldFor(rainy)).toBe(300_00);

    settleEmergencies(fresh(), now + 10 * 60_000);
    expect(heldFor(rainy)).toBe(0);
    expect(balanceOf(getVaultRow(fresh(), rainy).account_id)).toBe(700_00);
    expect(get<{ status: string }>("SELECT status FROM emergency_requests WHERE id = ?", r.id)?.status).toBe("released");
  });

  it("adds friction on repeat use and enforces the monthly cap", () => {
    const p = planEmergency(fresh(), 100_00);
    expect(p.needsNote).toBe(true);
    const over = planEmergency(fresh(), 2_000_00);
    expect(over.blocked).toBe(true);
    expect(over.checks.find((c) => c.key === "cap")?.status).toBe("block");
  });

  it("blocks after the weekly velocity limit", () => {
    run("UPDATE users SET pin_hash = pin_hash WHERE id = ?", created.id);
    for (let k = 0; k < 2; k++) {
      executeEmergency(fresh(), { amount: 10_00, reasonCode: "other", attest: true, note: "Repeat request for the test", pin: "2468" });
    }
    const p = planEmergency(fresh(), 10_00);
    expect(p.checks.find((c) => c.key === "velocity")?.status).toBe("block");
  });
});
