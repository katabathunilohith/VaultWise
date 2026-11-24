import { describe, expect, it } from "vitest";
import { get, run } from "@/lib/db";
import { planEmergency } from "@/lib/emergency";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import type { VaultCategory } from "@/lib/shared";
import { createUser, type User } from "@/lib/users";
import { createVault, deposit } from "@/lib/vaults";
import { casesOf, expectSections, loadVectors } from "./vectors";

const file = loadVectors("emergency-tiers");

interface Input {
  vaults: { name: string; category: VaultCategory; available: number }[];
  amount: number;
}
interface Expected {
  items: { vault: string; tier: 1 | 2; amount: number }[];
  tier1: number;
  tier2: number;
  shortfall: number;
}

let n = 0;
/** A fresh customer (India: a monthly cap far above these amounts) with the vaults opened in the listed order. */
function customerWith(vaults: Input["vaults"]) {
  const created = createUser({ name: `Contract ${++n}`, jurisdiction: "IN", pin: "2468" });
  const fresh = () => get<User>("SELECT * FROM users WHERE id = ?", created.id)!;
  const total = vaults.reduce((s, v) => s + v.available, 0);
  if (total > 0)
    transfer({ userId: created.id, from: worldAccount("INR").id, to: userAccount(created.id, "bank", "INR").id, amount: total, kind: "income", memo: "seed" });
  const names = new Map<string, string>();
  const base = Date.now() - 60_000;
  vaults.forEach((v, i) => {
    const id = createVault(fresh(), { name: v.name, category: v.category, target: Math.max(v.available, 1_000) * 2 });
    // Opened one millisecond apart, so "oldest first" is the listed order.
    run("UPDATE vaults SET created_at = ? WHERE id = ?", base + i, id);
    if (v.available > 0) deposit(fresh(), id, v.available);
    names.set(id, v.name);
  });
  return { user: fresh(), names };
}

describe(`contract: ${file.rule} (server)`, () => {
  it("covers every section", () => expectSections(file, ["cascade"]));

  for (const c of casesOf<Input, Expected>(file, "cascade"))
    it(c.why, () => {
      const { user, names } = customerWith(c.input.vaults);
      const p = planEmergency(user, c.input.amount);
      expect({
        items: p.items.map((i) => ({ vault: names.get(i.vaultId), tier: i.tier, amount: i.amount })),
        tier1: p.tier1,
        tier2: p.tier2,
        shortfall: p.shortfall,
      }).toEqual(c.expected);
    });
});
