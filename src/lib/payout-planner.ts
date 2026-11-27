import { z } from "zod";

// A plan uses local calendar dates. UTC midnight is just their day index, so a
// daylight-saving change can never add or remove a day of work costs.
const DAY_MS = 86_400_000;
export const payoutDateSchema = z.iso.date().refine((date) => date >= "2000-01-01" && date <= "2099-12-31", "Choose a date between 2000 and 2099");
const money = z.number().int().min(0).max(1_000_000_000);

function dayIndex(date: string) {
  return Date.parse(date + "T00:00:00Z") / DAY_MS;
}

export function calendarDaysBetween(start: string, end: string) {
  return dayIndex(end) - dayIndex(start);
}

function datePlusDays(date: string, days: number) {
  return new Date((dayIndex(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

export const payoutPlanSchema = z
  .strictObject({
    asOfDate: payoutDateSchema,
    expectedPayoutDate: payoutDateSchema,
    expectedPayoutAmount: money.positive(),
    openingCash: money,
    dailyWorkCost: money,
    delayDays: z.number().int().min(0).max(14),
    bills: z.array(z.strictObject({ name: z.string().trim().min(1).max(60), dueDate: payoutDateSchema, amount: money.positive() })).max(24),
  })
  .superRefine((input, ctx) => {
    const days = calendarDaysBetween(input.asOfDate, input.expectedPayoutDate);
    if (days < 1 || days > 90) {
      ctx.addIssue({ code: "custom", path: ["expectedPayoutDate"], message: "Choose a payday 1 to 90 days after the start date" });
    }
    input.bills.forEach((bill, i) => {
      const dueIn = calendarDaysBetween(input.asOfDate, bill.dueDate);
      if (dueIn < 0 || dueIn > 104) {
        ctx.addIssue({ code: "custom", path: ["bills", i, "dueDate"], message: "Choose a due date within 104 days of the start" });
      }
    });
  });

export const savePayoutPlanSchema = z.strictObject({
  id: z.uuid(),
  input: payoutPlanSchema,
  isExample: z.boolean().default(false),
});

export const payoutCheckInSchema = z.strictObject({ id: z.uuid(), actualDate: payoutDateSchema, actualAmount: money });

export type PayoutPlanInput = z.infer<typeof payoutPlanSchema>;

export interface PayoutHistory {
  sampleCount: number;
  lateCount: number;
  maxLateDays: number;
}

export interface PayoutPlansResponse {
  plans: SavedPayoutPlan[];
  history: PayoutHistory;
}

export interface SavedPayoutPlan {
  id: string;
  input: PayoutPlanInput;
  isExample: boolean;
  currency: string;
  createdAt: number;
  actual: { date: string; amount: number; recordedAt: number; daysDifference: number; amountDifference: number } | null;
}

export interface PayoutScenario {
  payoutDate: string;
  days: number;
  workTotal: number;
  billsTotal: number;
  balanceBeforePayout: number;
  flexiblePerDay: number;
  shortfall: number;
  firstShortfall: { date: string; cause: string } | null;
}

function scenario(input: PayoutPlanInput, payoutDate: string): PayoutScenario {
  const days = calendarDaysBetween(input.asOfDate, payoutDate);
  const workTotal = input.dailyWorkCost * days;
  let balance = input.openingCash;
  let billsTotal = 0;
  let firstShortfall: PayoutScenario["firstShortfall"] = null;
  function charge(date: string, cause: string, amount: number) {
    balance -= amount;
    if (balance < 0 && !firstShortfall) firstShortfall = { date, cause };
  }
  for (let i = 0; i < days; i++) {
    const date = datePlusDays(input.asOfDate, i);
    charge(date, "Daily costs", input.dailyWorkCost);
    for (const bill of input.bills) {
      if (bill.dueDate === date) {
        charge(date, bill.name, bill.amount);
        billsTotal += bill.amount;
      }
    }
  }
  return {
    payoutDate,
    days,
    workTotal,
    billsTotal,
    balanceBeforePayout: balance,
    flexiblePerDay: Math.floor(Math.max(0, balance) / days),
    shortfall: Math.max(0, -balance),
    firstShortfall,
  };
}

/** The payout arrives at the start of payout day. A bill due that day first
 * appears in the stress case if the expected payout is delayed. No ledger reads or writes. */
export function forecastPayout(input: PayoutPlanInput) {
  return {
    onTime: scenario(input, input.expectedPayoutDate),
    delayed: scenario(input, datePlusDays(input.expectedPayoutDate, input.delayDays)),
  };
}
