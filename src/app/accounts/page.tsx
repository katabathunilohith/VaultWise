"use client";

import { useState } from "react";
import { Banknote, Building2, Coins, CreditCard, PiggyBank, ShoppingBag, Wallet } from "lucide-react";
import { api, refreshAll, useApi } from "@/lib/client";
import { fmtDate, fmtMoney } from "@/lib/shared";
import { Badge, Button, Card, CardTitle, Notice, PageHeader, Skeleton, Table, Td, Th, useToast } from "@/components/ui";

interface Accounts {
  accounts: { id: string; institution: string; name: string; kind: string; mask: string; balance: number; is_primary: number }[];
  transactions: {
    id: string;
    merchant: string;
    category: string;
    amount: number;
    direction: string;
    roundup: number;
    roundup_status: string;
    created_at: number;
  }[];
  roundups: { s: number; n: number };
  roundupVault: { id: string; name: string } | null;
  spendByCategory: { category: string; total: number }[];
  currency: string;
}

const KIND_ICON: Record<string, typeof Wallet> = { checking: Wallet, credit: CreditCard, savings: PiggyBank };

export default function AccountsPage() {
  const { data } = useApi<Accounts>("/api/v1/accounts");
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      toast({ tone: "good", text: await fn() });
      refreshAll();
    } catch (e) {
      toast({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (!data)
    return (
      <div>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-6 h-96" />
      </div>
    );
  const cur = data.currency;
  const maxSpend = Math.max(1, ...data.spendByCategory.map((s) => s.total));

  return (
    <div className="vw-in">
      <PageHeader
        title="Linked accounts"
        subtitle="Open-banking aggregation gives a full picture of your money and powers income detection, percentage rules and round-ups."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Banknote className="size-4" />}
              loading={busy === "salary"}
              onClick={() =>
                run("salary", async () => {
                  const r = await api.post<{ swept: { amount: number }[] }>("/api/v1/accounts/simulate", { type: "salary" });
                  const s = r.swept.reduce((t, x) => t + x.amount, 0);
                  return s ? `Salary detected — ${fmtMoney(s, cur)} moved by your % of income rules.` : "Salary credited.";
                })
              }
            >
              Simulate salary
            </Button>
            <Button
              variant="secondary"
              icon={<ShoppingBag className="size-4" />}
              loading={busy === "spend"}
              onClick={() =>
                run("spend", async () => (await api.post("/api/v1/accounts/simulate", { type: "spend" }), "Three card purchases recorded."))
              }
            >
              Simulate purchases
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.accounts.map((a) => {
          const Icon = KIND_ICON[a.kind] ?? Building2;
          return (
            <Card key={a.id}>
              <div className="flex items-start justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-sunken text-ink-2">
                  <Icon className="size-5" />
                </span>
                {a.is_primary ? <Badge tone="info">Funding account</Badge> : <Badge>Read-only</Badge>}
              </div>
              <div className="mt-4 text-sm font-medium">{a.name}</div>
              <div className="text-xs text-muted">
                {a.institution} ·••{a.mask}
              </div>
              <div className={`tnum mt-3 text-2xl font-semibold ${a.balance < 0 ? "text-bad-ink" : ""}`}>{fmtMoney(a.balance, cur)}</div>
            </Card>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardTitle sub={data.roundupVault ? `Swept into ${data.roundupVault.name}` : "No vault has the round-up rule yet"}>
            <span className="inline-flex items-center gap-2">
              <Coins className="size-4 text-warn" /> Round-ups
            </span>
          </CardTitle>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="tnum text-3xl font-semibold">{fmtMoney(data.roundups.s, cur)}</div>
              <div className="text-[13px] text-muted">waiting from {data.roundups.n} purchases</div>
            </div>
            <Button
              disabled={!data.roundupVault || data.roundups.s === 0}
              loading={busy === "sweep"}
              onClick={() =>
                run("sweep", async () => {
                  const r = await api.post<{ swept: number; count: number }>("/api/v1/accounts/sweep");
                  return `Swept ${fmtMoney(r.swept, cur)} from ${r.count} purchases.`;
                })
              }
            >
              Sweep now
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted">Each card purchase rounds up to the next whole unit. Sweeps run every Sunday automatically.</p>
          {!data.roundupVault && (
            <div className="mt-3">
              <Notice>Turn on round-ups from any vault&apos;s “Goal &amp; rule” settings.</Notice>
            </div>
          )}
        </Card>
        <Card>
          <CardTitle sub="Card spend in the last 30 days">Where money goes</CardTitle>
          <ul className="space-y-2.5">
            {data.spendByCategory.map((s) => (
              <li key={s.category} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[13px]">
                <span className="truncate capitalize text-ink-2">{s.category}</span>
                <span className="h-3.5 overflow-hidden rounded-r-[4px]">
                  <span className="block h-full rounded-r-[4px] bg-accent" style={{ width: `${(s.total / maxSpend) * 100}%` }} />
                </span>
                <span className="tnum w-20 text-right font-medium">{fmtMoney(s.total, cur, { decimals: false })}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-5">
        <CardTitle sub="From your funding account, via the open-banking partner">Recent transactions</CardTitle>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Merchant</Th>
              <Th>Category</Th>
              <Th right>Amount</Th>
              <Th right>Round-up</Th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((t) => (
              <tr key={t.id}>
                <Td className="whitespace-nowrap text-ink-2">{fmtDate(t.created_at, true)}</Td>
                <Td className="font-medium">{t.merchant}</Td>
                <Td>
                  <Badge tone={t.category === "income" ? "good" : "neutral"}>{t.category}</Badge>
                </Td>
                <Td right className={t.direction === "credit" ? "text-good-ink" : ""}>
                  {t.direction === "credit" ? "+" : "−"}
                  {fmtMoney(t.amount, cur)}
                </Td>
                <Td right>
                  {t.roundup > 0 ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="tnum">{fmtMoney(t.roundup, cur)}</span>
                      <Badge tone={t.roundup_status === "swept" ? "good" : t.roundup_status === "pending" ? "warn" : "neutral"}>
                        {t.roundup_status}
                      </Badge>
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
