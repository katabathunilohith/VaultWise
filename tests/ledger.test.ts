import { describe, expect, it } from "vitest";
import { run } from "@/lib/db";
import { audit, verifyAuditChain } from "@/lib/audit";
import { balanceOf, LedgerError, post, reconcile, transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createUser } from "@/lib/users";
import { createVault, getVaultRow } from "@/lib/vaults";

const user = createUser({ name: "Test User", jurisdiction: "US", pin: "1234" });
const bank = userAccount(user.id, "bank", "USD");
const world = worldAccount("USD");

describe("double-entry ledger", () => {
  it("posts balanced journals and updates the balance projection", () => {
    transfer({ userId: user.id, from: world.id, to: bank.id, amount: 100_00, kind: "income", memo: "salary" });
    expect(balanceOf(bank.id)).toBe(100_00);
    expect(balanceOf(world.id)).toBe(-100_00);
  });

  it("rejects unbalanced journals", () => {
    expect(() =>
      post({
        userId: user.id,
        kind: "bad",
        memo: "unbalanced",
        entries: [
          { accountId: bank.id, amount: 5 },
          { accountId: world.id, amount: -4 },
        ],
      }),
    ).toThrow(LedgerError);
  });

  it("rejects overdrafts and rolls the whole journal back", () => {
    const vaultId = createVault(user, { name: "Health", category: "health", target: 1000_00 });
    const vault = getVaultRow(user, vaultId);
    expect(() => transfer({ userId: user.id, from: bank.id, to: vault.account_id, amount: 500_00, kind: "deposit", memo: "too much" })).toThrow(
      /Insufficient funds/,
    );
    expect(balanceOf(bank.id)).toBe(100_00);
    expect(balanceOf(vault.account_id)).toBe(0);
  });

  it("keeps ledger entries append-only", () => {
    expect(() => run("UPDATE ledger_entries SET amount = 1")).toThrow(/append-only/);
    expect(() => run("DELETE FROM ledger_entries")).toThrow(/append-only/);
  });

  it("reconciles: every journal and currency nets to zero and the projection matches a replay", () => {
    const r = reconcile();
    expect(r.ok).toBe(true);
    expect(r.unbalanced).toHaveLength(0);
    expect(r.drift).toHaveLength(0);
  });
});

describe("hash-chained audit log", () => {
  it("verifies an intact chain", () => {
    audit({ actor: "test", actorType: "system", action: "test.event", details: { n: 1 } });
    expect(verifyAuditChain().ok).toBe(true);
  });

  it("detects a row edited after the fact", () => {
    // Simulate an attacker with raw DB access who bypasses the trigger.
    run("DROP TRIGGER audit_no_update");
    run("UPDATE audit_log SET details = '{\"n\":999}' WHERE action = 'test.event'");
    const v = verifyAuditChain();
    expect(v.ok).toBe(false);
    expect(v.brokenAt).not.toBeNull();
  });
});
