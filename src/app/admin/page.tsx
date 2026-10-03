"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, CircleCheck, CircleX, Clock, Database, Flag, Gauge, Link2, ScanSearch, ShieldCheck, TrendingUp } from "lucide-react";
import { api, refreshAll, useApi, useNow } from "@/lib/client";
import { CATEGORIES, fmtDate, fmtMoney, timeAgo, type VaultCategory } from "@/lib/shared";
import { LegendRow, TipBox } from "@/components/charts";
import { Badge, Button, Card, CardTitle, Empty, Notice, PageHeader, Skeleton, Table, Tabs, Td, Th, cx, useToast, type Tone } from "@/components/ui";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Overview {
  queue: {
    proof_id: string;
    confidence: number | null;
    decision: string;
    final_decision: string | null;
    reasons: string[];
    queued_at: number | null;
    appeal_note: string | null;
    category: VaultCategory;
    purpose: string;
    user_name: string;
    currency: string;
    vault_name: string | null;
    amount: number | null;
    payee: string | null;
    slaDueAt: number;
  }[];
  flags: {
    id: string;
    source: string;
    ref_id: string | null;
    severity: "low" | "medium" | "high";
    score: number;
    description: string;
    status: string;
    resolution: string | null;
    created_at: number;
  }[];
  metrics: {
    total: number;
    autoApproved: number;
    autoDenied: number;
    humanReview: number;
    automationRate: number;
    reviewerAgreement: number | null;
    reviewedCount: number;
    appeals: number;
    overturned: number;
    falseDeclineRate: number;
    slaCompliance: number | null;
    avgPipelineMs: number | null;
    daily: { day: string; decision: string; n: number }[];
  };
  reconciliation: {
    ok: boolean;
    journals: number;
    unbalanced: { journal_id: string; total: number }[];
    byCurrency: { currency: string; total: number; entries: number }[];
    drift: { account_id: string; name: string; projected: number; replayed: number }[];
    trial: { kind: string; currency: string; total: number; accounts: number }[];
    checkedAt: number;
  };
  auditChain: { ok: boolean; checked: number; brokenAt: number | null; headHash: string };
  strategies: {
    id: string;
    name: string;
    stage: string;
    last_backtest: {
      gate: { passed: boolean };
      full: { trades: number; maxDrawdownPct: number };
      oos: { expectancyR: number; profitFactor: number };
      ranAt: number;
    } | null;
  }[];
}

const SEV: Record<string, Tone> = { high: "bad", medium: "warn", low: "neutral" };

