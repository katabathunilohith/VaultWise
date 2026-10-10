/**
 * Every automatic move the customer has set up, laid out in time: fixed vault rules, the
 * percent-of-payday rule, the round-up sweep and the Core SIP. "Nothing moves without showing
 * up here first" (DESIGN.md §7.4) — this is the one place that list is computed.
 */
import type { ContributionRule, InvestCore, Minor, Vault, VaultCategory } from "@/lib/api/types";
import { DAY_MS, weekIndex } from "./format";

export type MoveKind = "fixed" | "percent" | "roundup" | "sip";

export interface UpcomingMove {
  /** Stable per occurrence, used to remember a skip. */
  key: string;
  kind: MoveKind;
  /** When it runs. Null for moves that depend on an event (payday, the weekly sweep). */
  at: number | null;
  /** What it is, in a few words ("Weekly auto-save"). */
  title: string;
  from: string;
  to: string;
  /** Exact amount when known. */
  amount: Minor | null;
  /** True when `amount` is an estimate (percent of payday). */
  estimate?: boolean;
  /** Plain description when there's no exact amount ("5% of your next payday"). */
  amountNote?: string;
  /** When the move has no date: "Next payday", "Weekly". */
  whenNote?: string;
  /** How long a skip of this occurrence should be remembered. */
  skipUntil: number;
  category?: VaultCategory;
  vaultId?: string;
}

const FREQ_TITLE: Record<NonNullable<ContributionRule["frequency"]>, string> = {
  weekly: "Weekly auto-save",
  biweekly: "Auto-save every 2 weeks",
  monthly: "Monthly auto-save",
};

/** Same stepping as the server's scheduler (`nextRun` in src/lib/vaults.ts). */
export function nextRun(from: number, frequency: string | null) {
  const d = new Date(from);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "biweekly") d.setDate(d.getDate() + 14);
  else d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

/** Occurrences of a repeating move from `first`, within [now, until]. Stale dates roll forward. */
function occurrences(first: number, frequency: string | null, now: number, until: number) {
  const out: number[] = [];
  let at = first;
  let guard = 0;
  while (at < now && guard++ < 400) at = nextRun(at, frequency);
  while (at <= until && out.length < 60) {
    // A date too stale to roll forward within the guard is skipped rather than shown as upcoming.
    if (at >= now) out.push(at);
    at = nextRun(at, frequency);
  }
  return out;
}

export interface ScheduleInput {
  vaults: Vault[];
  sips?: InvestCore["sips"];
  /** Round-ups waiting for the next sweep. */
  pendingRoundups?: { s: Minor; n: number };
  /** The last payday we know about, to estimate percent-of-payday rules. */
  lastPayday?: { at: number; amount: Minor } | null;
  now: number;
  days?: number;
}

