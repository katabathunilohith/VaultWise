import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GET as exportData } from "@/app/api/v1/me/export/route";
import { GET, PATCH, POST } from "@/app/api/v1/payout-plans/route";
import { closeAccount } from "@/lib/auth/account";
import { get, run } from "@/lib/db";
import { checkInPayout, listPayoutPlans, recentPayoutHistory, savePayoutPlan } from "@/lib/payout-plan-store";
import { forecastPayout, payoutPlanSchema, type PayoutPlanInput } from "@/lib/payout-planner";
import { createUser, type User } from "@/lib/users";

const input: PayoutPlanInput = {
  asOfDate: "2024-02-28",
  expectedPayoutDate: "2024-03-01",
  expectedPayoutAmount: 2_500_00,
  openingCash: 800_00,
  dailyWorkCost: 150_00,
  delayDays: 2,
  bills: [
    { name: "Groceries", dueDate: "2024-02-29", amount: 300_00 },
    { name: "Rent", dueDate: "2024-03-01", amount: 400_00 },
    { name: "Data", dueDate: "2024-03-03", amount: 120_00 },
  ],
};

describe("payout forecast", () => {
  it("reserves work and bills up to each payday, identifying the expense that first breaks the plan", () => {
    const { onTime, delayed } = forecastPayout(input);
    expect(onTime).toEqual({
      payoutDate: "2024-03-01",
      days: 2,
      workTotal: 300_00,
      billsTotal: 300_00,
      balanceBeforePayout: 200_00,
      flexiblePerDay: 100_00,
      shortfall: 0,
      firstShortfall: null,
    });
    expect(delayed).toEqual({
      payoutDate: "2024-03-03",
      days: 4,
      workTotal: 600_00,
      billsTotal: 700_00,
      balanceBeforePayout: -500_00,
      flexiblePerDay: 0,
      shortfall: 500_00,
      firstShortfall: { date: "2024-03-01", cause: "Rent" },
    });
    expect(forecastPayout({ ...input, expectedPayoutAmount: 1 })).toEqual({ onTime, delayed });
  });

  it("rounds daily room down, counts whole calendar days over a DST change and treats exact coverage as zero gap", () => {
    const dst = { ...input, asOfDate: "2024-03-09", expectedPayoutDate: "2024-03-12", delayDays: 0, bills: [], dailyWorkCost: 1, openingCash: 8 };
    const { onTime, delayed } = forecastPayout(dst);
    expect(delayed).toEqual(onTime);
    expect(onTime).toMatchObject({ workTotal: 3, flexiblePerDay: 1, days: 3, balanceBeforePayout: 5, shortfall: 0 });
    expect(forecastPayout({ ...dst, openingCash: 3 }).onTime).toMatchObject({ balanceBeforePayout: 0, firstShortfall: null });
    expect(forecastPayout({ ...dst, openingCash: 2 }).onTime).toMatchObject({
      shortfall: 1,
      firstShortfall: { date: "2024-03-11", cause: "Daily costs" },
    });
  });

  it("rejects impossible days, invalid horizons, misplaced bills and non-integer currency", () => {
    expect(payoutPlanSchema.safeParse(input).success).toBe(true);
    for (const changes of [
      { asOfDate: "2023-02-29" },
      { expectedPayoutDate: input.asOfDate },
      { expectedPayoutDate: "2024-08-01" },
      { dailyWorkCost: 0.99 },
      { openingCash: -1 },
      { delayDays: 15 },
      { bills: [{ ...input.bills[0], dueDate: "2024-02-27" }] },
      { bills: [{ ...input.bills[0], amount: 0 }] },
    ])
      expect(payoutPlanSchema.safeParse({ ...input, ...changes }).success).toBe(false);
  });
});

