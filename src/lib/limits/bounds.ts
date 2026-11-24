import { rulesFor, type JurisdictionRules } from "../compliance";
import { HttpError, type User } from "../users";
import { fmtMoney, LIMIT_LABELS, type LimitKey } from "../shared";

/** The rules every limit obeys: which limits exist, their market bounds, and how a change compares. Pure apart from reading the market. */

export type Limits = Record<LimitKey, number>;
export const LIMIT_KEYS: LimitKey[] = ["singleWithdrawal", "dailyWithdrawal", "monthlyEmergency"];

export interface Bound {
  min: number;
  max: number;
  default: number;
}

export function limitBounds(rules: JurisdictionRules): Record<LimitKey, Bound> {
  return {
    singleWithdrawal: { min: 0, ...rules.limits.singleWithdrawal },
    dailyWithdrawal: { min: 0, ...rules.limits.dailyWithdrawal },
    monthlyEmergency: { min: 0, max: rules.emergency.monthlyCap, default: rules.emergency.monthlyCap },
  };
}

/** Which limits a change raises and which it lowers. */
export function diff(before: Limits, after: Limits) {
  return {
    loosened: LIMIT_KEYS.filter((k) => after[k] > before[k]),
    tightened: LIMIT_KEYS.filter((k) => after[k] < before[k]),
  };
}

/** Throws 400 if a requested value is not a whole number within the market's bounds. */
export function validate(user: User, next: Partial<Limits>) {
  const bounds = limitBounds(rulesFor(user.jurisdiction));
  for (const k of LIMIT_KEYS) {
    const v = next[k];
    if (v === undefined) continue;
    if (!Number.isInteger(v) || v < bounds[k].min) throw new HttpError(400, `${LIMIT_LABELS[k].label} must be zero or more`);
    if (v > bounds[k].max)
      throw new HttpError(400, `${LIMIT_LABELS[k].label} can't exceed ${fmtMoney(bounds[k].max, user.currency, { decimals: false })} in your market`);
  }
}
