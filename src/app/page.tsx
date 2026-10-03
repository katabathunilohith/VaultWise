"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Coins, Flame, Medal, Plus, ShieldCheck, Siren, Sparkles, TrendingUp } from "lucide-react";
import { useApi } from "@/lib/client";
import { CATEGORIES, CATEGORY_ORDER, fmtMoney, timeAgo, type VaultCategory } from "@/lib/shared";
import { useMe } from "@/components/shell";
import { AllocationDonut, SavingsTrend } from "@/components/charts";
import { VaultCard, type VaultView } from "@/components/vault-bits";
import { Badge, Card, CardTitle, LinkButton, Notice, PageHeader, Progress, Skeleton, Stat, cx } from "@/components/ui";

interface Dashboard {
  currency: string;
  totals: { saved: number; bank: number; invested: number; netWorth: number; corePnl: number };
  vaults: VaultView[];
  series: Record<string, number | string>[];
  emergency: { tier1Available: number; tier2Available: number; remainingCap: number; cap: number; receiptsDue: number };
  nudges: { key: string; tone: "info" | "warning" | "good"; title: string; body: string; href?: string; action?: string }[];
  streak: { streak: number; best: number; last12: { week: number; active: boolean }[] };
  badges: { key: string; label: string; detail: string; earned: boolean }[];
  roundups: { s: number; n: number };
  recent: { id: string; kind: string; memo: string; created_at: number; amount: number }[];
  reviewPending: number;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const INFLOW = new Set(["income", "deposit", "contribution_rule", "roundup"]);

function Insight() {
  const { data } = useApi<{ headline: string; body: string; tip: string; source: string }>("/api/v1/insight");
  return (
    <Card className="flex flex-col">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-accent-ink">
        <Sparkles className="size-4" aria-hidden /> Your week {data?.source === "ai" && <Badge tone="info">AI</Badge>}
      </div>
      {data ? (
        <>
          <div className="text-[17px] font-semibold leading-snug text-ink">{data.headline}</div>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{data.body}</p>
          <div className="mt-4 rounded-lg bg-sunken px-3 py-2.5 text-[13px] text-ink-2">
            <span className="font-medium text-ink">Tip · </span>
            {data.tip}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useMe();
  const { data: d } = useApi<Dashboard>("/api/v1/dashboard");

  if (!d)
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-72" />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Skeleton className="h-80 xl:col-span-2" />
          <Skeleton className="h-80" />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((k) => (
            <Skeleton key={k} className="h-48" />
          ))}
        </div>
      </div>
    );

  const cur = d.currency;
  const byCat = CATEGORY_ORDER.map((c: VaultCategory) => ({
    key: c,
    label: CATEGORIES[c].label,
    value: d.vaults.filter((v) => v.category === c).reduce((s, v) => s + v.balance, 0),
    color: `var(--cat-${c})`,
  })).filter((s) => s.value > 0);
  const capUsed = 1 - d.emergency.remainingCap / d.emergency.cap;

  return (
    <div className="vw-in">
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        subtitle="Here's where your savings stand and what needs your attention."
        actions={
          <>
            <LinkButton href="/emergency" icon={<Siren className="size-4 text-bad" />}>
              Emergency access
            </LinkButton>
            <LinkButton href="/vaults?new=1" variant="brand" icon={<Plus className="size-4" />}>
              New vault
            </LinkButton>
          </>
        }
      />

      {d.nudges.length > 0 && (
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {d.nudges.slice(0, 2).map((n) => (
            <Notice
              key={n.key}
              tone={n.tone === "warning" ? "warn" : n.tone === "good" ? "good" : "info"}
              title={n.title}
              action={
                n.href ? (
                  <Link href={n.href} className="shrink-0 self-center text-[13px] font-semibold underline-offset-2 hover:underline">
                    {n.action ?? "Open"}
                  </Link>
                ) : undefined
              }
            >
              {n.body}
            </Notice>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[13px] text-muted">Saved in purpose-locked vaults</div>
              <div className="tnum mt-1 text-5xl font-semibold tracking-tight text-ink">{fmtMoney(d.totals.saved, cur)}</div>
              <div className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                <ShieldCheck className="size-4 text-good" aria-hidden /> Held in cash at partner bank · never traded
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 sm:gap-8">
              <Stat label="Linked bank" value={fmtMoney(d.totals.bank, cur, { compact: true })} />
              <Stat
                label="Invested"
                value={fmtMoney(d.totals.invested, cur, { compact: true })}
                sub={
                  <span className={d.totals.corePnl >= 0 ? "text-good-ink" : "text-bad-ink"}>
                    {fmtMoney(d.totals.corePnl, cur, { sign: true, compact: true })} Core
                  </span>
                }
              />
              <Stat label="Net worth" value={fmtMoney(d.totals.netWorth, cur, { compact: true })} />
            </div>
          </div>
          <div className="mt-6">
            <SavingsTrend series={d.series} currency={cur} />
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:flex xl:flex-col">
          <Insight />
          <Card>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                <Flame className="size-4 text-serious" aria-hidden /> Saving streak
              </div>
              <span className="text-xs text-muted">best {d.streak.best} wks</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="tnum text-3xl font-semibold">{d.streak.streak}</span>
              <span className="text-sm text-ink-2">weeks in a row</span>
            </div>
            <div className="mt-3 flex gap-1" aria-label="Contribution weeks, last 12">
              {d.streak.last12.map((w) => (
                <span
                  key={w.week}
                  className={cx("h-6 flex-1 rounded", w.active ? "bg-accent" : "bg-sunken")}
                  title={w.active ? "Contributed" : "No contribution"}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted">
              <span>12 weeks ago</span>
              <span>this week</span>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-8 mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold">Your vaults</h2>
          <p className="text-[13px] text-muted">Locked by default. Released against verified proof, or through emergency access.</p>
        </div>
        <Link href="/vaults" className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
          Manage <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {d.vaults.map((v) => (
          <VaultCard key={v.id} v={v} />
        ))}
        <Link
          href="/vaults?new=1"
          className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-sm font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent-ink"
        >
          <Plus className="size-5" /> New vault
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardTitle sub="Fast access when it matters">Emergency readiness</CardTitle>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted">Tier 1 · instant, one tap</div>
                <div className="tnum text-xl font-semibold">{fmtMoney(d.emergency.tier1Available, cur)}</div>
              </div>
              <Badge tone="good">Health vault</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted">Tier 2 · PIN + reason, minutes</div>
                <div className="tnum text-xl font-semibold">{fmtMoney(d.emergency.tier2Available, cur)}</div>
              </div>
              <Badge>Other vaults</Badge>
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-muted">
                <span>Monthly cap used</span>
                <span className="tnum">
                  {fmtMoney(d.emergency.cap - d.emergency.remainingCap, cur, { decimals: false })} /{" "}
                  {fmtMoney(d.emergency.cap, cur, { decimals: false })}
                </span>
              </div>
              <Progress
                value={capUsed}
                color={capUsed > 0.8 ? "var(--bad)" : capUsed > 0.5 ? "var(--warn)" : "var(--accent)"}
                label="Emergency cap used"
              />
            </div>
            {d.emergency.receiptsDue > 0 && <Notice tone="warn">A supporting receipt is requested for a recent release.</Notice>}
            <LinkButton href="/emergency" className="w-full" icon={<Siren className="size-4 text-bad" />}>
              Open emergency access
            </LinkButton>
          </div>
        </Card>

        <Card>
          <CardTitle sub="Vault balances by purpose">Where your savings sit</CardTitle>
          <AllocationDonut slices={byCat} currency={cur} centerLabel="In vaults" />
        </Card>

        <Card>
          <CardTitle
            sub="Latest ledger postings"
            action={
              <Link href="/activity" className="text-[13px] font-medium text-accent-ink hover:underline">
                All
              </Link>
            }
          >
            Recent activity
          </CardTitle>
          <ul className="divide-y divide-line">
            {d.recent.map((r) => {
              const inflow = INFLOW.has(r.kind) && !r.memo.startsWith("Card");
              const outflow = r.kind === "card_spend" || r.kind === "withdrawal" || r.kind === "emergency";
              return (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cx(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      outflow ? "bg-sunken text-ink-2" : inflow ? "bg-good-soft text-good-ink" : "bg-accent-soft text-accent-ink",
                    )}
                  >
                    {r.kind === "roundup" ? (
                      <Coins className="size-4" />
                    ) : r.kind.startsWith("invest") ? (
                      <TrendingUp className="size-4" />
                    ) : outflow ? (
                      <ArrowUpRight className="size-4" />
                    ) : (
                      <ArrowDownLeft className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">{r.memo}</div>
                    <div className="text-[11px] text-muted">{timeAgo(r.created_at)}</div>
                  </div>
                  <span className="tnum text-[13px] font-medium text-ink">{fmtMoney(r.amount, cur)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card className="mt-5">
        <CardTitle sub={`${d.badges.filter((b) => b.earned).length} of ${d.badges.length} earned`}>Milestones</CardTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {d.badges.map((b) => (
            <div
              key={b.key}
              className={cx("rounded-xl border p-3", b.earned ? "border-line bg-surface-2" : "border-dashed border-line opacity-60")}
              title={b.detail}
            >
              <Medal className={cx("size-5", b.earned ? "text-warn" : "text-muted")} aria-hidden />
              <div className="mt-2 text-[13px] font-medium text-ink">{b.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-muted">{b.detail}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
