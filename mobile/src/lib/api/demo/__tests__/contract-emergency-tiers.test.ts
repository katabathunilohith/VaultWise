import { casesOf, expectSections, loadVectors } from "@/test/contract";
import type { VaultCategory } from "../../types";
import { planCascade } from "../emergency";

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

describe(`contract: ${file.rule} (phone)`, () => {
  it("covers every section", () => expectSections(file, ["cascade"]));

  for (const c of casesOf<Input, Expected>(file, "cascade"))
    it(c.why, () => {
      // Listed oldest first, as S.vaults keeps them (a new Practice vault goes on the end).
      const vaults = c.input.vaults.map((v, i) => ({ id: `vlt_${i}`, ...v }));
      const p = planCascade(vaults, c.input.amount);
      expect({
        items: p.items.map((i) => ({ vault: i.vaultName, tier: i.tier, amount: i.amount })),
        tier1: p.tier1,
        tier2: p.tier2,
        shortfall: p.shortfall,
      }).toEqual(c.expected);
    });
});