function Tile({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-[13px] text-muted">
        {icon}
        {label}
      </div>
      <div className="tnum mt-2 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

function DecisionsChart({ daily }: { daily: Overview["metrics"]["daily"] }) {
  const days = [...new Set(daily.map((d) => d.day))].sort();
  const data = days.map((day) => ({
    day,
    approved: daily.find((d) => d.day === day && d.decision === "auto_approved")?.n ?? 0,
    denied: daily.find((d) => d.day === day && d.decision === "auto_denied")?.n ?? 0,
    review: daily.find((d) => d.day === day && d.decision === "human_review")?.n ?? 0,
  }));
  const series = [
    { key: "approved", label: "Auto-approved", color: "#1baf7a" },
    { key: "review", label: "Human review", color: "#eda100" },
    { key: "denied", label: "Auto-declined", color: "#e34948" },
  ];
  if (!data.length) return <p className="text-sm text-muted">No decisions in the last 30 days.</p>;
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            stroke="var(--chart-axis)"
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            stroke="var(--chart-axis)"
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ fill: "var(--sunken)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TipBox
                  title={new Date(payload[0].payload.day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  rows={series.map((s) => ({ color: s.color, label: s.label, value: payload[0].payload[s.key] }))}
                />
              ) : null
            }
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="a"
              fill={s.color}
              maxBarSize={24}
              stroke="var(--surface)"
              strokeWidth={1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3">
        <LegendRow items={series.map((s) => ({ color: s.color, label: s.label, kind: "rect" as const }))} />
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { data } = useApi<Overview>("/api/v1/admin/overview", { interval: 20_000 });
  const { data: audit } = useApi<{
    rows: { id: number; ts: number; actor: string; actor_type: string; action: string; entity_id: string | null; hash: string; prev_hash: string }[];
  }>("/api/v1/audit/all?limit=60");
  const [tab, setTab] = useState<"queue" | "flags" | "metrics" | "ledger" | "audit" | "strategies">("queue");
  const now = useNow(30_000);
  const toast = useToast();

  if (!data)
    return (
      <div>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-6 h-96" />
      </div>
    );
  const m = data.metrics;
  const openFlags = data.flags.filter((f) => f.status === "open");
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

  return (
    <div className="vw-in">
      <PageHeader
        eyebrow="Internal · reviewers, risk & compliance"
        title="Operations console"
        subtitle="Human-in-the-loop review, risk flags, model monitoring and the integrity checks auditors ask for."
      />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Awaiting review" value={String(data.queue.length)} sub="SLA 4 business hours" icon={<Clock className="size-4" />} />
        <Tile
          label="Open risk flags"
          value={String(openFlags.length)}
          sub={`${openFlags.filter((f) => f.severity === "high").length} high severity`}
          icon={<Flag className="size-4" />}
        />
        <Tile label="Automation rate" value={pct(m.automationRate)} sub={`${m.total} verifications`} icon={<Bot className="size-4" />} />
        <Tile
          label="Integrity"
          value={data.reconciliation.ok && data.auditChain.ok ? "Healthy" : "Attention"}
          sub={`ledger ${data.reconciliation.ok ? "balanced" : "drift"} · audit chain ${data.auditChain.ok ? "intact" : "broken"}`}
          icon={<ShieldCheck className="size-4" />}
        />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "queue", label: "Review queue", count: data.queue.length },
          { value: "flags", label: "Risk flags", count: openFlags.length },
          { value: "metrics", label: "Model metrics" },
          { value: "ledger", label: "Ledger" },
          { value: "audit", label: "Audit chain" },
          { value: "strategies", label: "Strategies" },
        ]}
      />

      {tab === "queue" &&
        (data.queue.length === 0 ? (
          <Empty icon={<CircleCheck className="size-6" />} title="Queue is clear" body="Uncertain verifications and appeals land here." />
        ) : (
          <div className="space-y-3">
            {data.queue.map((q) => {
              const overdue = now > q.slaDueAt;
              return (
                <Link
                  key={q.proof_id}
                  href={`/admin/review/${q.proof_id}`}
                  className="block rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-accent"
                >
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{q.amount != null ? fmtMoney(q.amount, q.currency) : "Receipt"}</span>
                        <span className="text-sm text-ink-2">{q.payee ? `to ${q.payee}` : ""}</span>
                        {q.final_decision === "appealed" ? <Badge tone="warn">Appeal</Badge> : <Badge tone="info">Uncertain</Badge>}
                        <Badge>{q.purpose === "emergency_receipt" ? "Emergency receipt" : CATEGORIES[q.category]?.label}</Badge>
                      </div>
                      <div className="mt-1 text-[13px] text-muted">
                        {q.user_name} · {q.vault_name ?? "Emergency"} · queued {q.queued_at ? timeAgo(q.queued_at) : ""}
                      </div>
                      <ul className="mt-2 space-y-0.5 text-[13px] text-ink-2">
                        {q.reasons.slice(0, 3).map((r) => (
                          <li key={r}>• {r}</li>
                        ))}
                      </ul>
                      {q.appeal_note && <div className="mt-2 rounded-lg bg-sunken px-3 py-2 text-[13px]">Customer: “{q.appeal_note}”</div>}
                    </div>
                    <div className="text-right">
                      <div className="tnum text-xl font-semibold">{q.confidence != null ? `${Math.round(q.confidence * 100)}%` : "—"}</div>
                      <div className="text-[11px] text-muted">model confidence</div>
                      <div className={cx("mt-2 text-xs font-medium", overdue ? "text-bad-ink" : "text-ink-2")}>
                        {overdue ? `SLA breached ${timeAgo(q.slaDueAt)}` : `SLA due ${timeAgo(q.slaDueAt)}`}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}

      {tab === "flags" && (
        <Card>
          {data.flags.length === 0 ? (
            <p className="text-sm text-muted">No flags raised.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Raised</Th>
                  <Th>Severity</Th>
                  <Th>Source</Th>
                  <Th>Description</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.flags.map((f) => (
                  <tr key={f.id}>
                    <Td className="whitespace-nowrap text-ink-2">{timeAgo(f.created_at)}</Td>
                    <Td>
                      <Badge tone={SEV[f.severity]}>
                        {f.severity} · {f.score}
                      </Badge>
                    </Td>
                    <Td>{f.source.replace(/_/g, " ")}</Td>
                    <Td className="max-w-md">
                      {f.description}
                      {f.ref_id?.startsWith("prf_") && (
                        <Link href={`/admin/review/${f.ref_id}`} className="ml-2 text-xs text-accent-ink hover:underline">
                          view proof
                        </Link>
                      )}
                      {f.resolution && <div className="text-xs text-muted">→ {f.resolution}</div>}
                    </Td>
                    <Td>
                      <Badge tone={f.status === "open" ? "warn" : "neutral"}>{f.status}</Badge>
                    </Td>
                    <Td right>
                      {f.status === "open" && (
                        <span className="inline-flex gap-1">
                          {(["resolved", "dismissed"] as const).map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              variant={s === "resolved" ? "secondary" : "ghost"}
                              onClick={async () => {
                                const resolution = prompt(
                                  s === "resolved" ? "Resolution (e.g. confirmed misuse, account restricted)" : "Why dismiss? (e.g. false positive)",
                                );
                                if (!resolution) return;
                                await api.post(`/api/v1/admin/flags/${f.id}`, { status: s, resolution });
                                toast({ tone: "good", text: `Flag ${s}.` });
                                refreshAll();
                              }}
                            >
                              {s === "resolved" ? "Resolve" : "Dismiss"}
                            </Button>
                          ))}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "metrics" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile label="Auto-approved" value={String(m.autoApproved)} icon={<CircleCheck className="size-4 text-good" />} />
            <Tile label="Auto-declined" value={String(m.autoDenied)} icon={<CircleX className="size-4 text-bad" />} />
            <Tile label="Sent to review" value={String(m.humanReview)} icon={<ScanSearch className="size-4 text-warn" />} />
            <Tile
              label="Avg pipeline time"
              value={m.avgPipelineMs ? `${(m.avgPipelineMs / 1000).toFixed(1)} s` : "—"}
              icon={<Gauge className="size-4" />}
            />
            <Tile
              label="False-decline rate"
              value={pct(m.falseDeclineRate)}
              sub={`${m.overturned} of ${m.autoDenied} declines overturned on appeal`}
              icon={<TrendingUp className="size-4" />}
            />
            <Tile
              label="Reviewer agreement"
              value={pct(m.reviewerAgreement)}
              sub={`model lean vs. ${m.reviewedCount} human decisions`}
              icon={<Bot className="size-4" />}
            />
            <Tile label="Review SLA met" value={pct(m.slaCompliance)} sub="decided within 4 hours" icon={<Clock className="size-4" />} />
            <Tile label="Appeals" value={String(m.appeals)} icon={<Flag className="size-4" />} />
          </div>
          <Card>
            <CardTitle sub="Daily outcomes, last 30 days">Verification decisions</CardTitle>
            <DecisionsChart daily={m.daily} />
          </Card>
          <Notice tone="info" title="Active learning loop">
            Reviewer decisions on uncertain and appealed cases are stored as labels for periodic retraining. False-decline rate is tracked as a
            first-class metric because it&apos;s the main churn driver in verification-gated products.
          </Notice>
        </div>
      )}

      {tab === "ledger" && (
        <div className="space-y-5">
          <Notice tone={data.reconciliation.ok ? "good" : "bad"} title={data.reconciliation.ok ? "Ledger reconciles" : "Reconciliation failed"}>
            {data.reconciliation.journals.toLocaleString()} journals replayed at {fmtDate(data.reconciliation.checkedAt, true)}. Every journal sums to
            zero, every currency nets to zero, and the balance projection matches a full replay of the append-only entries.
          </Notice>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardTitle sub="Sum of all postings per currency (must be 0)">Double-entry check</CardTitle>
              <Table>
                <thead>
                  <tr>
                    <Th>Currency</Th>
                    <Th right>Entries</Th>
                    <Th right>Net</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.reconciliation.byCurrency.map((c) => (
                    <tr key={c.currency}>
                      <Td>{c.currency}</Td>
                      <Td right>{c.entries.toLocaleString()}</Td>
                      <Td right className={c.total === 0 ? "text-good-ink" : "text-bad-ink"}>
                        {c.total}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="mt-3 text-xs text-muted">
                Unbalanced journals: {data.reconciliation.unbalanced.length} · projection drift: {data.reconciliation.drift.length}
              </div>
            </Card>
            <Card>
              <CardTitle sub="Balances by account type">Trial balance</CardTitle>
              <Table>
                <thead>
                  <tr>
                    <Th>Account type</Th>
                    <Th right>Accounts</Th>
                    <Th right>Balance</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.reconciliation.trial.map((t) => (
                    <tr key={t.kind + t.currency}>
                      <Td>
                        <span className="inline-flex items-center gap-2">
                          <Database className="size-3.5 text-muted" /> {t.kind.replace(/_/g, " ")}
                        </span>
                      </Td>
                      <Td right>{t.accounts}</Td>
                      <Td right>{fmtMoney(t.total, t.currency)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="space-y-5">
          <Notice
            tone={data.auditChain.ok ? "good" : "bad"}
            title={data.auditChain.ok ? "Audit chain intact" : `Chain broken at entry ${data.auditChain.brokenAt}`}
          >
            Re-hashed {data.auditChain.checked.toLocaleString()} entries from genesis. Head hash{" "}
            <code className="font-mono text-xs">{data.auditChain.headHash.slice(0, 24)}…</code> · UPDATE and DELETE are blocked by database triggers.
          </Notice>
          <Card>
            <CardTitle sub="Most recent entries across all actors">Global log</CardTitle>
            {!audit ? (
              <Skeleton className="h-64" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Time</Th>
                    <Th>Actor</Th>
                    <Th>Action</Th>
                    <Th>Entity</Th>
                    <Th>Hash ← prev</Th>
                  </tr>
                </thead>
                <tbody>
                  {audit.rows.map((r) => (
                    <tr key={r.id}>
                      <Td className="tnum text-muted">{r.id}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{fmtDate(r.ts, true)}</Td>
                      <Td>
                        <Badge tone={r.actor_type === "model" ? "info" : r.actor_type === "reviewer" ? "warn" : "neutral"}>{r.actor_type}</Badge>
                      </Td>
                      <Td mono>{r.action}</Td>
                      <Td mono className="text-muted">
                        {r.entity_id ?? "—"}
                      </Td>
                      <Td mono className="whitespace-nowrap text-muted">
                        <Link2 className="mr-1 inline size-3" />
                        {r.hash.slice(0, 8)} ← {r.prev_hash.slice(0, 8)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {tab === "strategies" && (
        <Card>
          <CardTitle sub="Satellite strategies by market and timeframe. Run backtests from the Satellite page.">Strategy governance</CardTitle>
          {data.strategies.length === 0 ? (
            <p className="text-sm text-muted">No strategies have been backtested yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Strategy</Th>
                  <Th>Stage</Th>
                  <Th right>Trades</Th>
                  <Th right>OOS expectancy</Th>
                  <Th right>OOS PF</Th>
                  <Th right>Max DD</Th>
                  <Th>Gate</Th>
                </tr>
              </thead>
              <tbody>
                {data.strategies.map((s) => (
                  <tr key={s.id}>
                    <Td className="font-medium">{s.name}</Td>
                    <Td>
                      <Badge>{s.stage}</Badge>
                    </Td>
                    <Td right>{s.last_backtest?.full.trades ?? "—"}</Td>
                    <Td right>{s.last_backtest ? `${s.last_backtest.oos.expectancyR.toFixed(3)}R` : "—"}</Td>
                    <Td right>{s.last_backtest?.oos.profitFactor.toFixed(2) ?? "—"}</Td>
                    <Td right>{s.last_backtest ? `${s.last_backtest.full.maxDrawdownPct.toFixed(1)}%` : "—"}</Td>
                    <Td>
                      {s.last_backtest ? s.last_backtest.gate.passed ? <Badge tone="good">passed</Badge> : <Badge tone="bad">failed</Badge> : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
