/**
 * Turns ledger journals and audit events into plain activity rows: a title a person would say,
 * one line of detail, an icon and a direction. Internal words (journal kinds, tiers, model
 * names, reviewer reasons) never reach the screen.
 */
import {
  ArrowDownLeftIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  CoinsIcon,
  CreditCardIcon,
  HandshakeIcon,
  HourglassIcon,
  LifebuoyIcon,
  LockKeyIcon,
  ReceiptIcon,
  RepeatIcon,
  SealCheckIcon,
  StorefrontIcon,
  UsersIcon,
  WarningCircleIcon,
  XCircleIcon,
  type Icon,
} from "@/components/icons";
import { categoryOf } from "@/lib/categories";
import type { Activity, AuditEvent, Dashboard, Minor } from "@/lib/api/types";
import { money } from "@/lib/money";
import { DAY_MS, cleanText, sectionDay, startOfDay, weekIndex } from "./format";
import { ArrowsLeftRightIcon, HandCoinsIcon } from "./icons";

/** in = money arriving (into a vault or your bank); out = money leaving; move = between your own pots. */
export type Direction = "in" | "out" | "move" | "none";
export type ActivityFilter = "all" | "in" | "out" | "proofs" | "emergency";

export const FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in", label: "Money in" },
  { value: "out", label: "Money out" },
  { value: "proofs", label: "Proofs" },
  { value: "emergency", label: "Emergency" },
];

export interface ActivityItem {
  id: string;
  at: number;
  title: string;
  detail?: string;
  icon: Icon;
  dir: Direction;
  /** Magnitude in minor units; the sign comes from `dir`. Null for events that moved no money. */
  amount: Minor | null;
  filters: ActivityFilter[];
}

type Entry = { account: string; kind: string; amount: Minor };

const SEP = /\s*·\s*/;
const split = (memo: string) => cleanText(memo).split(SEP).filter(Boolean);
/** Ledger accounts are named "Vault · <name>"; the name is what people know. */
const vaultName = (entries: Entry[] | undefined) => {
  const acct = entries?.find((e) => e.kind === "vault")?.account;
  return acct ? cleanText(acct).replace(/^vault\s*·\s*/i, "") : undefined;
};
/** "linked bank account" → "your bank" (DESIGN.md §5 global English). */
const plain = (s: string) => s.replace(/(your |the )?linked bank( account)?/gi, "your bank");

function ruleDetail(memo: string) {
  const m = cleanText(memo).toLowerCase();
  const pct = m.match(/(\d+(?:\.\d+)?)%/);
  if (pct) return `${pct[1]}% of your payday`;
  if (m.includes("biweekly")) return "Every-2-weeks rule";
  if (m.includes("weekly")) return "Weekly rule";
  if (m.includes("monthly")) return "Monthly rule";
  return plain(cleanText(memo));
}

