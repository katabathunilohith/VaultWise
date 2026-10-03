"use client";

import { useState } from "react";
import { CircleCheck, CircleX, FlaskConical, LockKeyhole, Play, RefreshCw, ShieldAlert, Zap } from "lucide-react";
import { api, refreshAll, useApi } from "@/lib/client";
import { fmtDate, fmtMoney, fmtPct, timeAgo } from "@/lib/shared";
import { InvestNav } from "@/components/invest-nav";
import { useMe } from "@/components/shell";
import { CandleChart, type Layer, type Overlays } from "@/components/candle-chart";
import { TwoLineChart } from "@/components/charts";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  ErrorNote,
  Field,
  MoneyInput,
  Notice,
  PageHeader,
  Segmented,
  Skeleton,
  StatusIcon,
  Table,
  Td,
  Th,
  Toggle,
  cx,
  useToast,
} from "@/components/ui";

type Comp = { htf: number; structure: number; fvg: number; orderBlock: number; sweep: number; location: number };
interface Overview {
  optedIn: boolean;
  optedAt: number | null;
  currency: string;
  eligibility: {
    eligible: boolean;
    checks: { key: string; label: string; pass: boolean; detail: string }[];
    capPct: number;
    capAmount: number;
    allocated: number;
    headroom: number;
  };
  disclosures: string[];
  rules: { maxAllocationPct: number; riskPerTradePct: number; dailyDrawdownHaltPct: number; weeklyDrawdownHaltPct: number };
  equity: { allocated: number; realized: number; equity: number };
  positions: {
    id: string;
    symbol: string;
    direction: "bull" | "bear";
    entry: number;
    stop: number;
    target: number;
    risk_amount: number;
    confluence: number;
    status: string;
    exit: number | null;
    r_multiple: number | null;
    pnl: number | null;
    opened_at: number;
    closed_at: number | null;
    components: Comp | null;
  }[];
  stats: { closed: number; open: number; winRate: number; expectancyR: number; realized: number };
  markets: {
    symbol: string;
    name: string;
    assetClass: string;
    allowed: boolean;
    enabled: boolean;
    haltedUntil: number | null;
    gate: { passed: boolean; ranAt: number; oosExpectancy: number; oosPf: number; trades: number } | null;
  }[];
  governance: { stages: { key: string; label: string; passed: boolean; detail: string }[] };
}
interface Analysis extends Omit<Overlays, "setup"> {
  symbol: string;
  name: string;
  assetClass: string;
  interval: string;
  source: string;
  currency: string;
  candles: { t: number; o: number; h: number; l: number; c: number; v: number }[];
  latest: {
    bias: string;
    trend: string;
    long: number;
    short: number;
    longC: Comp;
    shortC: Comp;
    dir: "bull" | "bear" | null;
    stop: number | null;
    atr: number;
    price: number;
    threshold: number;
  };
  weights: Comp;
}
interface Backtest {
  bars: number;
  from: number;
  to: number;
  source: string;
  full: Stats;
  oos: Stats;
  decay: { isExpectancy: number; oosExpectancy: number };
  folds: {
    fold: number;
    oosFrom: number;
    oosTo: number;
    threshold: number;
    isExpectancy: number;
    isTrades: number;
    oosExpectancy: number;
    oosTrades: number;
  }[];
  gate: { passed: boolean; checks: { label: string; pass: boolean; detail: string }[] };
  buyHoldPct: number;
  equity: { t: number; strategy: number; buyHold: number }[];
  params: { rr: number; costBps: number; threshold: number };
}
interface Stats {
  trades: number;
  winRate: number;
  expectancyR: number;
  profitFactor: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  tStat: number;
  halts: number;
}

const COMP_LABEL: Record<keyof Comp, string> = {
  htf: "Higher-timeframe bias",
  structure: "Break of structure / CHoCH",
  fvg: "Inside a fair value gap",
  orderBlock: "At an order block",
  sweep: "Liquidity sweep",
  location: "Discount / premium & POC",
};
const LAYERS: { key: Layer; label: string }[] = [
  { key: "fvg", label: "FVGs" },
  { key: "ob", label: "Order blocks" },
  { key: "structure", label: "BOS / CHoCH" },
  { key: "sweeps", label: "Sweeps" },
  { key: "swings", label: "Swings" },
  { key: "profile", label: "Volume profile" },
  { key: "signals", label: "Past signals" },
];

