import { describe, expect, it } from "vitest";
import { MONEY_ACTIONS, MONEY_ROUTES, type MoneyPolicy } from "@/lib/money-routes";
import { casesOf, expectSections, loadVectors } from "./vectors";

const file = loadVectors("money-actions");
type Expected = { mpin: boolean; kyc: boolean; deviceCap: boolean; moneyIn: boolean };
const cases = casesOf<{ action: string }, Expected>(file, "actions");

describe(`contract: ${file.rule} (server)`, () => {
  it("covers every section", () => expectSections(file, ["actions"]));

  it("has an entry for every action in the server's table, and none it doesn't know", () => {
    expect(cases.map((c) => c.input.action).sort()).toEqual([...MONEY_ACTIONS].sort());
  });

  for (const c of cases)
    it(`${c.input.action}: ${c.why}`, () => {
      const policy = (MONEY_ROUTES as Record<string, MoneyPolicy>)[c.input.action];
      expect(policy, `${c.input.action} is in MONEY_ROUTES`).toBeDefined();
      expect({ mpin: policy.mpin, kyc: policy.kyc, deviceCap: policy.deviceCap ?? false, moneyIn: policy.moneyIn ?? false }).toEqual(c.expected);
    });
});