export function upcomingMoves({ vaults, sips = [], pendingRoundups, lastPayday, now, days = 30 }: ScheduleInput): UpcomingMove[] {
  const until = now + days * DAY_MS;
  const dated: UpcomingMove[] = [];
  const undated: UpcomingMove[] = [];
  const open = vaults.filter((v) => v.status !== "closed");

  for (const v of open) {
    const r = v.rule;
    const common = { from: "Your bank", to: v.name, category: v.category, vaultId: v.id };
    if (r.type === "fixed" && r.amount) {
      const first = r.nextRunAt ?? nextRun(v.createdAt, r.frequency);
      for (const at of occurrences(first, r.frequency, now, until)) {
        dated.push({ ...common, key: `fx:${v.id}:${at}`, kind: "fixed", at, title: FREQ_TITLE[r.frequency ?? "monthly"], amount: r.amount, skipUntil: at + DAY_MS });
      }
    } else if (r.type === "percent_income" && r.percent) {
      const est = lastPayday ? Math.round((lastPayday.amount * r.percent) / 100) : null;
      undated.push({
        ...common,
        key: `pct:${v.id}:${lastPayday?.at ?? "next"}`,
        kind: "percent",
        at: null,
        title: `${r.percent}% of your next payday`,
        amount: est,
        estimate: est !== null,
        amountNote: "Depends on your pay",
        whenNote: "Next payday",
        skipUntil: now + 40 * DAY_MS,
      });
    } else if (r.type === "roundup") {
      const waiting = pendingRoundups && pendingRoundups.s > 0 ? pendingRoundups : null;
      // A skip lasts until the end of this Monday-to-Sunday week (the next sweep).
      const endOfWeek = (weekIndex(now) + 1) * 7 * DAY_MS - 3 * DAY_MS;
      undated.push({
        ...common,
        key: `rnd:${v.id}:${weekIndex(now)}`,
        kind: "roundup",
        at: null,
        title: "Round-ups sweep weekly",
        amount: waiting ? waiting.s : null,
        amountNote: waiting ? `${waiting.n} ${waiting.n === 1 ? "purchase" : "purchases"} so far` : "Spare change from card purchases",
        whenNote: "Weekly",
        skipUntil: endOfWeek,
      });
    }
  }

  for (const sip of sips) {
    if (!sip.active || !sip.amount) continue;
    for (const at of occurrences(sip.next_run_at, sip.frequency, now, until)) {
      dated.push({
        key: `sip:${sip.id}:${at}`,
        kind: "sip",
        at,
        title: sip.frequency === "weekly" ? "Weekly SIP" : "Monthly SIP",
        from: "Your bank",
        to: "Core investing",
        amount: sip.amount,
        skipUntil: at + DAY_MS,
      });
    }
  }

  dated.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  return [...dated, ...undated];
}

/* ---------- daily framing and fresh-start suggestions ---------- */

/** A fixed rule as a monthly amount. */
export function monthlyOf(rule: ContributionRule): Minor | null {
  if (rule.type !== "fixed" || !rule.amount) return null;
  if (rule.frequency === "weekly") return Math.round((rule.amount * 52) / 12);
  if (rule.frequency === "biweekly") return Math.round((rule.amount * 26) / 12);
  return rule.amount;
}

export const perDayOf = (monthly: Minor) => Math.round((monthly * 12) / 365);
export const monthlyFromDaily = (daily: Minor) => Math.round((daily * 365) / 12);

/** Rounds a daily amount up to a friendly step (₹10 or ₹5 or 1 unit). */
function niceDaily(daily: Minor) {
  const step = daily >= 20_000 ? 1_000 : daily >= 2_000 ? 500 : 100;
  return Math.ceil(daily / step) * step;
}

export interface FreshStart {
  vault: Vault;
  perDay: Minor;
  monthly: Minor;
  currentMonthly: Minor;
}

/**
 * One suggestion for the first three days of a month (a "fresh start" landmark, Dai et al. 2014):
 * raise one vault's automatic saving to what its goal date needs. Health first, then whichever
 * vault is furthest behind. Null when there's nothing honest to suggest.
 */
export function freshStartSuggestion(vaults: Vault[], now: number): FreshStart | null {
  if (new Date(now).getDate() > 3) return null;
  const candidates = vaults
    .filter((v) => v.status !== "closed" && v.progress < 1 && v.rule.type === "fixed")
    .map((v) => {
      const current = monthlyOf(v.rule) ?? 0;
      const need = v.monthlyNeeded ?? 0;
      const goal = need > current ? need : Math.round(current * 1.1);
      const perDay = niceDaily(perDayOf(goal));
      return { vault: v, current, perDay, gap: need - current };
    })
    .filter((x) => x.perDay > perDayOf(x.current))
    .sort((a, b) => Number(b.vault.category === "health") - Number(a.vault.category === "health") || b.gap - a.gap);
  const pick = candidates[0];
  if (!pick) return null;
  return { vault: pick.vault, perDay: pick.perDay, monthly: monthlyFromDaily(pick.perDay), currentMonthly: pick.current };
}
