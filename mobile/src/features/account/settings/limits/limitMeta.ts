import type { LimitKey, LimitsOverview } from "@/lib/api/types";

export const LIMITS: { key: LimitKey; title: string; body: string; noun: string }[] = [
  {
    key: "singleWithdrawal",
    title: "Per withdrawal",
    body: "The most one withdrawal can take out of a vault.",
    noun: "per-withdrawal limit",
  },
  {
    key: "dailyWithdrawal",
    title: "Per day",
    body: "The total you can take out of your vaults in one day.",
    noun: "daily limit",
  },
  {
    key: "monthlyEmergency",
    title: "Emergency, per month",
    body: "The most emergency access can pay out in a calendar month.",
    noun: "monthly emergency limit",
  },
];

export const limitMeta = (key: LimitKey) => LIMITS.find((l) => l.key === key) ?? LIMITS[0];

export type EditMode = "lower" | "raise";

/** Why a raise isn't possible right now, or null when it is. */
export function raiseBlocked(o: LimitsOverview, key: LimitKey): string | null {
  if (o.limits[key] >= o.bounds[key].max) return "Already at the most allowed in your country.";
  if (!o.quota.available) return `You've used this month's raise. Next one from ${shortDate(o.quota.resetsAt)}.`;
  return null;
}

export function lowerBlocked(o: LimitsOverview, key: LimitKey): string | null {
  if (o.limits[key] <= Math.max(o.bounds[key].min, 100)) return "Already as low as it goes.";
  return null;
}

export function shortDate(ms: number) {
  try {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long" });
  } catch {
    return new Date(ms).toDateString();
  }
}