/** One journal (or a dashboard "recent" row, which has no entries) as an activity row. */
export function humaniseJournal(j: { id: string; kind: string; memo: string; created_at: number; amount?: Minor; entries?: Entry[] }): ActivityItem {
  const amount = Math.abs(j.amount ?? Math.max(0, ...(j.entries ?? []).map((e) => Math.abs(e.amount))));
  const vault = vaultName(j.entries);
  const parts = split(j.memo);
  const base = { id: j.id, at: j.created_at, amount };
  switch (j.kind) {
    case "deposit":
      return { ...base, title: vault ? `Added to ${vault}` : "Added to a vault", detail: plain(parts.join(" · ")), icon: ArrowDownLeftIcon, dir: "in", filters: ["in"] };
    case "contribution_rule":
      return { ...base, title: vault ? `Auto-save to ${vault}` : "Automatic save", detail: ruleDetail(j.memo), icon: RepeatIcon, dir: "in", filters: ["in"] };
    case "roundup": {
      const n = j.memo.match(/(\d+)\s+card/);
      return {
        ...base,
        title: vault ? `Round-ups to ${vault}` : "Round-ups saved",
        detail: n ? `From ${n[1]} card ${n[1] === "1" ? "purchase" : "purchases"}` : "Spare change from card purchases",
        icon: CoinsIcon,
        dir: "in",
        filters: ["in"],
      };
    }
    case "income": {
      const from = cleanText(j.memo).match(/from\s+(.+)$/i)?.[1];
      return { ...base, title: "Payday", detail: from ? `From ${from}` : "Into your bank", icon: HandCoinsIcon, dir: "in", filters: ["in"] };
    }
    case "card_spend": {
      const merchant = parts.length > 1 ? parts.slice(1).join(" · ") : parts[0] ?? "Card payment";
      return { ...base, title: merchant, detail: "Card payment from your bank", icon: CreditCardIcon, dir: "out", filters: ["out"] };
    }
    case "withdrawal": {
      const payee = parts.length > 1 ? parts.slice(1).join(" · ") : undefined;
      return {
        ...base,
        title: payee ? `Paid ${payee}` : "Verified withdrawal",
        detail: vault ? `From ${vault} · proof checked` : "Proof checked",
        icon: SealCheckIcon,
        dir: "out",
        filters: ["out"],
      };
    }
    case "payment": {
      const merchant = parts[0]?.replace(/^paid\s+/i, "") ?? "a shop";
      return { ...base, title: `Paid ${merchant}`, detail: vault ? `Pay with Vaultwise · from ${vault}` : "Pay with Vaultwise", icon: StorefrontIcon, dir: "out", filters: ["out"] };
    }
    case "refund":
      return { ...base, title: vault ? `Refund to ${vault}` : "Refund", detail: plain(parts.join(" · ")), icon: ArrowDownLeftIcon, dir: "in", filters: ["in"] };
    case "emergency": {
      const reason = parts.slice(1).join(" · ") || undefined;
      return {
        ...base,
        title: vault ? `Emergency money from ${vault}` : "Emergency money",
        detail: reason ? `${reason} · paid to your bank` : "Paid to your bank",
        icon: LifebuoyIcon,
        dir: "out",
        filters: ["out", "emergency"],
      };
    }
    case "invest_fund":
      return { ...base, title: "To Core investing", detail: /sip/i.test(j.memo) ? "Your SIP, from your bank" : "From your bank", icon: ChartLineUpIcon, dir: "move", filters: [] };
    case "invest_buy": {
      const m = cleanText(j.memo).match(/^buy\s+([\d.]+)\s+(\S+)\s+@\s+([\d.]+)/i);
      return {
        ...base,
        title: m ? `Core investing bought ${m[2]}` : "Core investing bought units",
        detail: m ? `${m[1]} units at ${m[3]}` : undefined,
        icon: ChartLineUpIcon,
        dir: "move",
        filters: [],
      };
    }
    case "satellite_allocate":
      return { ...base, title: "To practice trading", detail: "From your bank", icon: ArrowsLeftRightIcon, dir: "move", filters: [] };
    case "satellite_return":
      return { ...base, title: "Back from practice trading", detail: "Into your bank", icon: ArrowsLeftRightIcon, dir: "move", filters: [] };
    default:
      return { ...base, title: plain(parts[0] ?? "Money moved"), detail: parts.slice(1).join(" · ") || undefined, icon: ArrowsLeftRightIcon, dir: "move", filters: [] };
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v ? cleanText(v) : null);

/** Proof, withdrawal and emergency events from the audit trail. Everything else is left out. */
export function humaniseAudit(a: AuditEvent, currency: string): ActivityItem | null {
  const d = a.details ?? {};
  const base = { id: `audit_${a.id}`, at: a.ts, amount: null, dir: "none" as const };
  const category = str(d.category);
  const forVault = category ? `For ${categoryOf(category).label}` : undefined;
  switch (a.action) {
    case "proof.uploaded":
      return { ...base, title: "Proof sent", detail: forVault, icon: ReceiptIcon, filters: ["proofs"] };
    case "verification.auto_approved":
    case "verification.approved":
      return { ...base, title: "Proof approved", detail: "Every check passed", icon: CheckCircleIcon, filters: ["proofs"] };
    case "verification.reviewed.approved":
      return { ...base, title: "Proof approved", detail: "A person checked it", icon: CheckCircleIcon, filters: ["proofs"] };
    case "verification.auto_denied":
    case "verification.denied":
    case "verification.reviewed.denied":
      return { ...base, title: "Proof not approved", detail: "Open the vault to see why and what to send instead", icon: XCircleIcon, filters: ["proofs"] };
    case "verification.human_review":
      return { ...base, title: "Proof passed to a person", detail: "The money stays set aside until they decide", icon: UsersIcon, filters: ["proofs"] };
    case "verification.appealed":
      return { ...base, title: "You asked a person to check", detail: "They'll look at it again", icon: HandshakeIcon, filters: ["proofs"] };
    case "verification.error":
      return { ...base, title: "Proof passed to a person", detail: "The automatic check couldn't finish", icon: UsersIcon, filters: ["proofs"] };
    case "withdrawal.requested": {
      const amount = num(d.amount);
      const payee = str(d.payee);
      const what = [payee, amount !== null ? `${money(amount, currency)} set aside` : null].filter(Boolean).join(" · ");
      return { ...base, title: "Withdrawal requested", detail: what || undefined, icon: LockKeyIcon, filters: ["proofs"] };
    }
    case "withdrawal.cancelled":
      return { ...base, title: "Withdrawal cancelled", detail: "The money is back in the vault", icon: ArrowDownLeftIcon, filters: ["proofs"] };
    case "withdrawal.expired":
      return { ...base, title: "Withdrawal closed", detail: "No proof arrived in time, so the money stayed in the vault", icon: HourglassIcon, filters: ["proofs"] };
    case "emergency.attested":
      return { ...base, title: "Emergency request confirmed", icon: LifebuoyIcon, filters: ["emergency"] };
    case "emergency.blocked":
      return { ...base, title: "Emergency request stopped", detail: "It was past your safety limit", icon: WarningCircleIcon, filters: ["emergency"] };
    case "emergency.pin_failed":
      return { ...base, title: "Wrong PIN on an emergency request", detail: "Nothing moved", icon: WarningCircleIcon, filters: ["emergency"] };
    default:
      return null;
  }
}

/** Every row for the Activity screen, newest first. */
export function buildActivity(a: Activity): ActivityItem[] {
  const rows = [
    ...a.journals.map(humaniseJournal),
    ...a.audit.map((e) => humaniseAudit(e, a.currency)).filter((x): x is ActivityItem => x !== null),
  ];
  return rows.sort((x, y) => y.at - x.at);
}

export function matchesFilter(item: ActivityItem, f: ActivityFilter) {
  return f === "all" || item.filters.includes(f);
}

/** Groups rows by calendar day for a SectionList. Expects newest-first input. */
export function groupByDay(items: ActivityItem[], now: number) {
  const sections: { key: string; title: string; data: ActivityItem[] }[] = [];
  for (const it of items) {
    const key = String(startOfDay(it.at));
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.data.push(it);
    else sections.push({ key, title: sectionDay(it.at, now), data: [it] });
  }
  return sections;
}

/** Home's recent list: money rows only (no internal moves), newest first. */
export function recentMoney(a: Activity | undefined, fallback: Dashboard["recent"], limit = 5): ActivityItem[] {
  const source = a ? a.journals.map(humaniseJournal) : fallback.map(humaniseJournal);
  return source
    .filter((r) => r.dir === "in" || r.dir === "out")
    .sort((x, y) => y.at - x.at)
    .slice(0, limit);
}

/**
 * Money that landed in vaults over the last `days` days, from the ledger. If the loaded history
 * doesn't reach back that far, `since` is the oldest entry we have, so the label stays honest.
 */
export function addedToVaults(a: Activity, now: number, days = 30) {
  const windowStart = now - days * DAY_MS;
  let amount = 0;
  for (const j of a.journals) {
    if (j.created_at < windowStart) continue;
    for (const e of j.entries) if (e.kind === "vault" && e.amount > 0) amount += e.amount;
  }
  const oldest = a.journals.reduce((m, j) => Math.min(m, j.created_at), Number.POSITIVE_INFINITY);
  const partial = Number.isFinite(oldest) && oldest > windowStart;
  return { amount, since: partial ? oldest : windowStart, partial };
}

/** Whether income reached your bank during the given week (null when we can't tell). */
export function paydayInWeek(a: Activity | undefined, week: number): boolean | null {
  if (!a) return null;
  return a.journals.some((j) => j.kind === "income" && weekIndex(j.created_at) === week);
}

/** The most recent payday in the loaded history. */
export function lastPayday(a: Activity | undefined): { at: number; amount: Minor } | null {
  const j = a?.journals.filter((x) => x.kind === "income").sort((x, y) => y.created_at - x.created_at)[0];
  if (!j) return null;
  const amount = Math.max(0, ...j.entries.filter((e) => e.kind === "bank").map((e) => e.amount));
  return amount > 0 ? { at: j.created_at, amount } : null;
}
