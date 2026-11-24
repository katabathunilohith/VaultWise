import { nextRunFrom, perMonth, sipNeedsMpin, splitByWeight } from "../invest";

describe("sipNeedsMpin (invest_sip)", () => {
  const monthly = { amount: 2_400_000, frequency: "monthly" as const, next_run_at: 1_000 };

  it("asks for a new plan", () => {
    expect(sipNeedsMpin(null, { amount: 100, frequency: "monthly" })).toBe(true);
    expect(sipNeedsMpin(undefined, { amount: 100, frequency: "weekly" })).toBe(true);
  });

  it("asks when more money moves per month, not when the same or less does", () => {
    expect(sipNeedsMpin(monthly, { amount: 2_400_001, frequency: "monthly" })).toBe(true);
    expect(sipNeedsMpin(monthly, { amount: 2_400_000, frequency: "monthly" })).toBe(false);
    expect(sipNeedsMpin(monthly, { amount: 1_000_000, frequency: "monthly" })).toBe(false);
    // A monthly plan turned weekly at the same amount takes 52/12 times as much.
    expect(sipNeedsMpin(monthly, { amount: 2_400_000, frequency: "weekly" })).toBe(true);
    // Weekly ₹5,000 is about ₹21,667 a month: less than ₹24,000 monthly.
    expect(sipNeedsMpin(monthly, { amount: 500_000, frequency: "weekly" })).toBe(false);
  });

  it("asks when a start date brings the next buy forward", () => {
    expect(sipNeedsMpin(monthly, { amount: 1_000, frequency: "monthly", startAt: 999 })).toBe(true);
    expect(sipNeedsMpin(monthly, { amount: 1_000, frequency: "monthly", startAt: 1_000 })).toBe(false);
    // No known next buy: the careful side.
    expect(sipNeedsMpin({ amount: 2_400_000, frequency: "monthly" }, { amount: 1_000, frequency: "monthly", startAt: 5 })).toBe(true);
  });

  it("compares per month", () => {
    expect(perMonth(1_200, "weekly")).toBe(5_200);
    expect(perMonth(1_200, "monthly")).toBe(1_200);
  });
});

describe("splitByWeight", () => {
  it("rounds each share and gives the last slot what's left, so the parts add up", () => {
    const parts = splitByWeight(1_000, [{ weight: 1 / 3 }, { weight: 1 / 3 }, { weight: 1 / 3 }]);
    expect(parts.map((p) => p.amount)).toEqual([333, 333, 334]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(1_000);
  });
});

describe("nextRunFrom", () => {
  it("is 7 or 30 days on, as the server schedules", () => {
    expect(nextRunFrom("weekly", 0)).toBe(7 * 86_400_000);
    expect(nextRunFrom("monthly", 0)).toBe(30 * 86_400_000);
  });
});
