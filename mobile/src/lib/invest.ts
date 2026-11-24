import type { Minor } from "./api/types";

/** How often a Core plan (SIP) buys. */
export type PlanFrequency = "weekly" | "monthly";

const DAY_MS = 86_400_000;

/** When the server schedules the next buy after a plan is saved (now + 7 or 30 days). */
export function nextRunFrom(f: PlanFrequency, now = Date.now()) {
  return now + (f === "weekly" ? 7 : 30) * DAY_MS;
}

/** What a plan takes from the bank in an average month, so weekly and monthly plans compare fairly. */
export function perMonth(amount: Minor, frequency: PlanFrequency) {
  return frequency === "weekly" ? (amount * 52) / 12 : amount;
}

/**
 * mpin: whether saving this plan needs the MPIN (the server's `sipNeedsMpin`, src/lib/invest/sip-rule.ts,
 * action `invest_sip`). Starting one does, and so does a change that moves more money: more per month
 * (a monthly plan turned weekly counts) or a start date that brings the next buy forward. Lowering it,
 * or changing it without moving more money sooner, doesn't; nor does stopping it. Pure; the contract
 * vectors in tests/contract/vectors/sip-mpin.json hold both copies to the same answers.
 */
export function sipNeedsMpin(
  current: { amount: Minor; frequency: PlanFrequency; next_run_at?: number } | null | undefined,
  next: { amount: Minor; frequency: PlanFrequency; startAt?: number },
) {
  if (!current) return true;
  if (perMonth(next.amount, next.frequency) > perMonth(current.amount, current.frequency)) return true;
  // The phone never sends a start date; with one and no known next buy, ask (the careful side).
  return next.startAt !== undefined && (current.next_run_at === undefined || next.startAt < current.next_run_at);
}

/**
 * How a lump sum is split across the model portfolio — the same rounding the server uses:
 * each slot gets its rounded share and the last slot takes what's left.
 */
export function splitByWeight<T extends { weight: number }>(amount: Minor, slots: T[]): (T & { amount: Minor })[] {
  let remaining = amount;
  return slots.map((s, i) => {
    const slice = i === slots.length - 1 ? remaining : Math.round(amount * s.weight);
    remaining -= slice;
    return { ...s, amount: slice };
  });
}