function Confluence({ a }: { a: Analysis }) {
  const keys = Object.keys(COMP_LABEL) as (keyof Comp)[];
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        {(["long", "short"] as const).map((side) => {
          const score = side === "long" ? a.latest.long : a.latest.short;
          const pass = score >= a.latest.threshold;
          return (
            <div key={side} className="rounded-xl bg-surface-2 p-3">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{side === "long" ? "Long setup" : "Short setup"}</span>
                <span className="size-2 rounded-full" style={{ background: side === "long" ? "var(--up)" : "var(--down)" }} />
              </div>
              <div className="tnum mt-1 text-2xl font-semibold">
                {score}
                <span className="text-sm font-normal text-muted">/100</span>
              </div>
              <div className={cx("mt-0.5 text-[11px]", pass ? "text-good-ink" : "text-muted")}>
                {pass ? "above" : "below"} threshold {a.latest.threshold}
              </div>
            </div>
          );
        })}
      </div>
      <ul className="space-y-2.5">
        {keys.map((k) => (
          <li key={k}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-ink-2">{COMP_LABEL[k]}</span>
              <span className="tnum text-muted">max {a.weights[k]}</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {(["longC", "shortC"] as const).map((side) => (
                <div
                  key={side}
                  className="h-1.5 overflow-hidden rounded-full bg-sunken"
                  title={`${side === "longC" ? "Long" : "Short"}: ${a.latest[side][k]}`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(a.latest[side][k] / a.weights[k]) * 100}%`, background: side === "longC" ? "var(--up)" : "var(--down)" }}
                  />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-[var(--up)]" /> Long
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-[var(--down)]" /> Short
        </span>
      </div>
    </div>
  );
}

function StatGrid({ s, label }: { s: Stats; label: string }) {
  const items = [
    ["Trades", String(s.trades)],
    ["Win rate", `${(s.winRate * 100).toFixed(0)}%`],
    ["Expectancy", `${s.expectancyR >= 0 ? "+" : ""}${s.expectancyR.toFixed(3)}R`],
    ["Profit factor", s.profitFactor.toFixed(2)],
    ["Return", fmtPct(s.totalReturnPct, 1, true)],
    ["Max drawdown", `${s.maxDrawdownPct.toFixed(1)}%`],
  ];
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-muted">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {items.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-surface-2 px-3 py-2">
            <div className="text-[11px] text-muted">{k}</div>
            <div className="tnum text-sm font-semibold">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OptIn({ ov }: { ov: Overview }) {
  const { rules } = useMe();
  const toast = useToast();
  const allDisclosures = [...ov.disclosures, ...rules.disclosures.filter((d) => /crypto|invest|trading|lose|high-risk|VDA|DPT/i.test(d))];
  const [ack, setAck] = useState<boolean[]>(allDisclosures.map(() => false));
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const e = ov.eligibility;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardTitle sub="Suitability checks required before opting in">Eligibility</CardTitle>
        <ul className="space-y-2.5">
          {e.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2.5">
              {c.pass ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-bad" />}
              <div>
                <div className="text-[13px] font-medium">{c.label}</div>
                <div className="text-xs text-ink-2">{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-5 rounded-xl bg-surface-2 p-4">
          <div className="text-xs text-muted">Allocation cap · {e.capPct}% of your investments</div>
          <div className="tnum mt-1 text-xl font-semibold">{fmtMoney(e.capAmount, ov.currency)}</div>
          <div className="mt-1 text-xs text-muted">
            Risk per trade {ov.rules.riskPerTradePct}% · halts after a {ov.rules.dailyDrawdownHaltPct}% daily or {ov.rules.weeklyDrawdownHaltPct}%
            weekly drawdown
          </div>
        </div>
      </Card>
      <Card>
        <CardTitle sub="Please read and confirm each one">Risk disclosures</CardTitle>
        <ul className="space-y-3">
          {allDisclosures.map((d, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-start gap-3 text-[13px]">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                  checked={ack[i]}
                  onChange={(ev) => setAck((a) => a.map((x, k) => (k === i ? ev.target.checked : x)))}
                />
                <span className="text-ink-2">{d}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-5 space-y-3">
          <Field label="Amount to allocate" hint={`Up to ${fmtMoney(e.headroom, ov.currency)} — from your linked bank account`}>
            <MoneyInput currency={ov.currency} value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          {err && <ErrorNote>{err}</ErrorNote>}
          <Button
            className="w-full"
            variant="brand"
            disabled={!e.eligible || ack.some((a) => !a) || !Number(amount)}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await api.post("/api/v1/invest/satellite/opt-in", { amount: Number(amount), acknowledged: ack.filter(Boolean).length });
                toast({ tone: "good", text: "Opted in — the engine starts paper trading now." });
                refreshAll();
              } catch (x) {
                setErr((x as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Opt in to the Satellite sleeve
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function SatellitePage() {
  const { data: ov } = useApi<Overview>("/api/v1/invest/satellite");
  const toast = useToast();
  const [symbol, setSymbol] = useState("BTC-USD");
  const [tf, setTf] = useState<"1h" | "4h" | "1d">("4h");
  const [layers, setLayers] = useState<Set<Layer>>(new Set(["fvg", "ob", "structure", "sweeps", "profile"]));
  const { data: a, loading: aLoading } = useApi<Analysis>(`/api/v1/invest/satellite/analysis?symbol=${encodeURIComponent(symbol)}&tf=${tf}&bars=160`);
  const [bt, setBt] = useState<(Backtest & { key: string }) | null>(null);
  const [btBusy, setBtBusy] = useState(false);
  const [running, setRunning] = useState(false);

  if (!ov)
    return (
      <div>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-6 h-96" />
      </div>
    );
  const cur = ov.currency;
  const runBacktest = async () => {
    setBtBusy(true);
    try {
      const r = await api.post<Backtest>("/api/v1/invest/satellite/backtest", { symbol, tf });
      setBt({ ...r, key: `${symbol}|${tf}` });
      refreshAll();
    } catch (e) {
      toast({ tone: "bad", text: (e as Error).message });
    } finally {
      setBtBusy(false);
    }
  };
  const showBt = bt && bt.key === `${symbol}|${tf}` ? bt : null;
  const setup =
    a?.latest.dir && a.latest.stop
      ? {
          dir: a.latest.dir,
          entry: a.latest.price,
          stop: a.latest.stop,
          target:
            a.latest.dir === "bull" ? a.latest.price + 2 * (a.latest.price - a.latest.stop) : a.latest.price - 2 * (a.latest.stop - a.latest.price),
        }
      : null;

  return (
    <div className="vw-in">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2.5">
            <Zap className="size-6 text-[#eb6834]" /> Satellite sleeve
          </span>
        }
        subtitle="A systematic engine combining market structure, order blocks, fair value gaps, liquidity sweeps, volume profile and higher-timeframe bias into one confluence score."
        actions={
          ov.optedIn && (
            <>
              <Button
                variant="secondary"
                icon={<RefreshCw className={cx("size-4", running && "animate-spin")} />}
                onClick={async () => {
                  setRunning(true);
                  try {
                    const r = await api.post<{ processed: number; opened: number; closed: number }>("/api/v1/invest/satellite/run");
                    toast({ tone: "info", text: `Engine processed ${r.processed} bars · ${r.opened} opened · ${r.closed} closed` });
                    refreshAll();
                  } finally {
                    setRunning(false);
                  }
                }}
              >
                Run engine now
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  if (!confirm("Opt out and return the allocation to your linked account?")) return;
                  await api.post("/api/v1/invest/satellite/opt-out");
                  refreshAll();
                }}
              >
                Opt out
              </Button>
            </>
          )
        }
      />
      <InvestNav />

      <Notice tone="warn" title="Read this first" icon={<ShieldAlert className="size-4" />}>
        Smart Money Concepts and Fair Value Gaps are community-developed heuristics without a peer-reviewed evidence base for a reliable edge after
        costs. This sleeve is opt-in, capped, separate from your savings, and trades on paper until a strategy clears every gate below.
      </Notice>

      <div className="mt-5">
        {!ov.optedIn ? (
          <OptIn ov={ov} />
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardTitle
                sub={`Opted in ${ov.optedAt ? timeAgo(ov.optedAt) : ""} · allocation held in cash`}
                action={<Badge tone="warn">Paper trading</Badge>}
              >
                Paper performance
              </CardTitle>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted">Paper equity</div>
                  <div className="tnum text-xl font-semibold">{fmtMoney(ov.equity.equity, cur)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Realised P&amp;L</div>
                  <div className={cx("tnum text-xl font-semibold", ov.equity.realized >= 0 ? "text-good-ink" : "text-bad-ink")}>
                    {fmtMoney(ov.equity.realized, cur, { sign: true })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">Win rate</div>
                  <div className="tnum text-xl font-semibold">{(ov.stats.winRate * 100).toFixed(0)}%</div>
                  <div className="text-[11px] text-muted">{ov.stats.closed} closed</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Expectancy</div>
                  <div className="tnum text-xl font-semibold">
                    {ov.stats.expectancyR >= 0 ? "+" : ""}
                    {ov.stats.expectancyR.toFixed(2)}R
                  </div>
                  <div className="text-[11px] text-muted">{ov.stats.open} open</div>
                </div>
              </div>
            </Card>
            <Card>
              <CardTitle sub="A strategy must pass every stage before live capital">Governance</CardTitle>
              <ol className="space-y-3">
                {ov.governance.stages.map((s, i) => (
                  <li key={s.key} className="flex items-start gap-3">
                    <span
                      className={cx(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        s.passed ? "bg-good-soft text-good-ink" : s.key === "live" ? "bg-sunken text-muted" : "bg-warn-soft text-warn-ink",
                      )}
                    >
                      {s.key === "live" ? <LockKeyhole className="size-3.5" /> : i + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 text-[13px] font-medium">
                        {s.label} <StatusIcon status={s.passed ? "pass" : s.key === "live" ? "info" : "warn"} className="size-3.5" />
                      </div>
                      <div className="text-xs text-ink-2">{s.detail}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        )}
      </div>

      <Card className="mt-5" pad={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <div className="flex flex-wrap gap-1.5">
            {ov.markets.map((m) => (
              <button
                key={m.symbol}
                disabled={!m.allowed}
                onClick={() => setSymbol(m.symbol)}
                title={m.allowed ? m.name : `${m.assetClass} not permitted in your jurisdiction`}
                className={cx(
                  "rounded-lg border px-2.5 py-1 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  symbol === m.symbol ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:border-line-strong",
                )}
              >
                {m.symbol.replace("=X", "").replace("-USD", "")}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <Segmented
              size="sm"
              value={tf}
              onChange={setTf}
              options={[
                { value: "1h", label: "1H" },
                { value: "4h", label: "4H" },
                { value: "1d", label: "1D" },
              ]}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px]">
          <div className="min-w-0 border-line p-4 xl:border-r">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div>
                <span className="text-base font-semibold">{a?.name ?? symbol}</span>
                {a && (
                  <span className="tnum ml-2 text-sm text-ink-2">
                    {a.latest.price.toLocaleString("en-US", { maximumFractionDigits: a.latest.price > 100 ? 2 : 5 })} {a.currency}
                  </span>
                )}
              </div>
              {a && (
                <div className="flex gap-1.5">
                  <Badge tone={a.latest.bias === "bull" ? "good" : a.latest.bias === "bear" ? "bad" : "neutral"}>HTF {a.latest.bias}</Badge>
                  <Badge>trend {a.latest.trend}</Badge>
                  <Badge>{a.source === "synthetic" ? "synthetic data" : "live data"}</Badge>
                </div>
              )}
              {aLoading && <RefreshCw className="size-3.5 animate-spin text-muted" />}
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {LAYERS.map((l) => (
                <button
                  key={l.key}
                  onClick={() =>
                    setLayers((s) => {
                      const n = new Set(s);
                      if (n.has(l.key)) n.delete(l.key);
                      else n.add(l.key);
                      return n;
                    })
                  }
                  className={cx(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    layers.has(l.key) ? "border-ink-2 bg-ink text-surface" : "border-line text-muted hover:text-ink",
                  )}
                  aria-pressed={layers.has(l.key)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            {a ? (
              <CandleChart candles={a.candles} overlays={{ ...a, setup }} layers={layers} interval={a.interval} />
            ) : (
              <Skeleton className="h-[440px]" />
            )}
          </div>
          <div className="p-5">
            <div className="mb-3 text-[13px] font-semibold">Confluence now</div>
            {a ? <Confluence a={a} /> : <Skeleton className="h-64" />}
            {a && (
              <div className="mt-4 rounded-xl border border-line p-3 text-[13px]">
                {a.latest.dir ? (
                  <>
                    <div className="font-semibold">{a.latest.dir === "bull" ? "Long" : "Short"} setup on the last bar</div>
                    <div className="mt-1 text-xs text-ink-2">Stop beyond the zone, 2R target, sized at {ov.rules.riskPerTradePct}% of equity.</div>
                  </>
                ) : (
                  <div className="text-ink-2">
                    No qualifying setup on the last bar. A setup needs ≥ {a.latest.threshold} confluence, a price-action zone, and no conflict with
                    the higher timeframe.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="mt-5">
        <CardTitle
          sub="Full-sample backtest plus anchored walk-forward: thresholds are chosen on past data, then tested on the next unseen window. Costs included."
          action={
            <Button variant="secondary" icon={<FlaskConical className="size-4" />} onClick={runBacktest} loading={btBusy}>
              Backtest {symbol.replace("=X", "").replace("-USD", "")} {tf.toUpperCase()}
            </Button>
          }
        >
          Backtest &amp; walk-forward validation
        </CardTitle>
        {!showBt ? (
          <p className="text-sm text-muted">Run a backtest to see whether this market and timeframe clear the governance gate.</p>
        ) : (
          <div className="space-y-5">
            <div
              className={cx(
                "flex items-start gap-3 rounded-xl px-4 py-3",
                showBt.gate.passed ? "bg-good-soft text-good-ink" : "bg-bad-soft text-bad-ink",
              )}
            >
              {showBt.gate.passed ? <CircleCheck className="mt-0.5 size-5" /> : <CircleX className="mt-0.5 size-5" />}
              <div>
                <div className="font-semibold">
                  {showBt.gate.passed ? "Gate passed — eligible for paper trading" : "Gate failed — not eligible for live capital"}
                </div>
                <div className="text-[13px] opacity-90">
                  {showBt.bars.toLocaleString()} bars, {fmtDate(showBt.from)} – {fmtDate(showBt.to)} · {showBt.params.costBps} bps per side · buy
                  &amp; hold {fmtPct(showBt.buyHoldPct, 1, true)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <StatGrid s={showBt.full} label="Full sample" />
              <StatGrid s={showBt.oos} label="Out-of-sample (walk-forward)" />
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="mb-2 text-xs font-medium text-muted">Equity, indexed to 1.0</div>
                <TwoLineChart
                  data={showBt.equity}
                  xKey="t"
                  a={{ key: "strategy", label: "Strategy (1% risk per trade)", color: "#eb6834" }}
                  b={{ key: "buyHold", label: "Buy & hold", color: "var(--ink-2)" }}
                  format={(v) => v.toFixed(2)}
                  xFormat={(t) => new Date(Number(t)).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                  height={220}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-muted">Governance gate</div>
                <ul className="space-y-2">
                  {showBt.gate.checks.map((c) => (
                    <li key={c.label} className="flex items-start gap-2 text-[13px]">
                      <StatusIcon status={c.pass ? "pass" : "fail"} className="mt-0.5" />
                      <span>
                        <span className="font-medium">{c.label}</span> <span className="text-ink-2">— {c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
                  Strategy decay: in-sample expectancy {showBt.decay.isExpectancy.toFixed(3)}R → out-of-sample {showBt.decay.oosExpectancy.toFixed(3)}
                  R.
                </div>
              </div>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Fold</Th>
                  <Th>Out-of-sample window</Th>
                  <Th right>Chosen threshold</Th>
                  <Th right>In-sample expectancy</Th>
                  <Th right>OOS trades</Th>
                  <Th right>OOS expectancy</Th>
                </tr>
              </thead>
              <tbody>
                {showBt.folds.map((f) => (
                  <tr key={f.fold}>
                    <Td>{f.fold}</Td>
                    <Td className="text-ink-2">
                      {fmtDate(f.oosFrom)} – {fmtDate(f.oosTo)}
                    </Td>
                    <Td right>{f.threshold}</Td>
                    <Td right>{f.isExpectancy.toFixed(3)}R</Td>
                    <Td right>{f.oosTrades}</Td>
                    <Td right className={f.oosExpectancy >= 0 ? "text-good-ink" : "text-bad-ink"}>
                      {f.oosExpectancy.toFixed(3)}R
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {ov.optedIn && (
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
          <Card>
            <CardTitle sub="Simulated orders sized at 1% risk of paper equity; P&L = R-multiple × risk, net of costs">Paper positions</CardTitle>
            {ov.positions.length === 0 ? (
              <p className="text-sm text-muted">No positions yet. The engine opens one when a market prints a qualifying setup.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Opened</Th>
                    <Th>Market</Th>
                    <Th>Side</Th>
                    <Th right>Entry</Th>
                    <Th right>Stop · target</Th>
                    <Th right>Score</Th>
                    <Th right>Result</Th>
                  </tr>
                </thead>
                <tbody>
                  {ov.positions.slice(0, 30).map((p) => (
                    <tr key={p.id}>
                      <Td className="whitespace-nowrap text-ink-2">{timeAgo(p.opened_at)}</Td>
                      <Td className="font-medium">{p.symbol.replace("=X", "")}</Td>
                      <Td>
                        <Badge tone={p.direction === "bull" ? "good" : "bad"}>{p.direction === "bull" ? "Long" : "Short"}</Badge>
                      </Td>
                      <Td right>{p.entry.toPrecision(6)}</Td>
                      <Td right className="text-ink-2">
                        {p.stop.toPrecision(5)} · {p.target.toPrecision(5)}
                      </Td>
                      <Td right>{p.confluence}</Td>
                      <Td right>
                        {p.status === "open" ? (
                          <Badge tone="info">Open</Badge>
                        ) : p.status === "closed" ? (
                          <span className={cx("tnum", (p.pnl ?? 0) >= 0 ? "text-good-ink" : "text-bad-ink")}>
                            {(p.r_multiple ?? 0) >= 0 ? "+" : ""}
                            {(p.r_multiple ?? 0).toFixed(2)}R · {fmtMoney(p.pnl ?? 0, cur, { sign: true })}
                          </span>
                        ) : (
                          <Badge>{p.status}</Badge>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card>
            <CardTitle sub="Markets the paper engine watches (1H bars)">Coverage</CardTitle>
            <ul className="space-y-2.5">
              {ov.markets.map((m) => (
                <li key={m.symbol} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{m.name}</div>
                    <div className="text-[11px] text-muted">
                      {m.assetClass}
                      {!m.allowed && " · not permitted here"}
                      {m.gate && ` · gate ${m.gate.passed ? "passed" : "failed"}`}
                    </div>
                  </div>
                  <Toggle
                    checked={m.enabled}
                    disabled={!m.allowed}
                    label={`Paper trade ${m.name}`}
                    onChange={async (v) => {
                      await api.patch("/api/v1/invest/satellite/markets", { symbol: m.symbol, enabled: v });
                      refreshAll();
                    }}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button variant="ghost" size="sm" icon={<Play className="size-3.5" />} onClick={runBacktest} loading={btBusy}>
                Backtest selected market
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
