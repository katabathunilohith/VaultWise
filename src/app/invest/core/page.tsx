"use client";

import { useState } from "react";
import { CalendarClock, Pause, ShoppingCart } from "lucide-react";
import { api, refreshAll, useApi } from "@/lib/client";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/shared";
import { InvestNav } from "@/components/invest-nav";
import { FanChart, TwoLineChart } from "@/components/charts";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  ErrorNote,
  Field,
  LinkButton,
  Modal,
  MoneyInput,
  Notice,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
  cx,
  useToast,
} from "@/components/ui";

interface CoreData {
  profile: { band: number; bandName: string; score: number } | null;
  band?: { name: string; expReturn: number; vol: number };
  allocations: { slot: string; label: string; symbol: string; name: string; weight: number }[];
  quotes: { symbol: string; price: number | null; change: number | null; currency: string | null; source: string }[];
  holdings: {
    holdings: {
      symbol: string;
      name: string;
      label: string;
      units: number;
      cost: number;
      price: number;
      dayChange: number;
      value: number;
      pnl: number;
      weight: number;
      targetWeight: number;
    }[];
    total: number;
    cost: number;
    pnl: number;
    cash: number;
  };
  sips: { id: string; amount: number; frequency: string; next_run_at: number; active: number }[];
  orders: { id: string; symbol: string; units: number; price: number; amount: number; source: string; created_at: number }[];
  currency: string;
}

const COLORS = ["#2a78d6", "#1baf7a", "#eb6834", "#eda100", "#e87ba4"];

