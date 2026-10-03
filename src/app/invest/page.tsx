"use client";

import Link from "next/link";
import { ArrowRight, Layers, ShieldCheck, TrendingUp, Zap } from "lucide-react";
import { useApi } from "@/lib/client";
import { fmtMoney, fmtPct } from "@/lib/shared";
import { InvestNav } from "@/components/invest-nav";
import { Badge, Card, CardTitle, LinkButton, Notice, PageHeader, Skeleton, Stat } from "@/components/ui";

interface Portfolio {
  currency: string;
  profile: { score: number; band: number; bandName: string } | null;
  core: {
    value: number;
    cash: number;
    cost: number;
    pnl: number;
    holdings: { symbol: string; name: string; label: string; value: number; weight: number; targetWeight: number }[];
  };
  satellite: { optedIn: boolean; allocated: number; realized: number; equity: number; mode: string };
  total: number;
  split: { core: number; satellite: number };
}

export default function InvestPage() {
  const { data: p } = useApi<Portfolio>("/api/v1/portfolio");
  return (
    <div className="vw-in">
      <PageHeader
        title="Invest"
        subtitle="Investing runs on a separate ledger from your vaults. Vault savings are never exposed to market or trading risk."
      />
      <InvestNav />
      {!p ? (
        <Skeleton className="h-80" />
      ) : !p.profile ? (
        <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <TrendingUp className="size-6" />
          </div>
          <div className="flex-1">
            <div className="text-base font-semibold">Start with a 2-minute risk profile</div>
            <p className="text-sm text-ink-2">Seven questions map you to a diversified, low-cost model portfolio for the Core sleeve.</p>
          </div>
          <LinkButton href="/invest/profile" variant="brand">
            Take the questionnaire
          </LinkButton>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="text-[13px] text-muted">Total invested</div>
                <div className="tnum text-4xl font-semibold tracking-tight">{fmtMoney(p.total, p.currency)}</div>
                <div className="mt-1 text-[13px] text-ink-2">
                  Risk profile: <span className="font-medium text-ink">{p.profile.bandName}</span> · score {p.profile.score}/100
                </div>
              </div>
              <div className="grid grid-cols-3 gap-8">
                <Stat label="Core value" value={fmtMoney(p.core.value + p.core.cash, p.currency, { compact: true })} />
                <Stat
                  label="Core gain/loss"
                  value={
                    <span className={p.core.pnl >= 0 ? "text-good-ink" : "text-bad-ink"}>
                      {fmtMoney(p.core.pnl, p.currency, { sign: true, compact: true })}
                    </span>
                  }
                  sub={p.core.cost ? fmtPct((p.core.pnl / p.core.cost) * 100, 1, true) : undefined}
                />
                <Stat
                  label="Satellite (paper)"
                  value={fmtMoney(p.satellite.equity, p.currency, { compact: true })}
                  sub={p.satellite.optedIn ? "opted in" : "not opted in"}
                />
              </div>
            </div>
            <div className="mt-6">
              <div className="mb-2 flex justify-between text-xs text-muted">
                <span>Core {Math.round(p.split.core * 100)}%</span>
                <span>Satellite {Math.round(p.split.satellite * 100)}%</span>
              </div>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                <div className="rounded-l-full bg-accent" style={{ width: `${p.split.core * 100}%` }} />
                <div className="rounded-r-full bg-[#eb6834]" style={{ width: `${Math.max(p.split.satellite * 100, p.satellite.equity ? 1 : 0)}%` }} />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardTitle
                sub="Passive, diversified, automated"
                action={
                  <Badge tone="good" icon={<ShieldCheck className="size-3" />}>
                    Default
                  </Badge>
                }
              >
                <span className="inline-flex items-center gap-2">
                  <Layers className="size-4 text-accent" /> Core sleeve
                </span>
              </CardTitle>
              <p className="text-sm text-ink-2">
                Low-cost index ETFs across equities, bonds and gold, weighted to your risk band and bought automatically with a recurring SIP.
              </p>
              <ul className="mt-4 space-y-2">
                {p.core.holdings.slice(0, 5).map((h) => (
                  <li key={h.symbol} className="flex items-center justify-between text-[13px]">
                    <span>
                      <span className="font-medium">{h.symbol}</span> <span className="text-muted">· {h.label}</span>
                    </span>
                    <span className="tnum">{fmtMoney(h.value, p.currency)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/invest/core" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
                Open Core <ArrowRight className="size-4" />
              </Link>
            </Card>
            <Card>
              <CardTitle sub="Systematic, opt-in, risk-capped" action={<Badge tone="warn">Paper trading</Badge>}>
                <span className="inline-flex items-center gap-2">
                  <Zap className="size-4 text-[#eb6834]" /> Satellite sleeve
                </span>
              </CardTitle>
              <p className="text-sm text-ink-2">
                An engine that reads market structure, order blocks, fair value gaps and liquidity sweeps across crypto, forex and equities. It must
                clear backtest, walk-forward and paper-trading gates before touching real money.
              </p>
              <div className="mt-4">
                <Notice tone="warn">
                  Smart Money Concepts lack peer-reviewed evidence of a reliable edge after costs — that&apos;s why this sleeve is capped and opt-in.
                </Notice>
              </div>
              <Link href="/invest/satellite" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
                Open Satellite <ArrowRight className="size-4" />
              </Link>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