function request(method: string, data: unknown) {
  return new Request("http://localhost/api/v1/payout-plans", { method, body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
}

describe("saved payout plans", () => {
  it("saves without KYC or transfers, retries safely, compares the actual payout and includes it in the account export", async () => {
    const list = () => GET(new Request("http://localhost/api/v1/payout-plans"));
    expect((await list()).status).toBe(401);
    const user = createUser({ name: "Student", country: "IN", pin: "482915", kycStatus: "pending" });
    const id = randomUUID();
    const save = () => POST(request("POST", { id, input, isExample: true }));
    expect(await (await save()).json()).toMatchObject({ plan: { currency: "INR", id, input, actual: null, isExample: true } });
    expect((await save()).status).toBe(200);
    expect((await POST(request("POST", { id, input: { ...input, delayDays: 0 } }))).status).toBe(409);
    expect((await POST(request("POST", { id: randomUUID(), input: { ...input, delayDays: 90 } }))).status).toBe(400);
    const actual = { id, actualDate: "2024-03-03", actualAmount: 1_700_00 };
    expect((await PATCH(request("PATCH", { ...actual, actualDate: "2024-02-27" }))).status).toBe(400);
    expect((await PATCH(request("PATCH", { ...actual, actualDate: "2099-02-28" }))).status).toBe(400);
    const result = await (await PATCH(request("PATCH", actual))).json();
    expect(result.plan.actual).toMatchObject({ amount: 1_700_00, daysDifference: 2, amountDifference: -800_00 });
    expect(await (await PATCH(request("PATCH", actual))).json()).toEqual(result);
    expect((await PATCH(request("PATCH", { ...actual, actualAmount: 1 }))).status).toBe(409);
    expect(await (await list()).json()).toEqual({ plans: [result.plan], history: { sampleCount: 0, lateCount: 0, maxLateDays: 0 } });
    expect((await GET(new Request("http://localhost/api/v1/payout-plans?asOfDate=2024-02-30"))).status).toBe(400);
    expect((await (await exportData()).json()).payoutPlans).toEqual([result.plan]);
    expect(get<{ n: number }>("SELECT COUNT(*) AS n FROM journals WHERE user_id = ?", user.id)?.n).toBe(0);
  });

  it("scopes every operation to its customer and erases the closing account's planner notes", () => {
    const owner = createUser({ name: "First", country: "IN", pin: "482915" });
    const other = createUser({ name: "Second", country: "US", pin: "482915" });
    const id = randomUUID();
    savePayoutPlan(owner, id, input, false);
    expect(listPayoutPlans(other.id)).toEqual([]);
    expect(() => checkInPayout(other, id, input.expectedPayoutDate, 0)).toThrow("could not be found");
    const second = savePayoutPlan(other, id, { ...input, bills: [] }, false);
    expect(second.currency).toBe("USD");
    expect(checkInPayout(owner, id, input.asOfDate, 0).actual).toMatchObject({ amount: 0, daysDifference: -2 });
    expect(listPayoutPlans(other.id)).toEqual([second]);
    closeAccount(owner, "owner");
    expect(listPayoutPlans(owner.id)).toEqual([]);
    expect(listPayoutPlans(other.id)).toEqual([second]);
  });
});

// Set the server timestamps explicitly to model a series of prospective saves and later check-ins.
function historyEntry(
  user: User,
  expected: string,
  actual: string,
  options: { saved?: string; checked?: string; currency?: string; example?: boolean } = {},
) {
  run(
    `INSERT INTO payout_plans(user_id, id, currency, input_json, is_example, created_at, actual_date, actual_amount, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    randomUUID(),
    options.currency ?? user.currency,
    JSON.stringify({ ...input, expectedPayoutDate: expected }),
    Number(options.example ?? false),
    Date.parse(options.saved ?? "2024-02-28T08:00:00Z"),
    actual,
    400_00,
    Date.parse(options.checked ?? actual + "T12:00:00Z"),
  );
}

describe("personal payout history", () => {
  it("uses the last six actual arrivals, keeping one prospective observation per expected payday and the uncapped observed delay", () => {
    const student = createUser({ name: "History", country: "IN", pin: "482915" });
    const other = createUser({ name: "Other student", country: "IN", pin: "482915" });
    historyEntry(student, "2024-03-01", "2024-03-20");
    historyEntry(student, "2024-03-02", "2024-03-02");
    historyEntry(student, "2024-03-03", "2024-03-03");
    historyEntry(student, "2024-03-04", "2024-03-05");
    historyEntry(student, "2024-03-05", "2024-03-06");
    historyEntry(student, "2024-03-06", "2024-03-06");
    historyEntry(student, "2024-03-07", "2024-03-07");
    historyEntry(student, "2024-03-01", "2024-05-01", { saved: "2024-02-29T08:00:00Z" }); // later copy of first payday
    historyEntry(student, "2024-03-08", "2024-05-02", { example: true });
    historyEntry(student, "2024-03-09", "2024-05-02", { currency: "USD" });
    historyEntry(other, "2024-03-10", "2024-05-02");
    // 19:00 UTC is already the expected payday in India. A retrospectively saved plan is ineligible.
    historyEntry(student, "2024-03-11", "2024-05-02", { saved: "2024-03-10T19:00:00Z" });
    historyEntry(student, "2024-05-02", "2024-03-30", { saved: "2024-04-01T08:00:00Z" }); // saved after early arrival
    expect(recentPayoutHistory(student)).toEqual({ sampleCount: 6, lateCount: 3, maxLateDays: 19 });
  });

  it("excludes unknown outcomes on a historical start date and reports zero delay for only early payments", () => {
    const student = createUser({ name: "As of", country: "IN", pin: "482915" });
    historyEntry(student, "2024-03-04", "2024-03-02");
    // The payout occurred on March 8 but the student only recorded it on March 12 in India.
    historyEntry(student, "2024-03-06", "2024-03-08", { checked: "2024-03-11T19:00:00Z" });
    expect(recentPayoutHistory(student, "2024-03-12")).toEqual({ sampleCount: 1, lateCount: 0, maxLateDays: 0 });
    expect(recentPayoutHistory(student, "2024-03-13")).toEqual({ sampleCount: 2, lateCount: 1, maxLateDays: 2 });
    expect(recentPayoutHistory(student, "2024-03-01")).toEqual({ sampleCount: 0, lateCount: 0, maxLateDays: 0 });
  });
});
