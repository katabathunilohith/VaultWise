import type { Tone } from "@/components/ui";
import type { ContributionRule, Minor, UpdateVaultInput, Vault, VaultCategory, WithdrawalStatus } from "@/lib/api/types";
import { moneyWhole, parseAmount } from "@/lib/money";

/** Pure helpers for the vaults area: rule lines, daily framing, dates, statuses. */

const DAY = 86_400_000;

export type Frequency = "weekly" | "biweekly" | "monthly";

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

const FREQ_PHRASE: Record<Frequency, string> = { weekly: "a week", biweekly: "every 2 weeks", monthly: "a month" };
const PERIODS_PER_YEAR: Record<Frequency, number> = { weekly: 52, biweekly: 26, monthly: 12 };

/** The categories a custom vault can borrow its unlock rules from. */
export const TEMPLATES: Exclude<VaultCategory, "custom">[] = ["health", "education", "housing", "emergency", "retirement"];

/** "₹1,000 a week" · "5% of payday" · "Round-ups" · "No auto-save". */
export function ruleLine(rule: Pick<ContributionRule, "type" | "amount" | "percent" | "frequency">, currency: string): string {
  switch (rule.type) {
    case "fixed":
      return rule.amount ? `${moneyWhole(rule.amount, currency)} ${FREQ_PHRASE[rule.frequency ?? "monthly"]}` : "A fixed amount";
    case "percent_income":
      return `${rule.percent ?? 5}% of payday`;
    case "roundup":
      return "Round-ups";
    default:
      return "No auto-save";
  }
}

/** Monthly equivalent of a fixed amount saved at a frequency (minor units). */
export function monthlyFromFixed(amount: Minor, frequency: Frequency): Minor {
  return (amount * PERIODS_PER_YEAR[frequency]) / 12;
}

/**
 * Daily framing (Hershfield et al.: "₹170 a day" quadrupled sign-ups against the monthly figure).
 * The daily figure is the monthly one over 30, so the two always agree.
 */
export function framing(monthly: Minor, currency: string) {
  return `${moneyWhole(monthly / 30, currency)} a day · about ${moneyWhole(monthly, currency)} a month`;
}

/** What it takes each month to reach the goal by its date, or null when there's nothing to frame. */
export function monthlyNeeded(v: Pick<Vault, "target" | "balance" | "targetDate" | "monthlyNeeded">, now = Date.now()): Minor | null {
  const remaining = v.target - v.balance;
  if (remaining <= 0) return null;
  if (v.monthlyNeeded && v.monthlyNeeded > 0) return v.monthlyNeeded;
  const date = v.targetDate ? parseIsoDate(v.targetDate) : null;
  if (!date) return null;
  const months = Math.max(1, (date.getTime() - now) / (DAY * 30.44));
  return remaining / months;
}

/** Progress in 0..1, computed from balance and target. */
export function progressOf(balance: Minor, target: Minor) {
  return target > 0 ? Math.max(0, Math.min(1, balance / target)) : 0;
}

/** Quarter reached: 0 (under 25%) … 4 (goal reached). */
export function milestoneLevel(progress: number): number {
  if (progress >= 1) return 4;
  return Math.max(0, Math.min(3, Math.floor(progress * 4 + 1e-9)));
}

/* ---------- dates ---------- */

/** Parses "2027-06-04" as a local calendar date (not UTC midnight, which can shift a day). */
export function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toIsoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addMonths(base: Date, months: number) {
  const d = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(base.getDate(), lastDay));
  return d;
}

const dayFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const dayShortFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** "4 Jun 2027". */
export function formatDate(d: Date | number) {
  return dayFmt.format(d);
}

/** "Today, 3:40 pm" · "Yesterday" · "12 Oct" · "12 Oct 2025". */
export function formatWhen(ms: number, now = Date.now()) {
  const d = new Date(ms);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ms >= startOfToday) return `Today, ${timeFmt.format(d)}`;
  if (ms >= startOfToday - DAY) return "Yesterday";
  return d.getFullYear() === today.getFullYear() ? dayShortFmt.format(d) : dayFmt.format(d);
}

/** "3:40 pm today" · "3:40 pm tomorrow" · "3:40 pm, 14 Oct" — exact times beat ranges. */
export function formatDeadline(ms: number, now = Date.now()) {
  const d = new Date(ms);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const time = timeFmt.format(d);
  if (ms < startOfToday) return `${time}, ${dayShortFmt.format(d)}`;
  if (ms < startOfToday + DAY) return `${time} today`;
  if (ms < startOfToday + 2 * DAY) return `${time} tomorrow`;
  return `${time}, ${dayShortFmt.format(d)}`;
}

/* ---------- withdrawals ---------- */

/** The server's statuses (verifying, appealed); "processing" is kept as an older name for verifying. */
const STATUS: Record<string, { tone: Tone; label: string; pending: boolean }> = {
  awaiting_proof: { tone: "warning", label: "Awaiting proof", pending: true },
  verifying: { tone: "info", label: "Checking", pending: true },
  processing: { tone: "info", label: "Checking", pending: true },
  in_review: { tone: "info", label: "With a person", pending: true },
  appealed: { tone: "info", label: "With a person", pending: true },
  paid: { tone: "success", label: "Paid", pending: false },
  denied: { tone: "danger", label: "Not approved", pending: false },
  cancelled: { tone: "neutral", label: "Cancelled", pending: false },
  expired: { tone: "neutral", label: "Expired", pending: false },
};

export function withdrawalStatus(status: WithdrawalStatus) {
  return STATUS[status] ?? { tone: "neutral" as const, label: status.replace(/_/g, " "), pending: false };
}

/** Proof is due within 24 hours of a withdrawal request. */
export const PROOF_WINDOW_MS = 24 * 3_600_000;

/* ---------- contribution rule drafts (shared by New vault and Edit) ---------- */

export interface RuleDraft {
  type: ContributionRule["type"];
  /** Keypad text in major units, e.g. "1000". */
  amount: string;
  percent: number;
  frequency: Frequency;
}

export const PERCENT_OPTIONS = [2, 5, 10, 15, 20];

export function ruleDraftFrom(rule?: ContributionRule | null): RuleDraft {
  return {
    type: rule?.type ?? "none",
    amount: rule?.amount ? String(rule.amount / 100) : "",
    percent: rule?.percent ?? 5,
    frequency: rule?.frequency ?? "monthly",
  };
}

export function ruleDraftValid(d: RuleDraft) {
  return d.type !== "fixed" || (parseAmount(d.amount) ?? 0) > 0;
}

/** The draft as API input (major units). */
export function ruleInput(d: RuleDraft): Pick<UpdateVaultInput, "ruleType" | "ruleAmount" | "rulePercent" | "ruleFrequency"> {
  if (d.type === "fixed") return { ruleType: "fixed", ruleAmount: (parseAmount(d.amount) ?? 0) / 100, ruleFrequency: d.frequency };
  if (d.type === "percent_income") return { ruleType: "percent_income", rulePercent: d.percent };
  return { ruleType: d.type };
}

/** The draft as a rule-shaped value, for previews. */
export function ruleFromDraft(d: RuleDraft): Pick<ContributionRule, "type" | "amount" | "percent" | "frequency"> {
  return { type: d.type, amount: parseAmount(d.amount), percent: d.percent, frequency: d.frequency };
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function initials(name: string | undefined | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}
