"use client";

import Link from "next/link";
import { CalendarClock, Coins, GraduationCap, HeartPulse, House, Lock, Percent, Sparkles, Sunset, Umbrella, Users } from "lucide-react";
import { CATEGORIES, fmtMoney, type VaultCategory } from "@/lib/shared";
import { Progress, cx, type Tone } from "./ui";

export const CATEGORY_ICON: Record<VaultCategory, typeof HeartPulse> = {
  health: HeartPulse,
  education: GraduationCap,
  housing: House,
  emergency: Umbrella,
  retirement: Sunset,
  custom: Sparkles,
};

export interface VaultView {
  id: string;
  name: string;
  category: VaultCategory;
  template: VaultCategory;
  target: number;
  targetDate: string | null;
  balance: number;
  held: number;
  available: number;
  progress: number;
  monthlyNeeded: number | null;
  rule: {
    type: "none" | "fixed" | "percent_income" | "roundup";
    amount: number | null;
    percent: number | null;
    frequency: string | null;
    nextRunAt: number | null;
  };
  isJoint: boolean;
  members: { id: string; name: string; role: string; contributed: number }[];
  status: string;
  createdAt: number;
  lastContributionAt: number | null;
  currency: string;
}

export function CategoryIcon({ category, size = "md" }: { category: VaultCategory; size?: "sm" | "md" | "lg" }) {
  const Icon = CATEGORY_ICON[category];
  const dims = { sm: "size-7 rounded-lg", md: "size-9 rounded-xl", lg: "size-12 rounded-2xl" }[size];
  const icon = { sm: "size-3.5", md: "size-[18px]", lg: "size-6" }[size];
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center", dims)}
      style={{ background: `color-mix(in srgb, var(--cat-${category}) 14%, transparent)`, color: `var(--cat-${category})` }}
    >
      <Icon className={icon} aria-hidden />
    </span>
  );
}

export function ruleLabel(v: Pick<VaultView, "rule" | "currency">) {
  const r = v.rule;
  if (r.type === "fixed" && r.amount) return `${fmtMoney(r.amount, v.currency, { decimals: false })} ${r.frequency}`;
  if (r.type === "percent_income") return `${r.percent}% of income`;
  if (r.type === "roundup") return "Round-ups";
  return "Manual";
}

export function RuleIcon({ type }: { type: VaultView["rule"]["type"] }) {
  if (type === "fixed") return <CalendarClock className="size-3.5" aria-hidden />;
  if (type === "percent_income") return <Percent className="size-3.5" aria-hidden />;
  if (type === "roundup") return <Coins className="size-3.5" aria-hidden />;
  return <Lock className="size-3.5" aria-hidden />;
}

export function VaultCard({ v }: { v: VaultView }) {
  return (
    <Link
      href={`/vaults/${v.id}`}
      className="group flex flex-col rounded-xl border border-line bg-surface p-5 shadow-card transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-pop"
    >
      <div className="flex items-start gap-3">
        <CategoryIcon category={v.category} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-ink">{v.name}</div>
          <div className="text-xs text-muted">{CATEGORIES[v.category].label}</div>
        </div>
        {v.isJoint && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-2" title="Joint vault">
            <Users className="size-3" aria-hidden /> {v.members.length}
          </span>
        )}
      </div>
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="tnum text-2xl font-semibold tracking-tight text-ink">{fmtMoney(v.balance, v.currency)}</span>
      </div>
      <div className="tnum mt-0.5 text-xs text-muted">of {fmtMoney(v.target, v.currency, { decimals: false })} goal</div>
      <Progress value={v.progress} color={`var(--cat-${v.category})`} className="mt-3" label={`${v.name} progress`} />
      <div className="mt-3 flex items-center justify-between text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <RuleIcon type={v.rule.type} />
          {ruleLabel(v)}
        </span>
        <span className="tnum font-medium">{Math.round(v.progress * 100)}%</span>
      </div>
      {v.held > 0 && (
        <div className="mt-3 rounded-lg bg-warn-soft px-2.5 py-1.5 text-xs text-warn-ink">
          <span className="tnum font-medium">{fmtMoney(v.held, v.currency)}</span> held for a pending withdrawal
        </div>
      )}
    </Link>
  );
}

export const WITHDRAWAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  awaiting_proof: { label: "Awaiting proof", tone: "warn" },
  verifying: { label: "Verifying", tone: "info" },
  in_review: { label: "With reviewer", tone: "warn" },
  appealed: { label: "Appealed", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  paid: { label: "Paid out", tone: "good" },
  denied: { label: "Declined", tone: "bad" },
};
