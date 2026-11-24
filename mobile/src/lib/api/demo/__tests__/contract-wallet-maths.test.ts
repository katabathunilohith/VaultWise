import { casesOf, expectSections, loadVectors } from "@/test/contract";
import { limitState, paydayFrom, safeToSpend } from "../wallet";

const file = loadVectors("wallet-maths");

describe(`contract: ${file.rule} (phone)`, () => {
  it("covers every section", () => expectSections(file, ["payday", "limitState", "safeToSpend"]));

  describe("payday", () => {
    for (const c of casesOf<{ now: number; incomes: number[] }, { nextPayday: number; daysToPayday: number; basis: string }>(file, "payday"))
      it(c.why, () => {
        const p = paydayFrom(c.input.incomes, c.input.now);
        expect({ nextPayday: p.next, daysToPayday: p.days, basis: p.basis }).toEqual(c.expected);
      });
  });

  describe("limitState", () => {
    type Settings = { dailyLimit: number | null; limitRaisedAt: number | null };
    for (const c of casesOf<{ settings: Settings; spentToday: number; now: number }, unknown>(file, "limitState"))
      it(c.why, () => expect(limitState(c.input.settings, c.input.spentToday, c.input.now)).toEqual(c.expected));
  });

  describe("safeToSpend", () => {
    for (const c of casesOf<{ balance: number; upcoming: number; daysToPayday: number; limitLeftToday: number | null }, number>(file, "safeToSpend"))
      it(c.why, () => expect(safeToSpend(c.input)).toBe(c.expected));
  });
});
