import { describe, expect, it } from "vitest";
import { transfer, userAccount, worldAccount } from "@/lib/ledger";
import { createUser } from "@/lib/users";
import { limitState, paydayEstimate, safeToSpend } from "@/lib/wallet/plan";
import { casesOf, expectSections, loadVectors } from "./vectors";

const file = loadVectors("wallet-maths");

let n = 0;
/** A fresh customer with an income credit into the bank at each time. */
function customerPaidAt(incomes: number[]) {
  const user = createUser({ name: `Contract payday ${++n}`, jurisdiction: "US", pin: "2468" });
  for (const ts of incomes)
    transfer({ userId: user.id, from: worldAccount("USD").id, to: userAccount(user.id, "bank", "USD").id, amount: 100_00, kind: "income", memo: "Salary", ts });
  return user;
}

describe(`contract: ${file.rule} (server)`, () => {
  it("covers every section", () => expectSections(file, ["payday", "limitState", "safeToSpend"]));

  describe("payday", () => {
    for (const c of casesOf<{ now: number; incomes: number[] }, { nextPayday: number; daysToPayday: number; basis: string }>(file, "payday"))
      it(c.why, () => {
        const p = paydayEstimate(customerPaidAt(c.input.incomes).id, c.input.now);
        expect({ nextPayday: p.nextPayday, daysToPayday: p.daysToPayday, basis: p.basis }).toEqual(c.expected);
      });
  });

  describe("limitState", () => {
    type Settings = { dailyLimit: number | null; limitRaisedAt: number | null };
    for (const c of casesOf<{ settings: Settings; spentToday: number; now: number }, unknown>(file, "limitState"))
      it(c.why, () => expect(limitState({ ...c.input.settings, autoSaveSource: "bank" }, c.input.spentToday, c.input.now)).toEqual(c.expected));
  });

  describe("safeToSpend", () => {
    for (const c of casesOf<{ balance: number; upcoming: number; daysToPayday: number; limitLeftToday: number | null }, number>(file, "safeToSpend"))
      it(c.why, () => expect(safeToSpend(c.input)).toBe(c.expected));
  });
});
