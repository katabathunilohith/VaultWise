import { describe, expect, it } from "vitest";
import { all, get, run } from "@/lib/db";
import { rng } from "@/lib/invest/market";
import { executeEmergency, settleEmergencies } from "@/lib/emergency";
import { LedgerError, reconcile } from "@/lib/ledger";
import { createUser, HttpError, type User } from "@/lib/users";
import { createVault, creditIncome, createWithdrawal, deposit, listVaults, payoutWithdrawal, recordSpend, sweepRoundups } from "@/lib/vaults";
import { CATEGORY_ORDER } from "@/lib/shared";
import { MARKET_CODES } from "@/lib/compliance";

/**
 * Property test: whatever sequence of operations customers perform, the
 * money invariants hold after every single step.
 */
function invariants(user: User) {
  const r = reconcile();
  expect(r.unbalanced, "a journal doesn't sum to zero").toHaveLength(0);
  expect(r.drift, "balance projection drifted from the ledger").toHaveLength(0);
  expect(
    r.byCurrency.every((c) => c.total === 0),
    "a currency doesn't net to zero",
  ).toBe(true);
  const negative = all<{ name: string; balance: number }>(
    `SELECT a.name, b.balance FROM accounts a JOIN balances b ON b.account_id = a.id
     WHERE a.kind IN ('bank', 'vault', 'core_cash', 'core_securities', 'satellite_cash') AND b.balance < 0`,
  );
  expect(negative, "an asset account went negative").toHaveLength(0);
  for (const v of listVaults(user)) {
    expect(v.available, `holds exceed the balance of ${v.name}`).toBeGreaterThanOrEqual(0);
  }
}

const EXPECTED = (e: unknown) => e instanceof LedgerError || e instanceof HttpError;

describe.each([7, 21, 1337])("random operation sequences (seed %i)", (seed) => {
  it("never breaks a money invariant", () => {
    const rand = rng(seed);
    const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    const created = createUser({ name: `Fuzz ${seed}`, jurisdiction: pick([...MARKET_CODES]), pin: "9999" });
    const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", created.id)!;
    let now = Date.now();
    for (const c of CATEGORY_ORDER) createVault(fresh(), { name: c, category: c, target: 100_000, ruleType: c === "emergency" ? "roundup" : "none" });
    const vaultIds = listVaults(fresh()).map((v) => v.id);
    const counts: Record<string, number> = {};

    for (let step = 0; step < 400; step++) {
      now += Math.floor(rand() * 6 * 3_600_000);
      const op = pick(["salary", "spend", "deposit", "deposit", "withdraw", "payout", "deny", "emergency", "settle", "sweep"]);
      counts[op] = (counts[op] ?? 0) + 1;
      try {
        const u = fresh();
        const amount = Math.floor(rand() * 200_000) + 1;
        switch (op) {
          case "salary":
            creditIncome(u, amount * 2, "Employer", now);
            break;
          case "spend":
            recordSpend(u, "Shop", "shopping", amount / 10 + 1, now);
            break;
          case "deposit":
            deposit(u, pick(vaultIds), amount, { ts: now });
            break;
          case "withdraw":
            createWithdrawal(u, pick(vaultIds), amount, "Payee");
            break;
          case "payout": {
            const w = get<{ id: string }>(
              "SELECT id FROM withdrawals WHERE user_id = ? AND status = 'awaiting_proof' ORDER BY RANDOM() LIMIT 1",
              u.id,
            );
            if (w) payoutWithdrawal(u, w.id, "fuzz", "reviewer");
            break;
          }
          case "deny":
            run(
              "UPDATE withdrawals SET status = 'denied' WHERE id = (SELECT id FROM withdrawals WHERE user_id = ? AND status = 'awaiting_proof' LIMIT 1)",
              u.id,
            );
            break;
          case "emergency":
            executeEmergency(u, { amount, reasonCode: "medical", attest: true, pin: "9999", note: "Fuzz-generated emergency" }, now);
            break;
          case "settle":
            settleEmergencies(u, now);
            break;
          case "sweep":
            sweepRoundups(u, now);
            break;
        }
      } catch (e) {
        // Rejections (insufficient funds, guardrails, validation) are expected; anything else is a bug.
        if (!EXPECTED(e)) throw e;
      }
      invariants(fresh());
    }
    // The sequence must actually have exercised the system.
    const posted = get<{ n: number }>("SELECT COUNT(*) AS n FROM journals WHERE user_id = ?", created.id)!.n;
    expect(posted).toBeGreaterThan(100);
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(9);
  });
});