export default function CorePage() {
  const { data } = useApi<CoreData>("/api/v1/invest/core");
  const toast = useToast();
  const [modal, setModal] = useState<null | "buy" | "sip">(null);
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState<"monthly" | "weekly">("monthly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [histMonthly, setHistMonthly] = useState(300);
  const [projMonthly, setProjMonthly] = useState(300);
  const [years, setYears] = useState(15);
  const { data: hist } = useApi<{
    points: { month: string; value: number; contributed: number }[];
    totalContributed: number;
    finalValue: number;
    startMonth: string;
    sources: string[];
  }>(data?.profile ? `/api/v1/invest/core/history?monthly=${histMonthly * (data.currency === "INR" ? 80 : 1)}` : null);
  const { data: proj } = useApi<{
    years: { year: number; contributed: number; p10: number; p25: number; p50: number; p75: number; p90: number }[];
    assumptions: { expReturn: number; vol: number; paths: number };
  }>(
    data?.profile
      ? `/api/v1/invest/core/projection?monthly=${projMonthly * (data.currency === "INR" ? 80 : 1)}&years=${years}&initial=${data ? Math.round((data.holdings.total + data.holdings.cash) / 100) : 0}`
      : null,
  );

  if (!data)
    return (
      <div>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-6 h-96" />
      </div>
    );
  if (!data.profile)
    return (
      <div className="vw-in">
        <PageHeader title="Core sleeve" />
        <InvestNav />
        <Notice
          tone="info"
          title="Complete your risk profile first"
          action={
            <LinkButton href="/invest/profile" size="sm">
              Start
            </LinkButton>
          }
        >
          The Core model portfolio is chosen from your risk band.
        </Notice>
      </div>
    );

  const cur = data.currency;
  const sip = data.sips.find((s) => s.active);
  const h = data.holdings;

  const act = async (kind: "buy" | "sip") => {
    setBusy(true);
    setErr(null);
    try {
      if (kind === "buy") await api.post("/api/v1/invest/core/buy", { amount: Number(amount) });
      else await api.post("/api/v1/invest/core/sip", { amount: Number(amount), frequency: freq });
      toast({ tone: "good", text: kind === "buy" ? "Order filled across your model portfolio." : "Recurring SIP saved." });
      setModal(null);
      setAmount("");
      refreshAll();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const histGain = hist ? hist.finalValue - hist.totalContributed : 0;

  return (
    <div className="vw-in">
      <PageHeader
        title="Core sleeve"
        subtitle={`${data.profile.bandName} model portfolio of low-cost index ETFs. Prices are live; execution is simulated through a brokerage-as-a-service partner.`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<CalendarClock className="size-4" />}
              onClick={() => {
                setAmount(sip ? String(sip.amount / 100) : "300");
                setModal("sip");
              }}
            >
              {sip ? "Edit SIP" : "Set up SIP"}
            </Button>
            <Button
              variant="brand"
              icon={<ShoppingCart className="size-4" />}
              onClick={() => {
                setAmount("");
                setModal("buy");
              }}
            >
              Invest now
            </Button>
          </>
        }
      />
      <InvestNav />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="text-[13px] text-muted">Market value</div>
              <div className="tnum text-4xl font-semibold tracking-tight">{fmtMoney(h.total, cur)}</div>
              <div className={cx("tnum mt-1 text-sm", h.pnl >= 0 ? "text-good-ink" : "text-bad-ink")}>
                {fmtMoney(h.pnl, cur, { sign: true })} ({h.cost ? fmtPct((h.pnl / h.cost) * 100, 2, true) : "0%"}) on {fmtMoney(h.cost, cur)} invested
              </div>
            </div>
            {sip ? (
              <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
                <div className="text-xs text-muted">Recurring SIP</div>
                <div className="tnum font-semibold">
                  {fmtMoney(sip.amount, cur)} {sip.frequency}
                </div>
                <div className="text-xs text-muted">next {fmtDate(sip.next_run_at)}</div>
              </div>
            ) : (
              <Badge tone="warn">No recurring SIP</Badge>
            )}
          </div>
          <div className="mt-6">
            <Table>
              <thead>
                <tr>
                  <Th>Fund</Th>
                  <Th right>Units</Th>
                  <Th right>Price</Th>
                  <Th right>Value</Th>
                  <Th right>Gain/loss</Th>
                  <Th right>Weight · target</Th>
                </tr>
              </thead>
              <tbody>
                {h.holdings.map((x) => (
                  <tr key={x.symbol}>
                    <Td>
                      <div className="font-medium">{x.symbol}</div>
                      <div className="max-w-[220px] truncate text-xs text-muted">{x.name}</div>
                    </Td>
                    <Td right>{x.units.toFixed(3)}</Td>
                    <Td right>
                      {x.price.toFixed(2)}
                      <div className={cx("text-[11px]", x.dayChange >= 0 ? "text-good-ink" : "text-bad-ink")}>
                        {fmtPct(x.dayChange * 100, 2, true)}
                      </div>
                    </Td>
                    <Td right>{fmtMoney(x.value, cur)}</Td>
                    <Td right className={x.pnl >= 0 ? "text-good-ink" : "text-bad-ink"}>
                      {fmtMoney(x.pnl, cur, { sign: true })}
                    </Td>
                    <Td right>
                      {Math.round(x.weight * 100)}% · <span className="text-muted">{Math.round(x.targetWeight * 100)}%</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {h.holdings.length === 0 && <p className="mt-4 text-sm text-muted">No holdings yet — invest now or set up a SIP.</p>}
          </div>
        </Card>

        <Card>
          <CardTitle sub="Target weights for your band, with live quotes">Model portfolio</CardTitle>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {data.allocations.map((a, i) => (
              <div key={a.symbol} style={{ width: `${a.weight * 100}%`, background: COLORS[i] }} />
            ))}
          </div>
          <ul className="mt-4 divide-y divide-line">
            {data.allocations.map((a, i) => {
              const q = data.quotes.find((x) => x.symbol === a.symbol);
              return (
                <li key={a.symbol} className="flex items-center gap-3 py-2.5">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: COLORS[i] }} />
                  <span className="min-w-0 flex-1">
                    <span className="text-[13px] font-medium">{a.label}</span>
                    <span className="block truncate text-[11px] text-muted">{a.symbol}</span>
                  </span>
                  <span className="text-right">
                    <span className="tnum block text-[13px] font-semibold">{Math.round(a.weight * 100)}%</span>
                    {q?.price != null && (
                      <span className={cx("tnum block text-[11px]", (q.change ?? 0) >= 0 ? "text-good-ink" : "text-bad-ink")}>
                        {q.price.toFixed(2)} {q.currency} {fmtPct((q.change ?? 0) * 100, 1, true)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-muted">Quotes: Yahoo Finance ({data.quotes[0]?.source}). Delayed; for illustration.</p>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardTitle
            sub={hist ? `A monthly SIP into today's model portfolio since ${hist.startMonth}, using real monthly closes` : "Loading market history…"}
            action={
              <Select
                aria-label="Monthly SIP amount for the illustration"
                value={histMonthly}
                onChange={(e) => setHistMonthly(Number(e.target.value))}
                className="h-8 w-auto text-[13px]"
              >
                {[100, 300, 500, 1000].map((m) => (
                  <option key={m} value={m}>
                    {fmtMoney(m * 100 * (cur === "INR" ? 80 : 1), cur, { decimals: false })}/mo
                  </option>
                ))}
              </Select>
            }
          >
            What a SIP would have done
          </CardTitle>
          {hist ? (
            <>
              <div className="mb-4 flex gap-8">
                <div>
                  <div className="text-xs text-muted">Contributed</div>
                  <div className="tnum text-lg font-semibold">{fmtMoney(hist.totalContributed, cur, { decimals: false })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Would be worth</div>
                  <div className="tnum text-lg font-semibold">{fmtMoney(hist.finalValue, cur, { decimals: false })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Growth</div>
                  <div className={cx("tnum text-lg font-semibold", histGain >= 0 ? "text-good-ink" : "text-bad-ink")}>
                    {fmtMoney(histGain, cur, { sign: true, decimals: false })}
                  </div>
                </div>
              </div>
              <TwoLineChart
                data={hist.points}
                xKey="month"
                a={{ key: "value", label: "Portfolio value", color: "var(--accent)" }}
                b={{ key: "contributed", label: "Total contributed", color: "var(--ink-2)" }}
                format={(v) => fmtMoney(v, cur, { compact: true })}
                xFormat={(m) => {
                  const [y, mm] = String(m).split("-");
                  return new Date(Number(y), Number(mm) - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
                }}
              />
              <p className="mt-3 text-[11px] text-muted">Past performance does not predict future results. Excludes fees and taxes.</p>
            </>
          ) : (
            <Skeleton className="h-64" />
          )}
        </Card>

        <Card>
          <CardTitle
            sub={
              proj
                ? `${proj.assumptions.paths.toLocaleString()} simulated paths at ${(proj.assumptions.expReturn * 100).toFixed(1)}% expected return, ${(proj.assumptions.vol * 100).toFixed(0)}% volatility`
                : "Simulating…"
            }
          >
            Range of outcomes
          </CardTitle>
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <Field label="Monthly">
              <Select value={projMonthly} onChange={(e) => setProjMonthly(Number(e.target.value))} className="h-8 text-[13px]">
                {[100, 300, 500, 1000, 2000].map((m) => (
                  <option key={m} value={m}>
                    {fmtMoney(m * 100 * (cur === "INR" ? 80 : 1), cur, { decimals: false })}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Horizon">
              <Segmented
                size="sm"
                value={String(years)}
                onChange={(v) => setYears(Number(v))}
                options={[5, 10, 15, 25].map((y) => ({ value: String(y), label: `${y}y` }))}
              />
            </Field>
          </div>
          {proj ? <FanChart years={proj.years} currency={cur} /> : <Skeleton className="h-64" />}
        </Card>
      </div>

      <Card className="mt-5">
        <CardTitle sub="Fractional fills recorded by the Core engine">Order history</CardTitle>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Fund</Th>
              <Th>Source</Th>
              <Th right>Units</Th>
              <Th right>Price</Th>
              <Th right>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {data.orders.slice(0, 20).map((o) => (
              <tr key={o.id}>
                <Td className="text-ink-2">{fmtDate(o.created_at)}</Td>
                <Td className="font-medium">{o.symbol}</Td>
                <Td>
                  <Badge>{o.source === "sip" ? "SIP" : "One-off"}</Badge>
                </Td>
                <Td right>{o.units.toFixed(4)}</Td>
                <Td right>{o.price.toFixed(2)}</Td>
                <Td right>{fmtMoney(o.amount, cur)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "buy" ? "Invest in your model portfolio" : "Recurring SIP"}
        footer={
          <>
            {modal === "sip" && sip && (
              <Button
                variant="ghost"
                icon={<Pause className="size-4" />}
                onClick={async () => {
                  await api.del("/api/v1/invest/core/sip");
                  setModal(null);
                  refreshAll();
                }}
              >
                Pause SIP
              </Button>
            )}
            <Button onClick={() => modal && act(modal)} loading={busy} disabled={!Number(amount)}>
              {modal === "buy" ? "Place order" : "Save SIP"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Amount" hint="Debited from your linked bank account — never from a vault.">
            <MoneyInput currency={cur} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} autoFocus />
          </Field>
          {modal === "sip" && (
            <Field label="Frequency">
              <Segmented
                value={freq}
                onChange={setFreq}
                options={[
                  { value: "monthly", label: "Monthly" },
                  { value: "weekly", label: "Weekly" },
                ]}
              />
            </Field>
          )}
          <div className="rounded-lg bg-surface-2 p-3 text-[13px]">
            {data.allocations.map((a) => (
              <div key={a.symbol} className="flex justify-between py-0.5">
                <span className="text-ink-2">
                  {a.symbol} · {Math.round(a.weight * 100)}%
                </span>
                <span className="tnum">{fmtMoney(Math.round(Number(amount || 0) * 100 * a.weight), cur)}</span>
              </div>
            ))}
          </div>
          {err && <ErrorNote>{err}</ErrorNote>}
        </div>
      </Modal>
    </div>
  );
}
