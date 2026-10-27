import type { Minor } from "./api/types";

/** How often a Core plan (SIP) buys. */
export type PlanFrequency = "weekly" | "monthly";

const DAY_MS = 86_400_000;

/** When the server schedules the next buy after a plan is saved (now + 7 or 30 days). */
export function nextRunFrom(f: PlanFrequency, now = Date.now()) {
  return now + (f === "weekly" ? 7 : 30) * DAY_MS;
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
