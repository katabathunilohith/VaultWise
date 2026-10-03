"use client";

import { useMemo, useState } from "react";
import { Bot, Cog, Link2, ShieldCheck, User, UserCheck } from "lucide-react";
import { useApi } from "@/lib/client";
import { fmtDate, fmtMoney } from "@/lib/shared";
import { Badge, Card, PageHeader, Segmented, Skeleton, Table, Td, Th, cx } from "@/components/ui";

interface Data {
  currency: string;
  audit: {
    id: number;
    ts: number;
    actor: string;
    actor_type: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    details: Record<string, unknown> | null;
    hash: string;
  }[];
  journals: { id: string; kind: string; memo: string; created_at: number; entries: { account: string; kind: string; amount: number }[] }[];
}

const GROUPS: Record<string, (a: string) => boolean> = {
  all: () => true,
  money: (a) => a.startsWith("ledger.") || a.startsWith("withdrawal") || a.startsWith("contribution"),
  verification: (a) => a.startsWith("proof") || a.startsWith("verification"),
  emergency: (a) => a.startsWith("emergency"),
  investing: (a) => a.startsWith("invest") || a.startsWith("satellite") || a.startsWith("strategy"),
  account: (a) => a.startsWith("user") || a.startsWith("kyc") || a.startsWith("vault.") || a.startsWith("privacy") || a.startsWith("demo"),
};

const ACTOR_ICON: Record<string, typeof User> = { user: User, system: Cog, model: Bot, reviewer: UserCheck };

function describe(a: Data["audit"][number], cur: string) {
  const d = a.details ?? {};
  if (a.action.startsWith("ledger.")) return String(d.memo ?? a.action);
  if (a.action === "verification.auto_approved") return `Proof auto-approved (${Math.round(Number(d.confidence ?? 0) * 100)}% confidence)`;
  if (a.action === "verification.auto_denied") return `Proof auto-declined (${Math.round(Number(d.confidence ?? 0) * 100)}% confidence)`;
  if (a.action === "verification.human_review") return "Proof routed to a human reviewer";
  if (a.action === "emergency.attested") return `Emergency attested · Tier ${d.tier} · ${fmtMoney(Number(d.amount ?? 0), cur)}`;
  if (a.action === "withdrawal.requested") return `Withdrawal requested · ${fmtMoney(Number(d.amount ?? 0), cur)}`;
  if (a.action === "satellite.paper_opened") return `Paper ${d.dir === "bull" ? "long" : "short"} ${d.symbol} · confluence ${d.confluence}`;
  if (a.action === "satellite.paper_closed") return `Paper position closed ${d.symbol} · ${Number(d.r ?? 0).toFixed(2)}R`;
  return a.action.replace(/[._]/g, " ");
}

export default function ActivityPage() {
  const { data } = useApi<Data>("/api/v1/activity?limit=400");
  const [view, setView] = useState<"audit" | "ledger">("audit");
  const [group, setGroup] = useState("all");
  const rows = useMemo(() => (data ? data.audit.filter((a) => GROUPS[group](a.action)) : []), [data, group]);

  return (
    <div className="vw-in">
      <PageHeader
        title="Activity & audit"
        subtitle="Every state-changing action — yours, the system's, a model's or a reviewer's — is appended to a hash-chained log that can't be edited after the fact."
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "audit", label: "Audit trail" },
              { value: "ledger", label: "Ledger journals" },
            ]}
          />
        }
      />
      {!data ? (
        <Skeleton className="h-96" />
      ) : view === "audit" ? (
        <Card>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {Object.keys(GROUPS).map((g) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className={cx(
                  "rounded-full border px-3 py-1 text-[13px] capitalize transition-colors",
                  group === g ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:border-line-strong",
                )}
              >
                {g}
              </button>
            ))}
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="size-3.5 text-good" /> SHA-256 chained
            </span>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((a) => {
              const Icon = ACTOR_ICON[a.actor_type] ?? Cog;
              return (
                <li key={a.id} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-2" title={a.actor_type}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink">{describe(a, data.currency)}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                      <span>{fmtDate(a.ts, true)}</span>
                      <span>·</span>
                      <Badge className="!px-1.5 !py-0 !text-[10px]">{a.action}</Badge>
                      <span>· by {a.actor_type === "user" ? "you" : a.actor}</span>
                    </div>
                  </div>
                  <span className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-muted sm:inline-flex" title={a.hash}>
                    <Link2 className="size-3" />
                    {a.hash.slice(0, 10)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Journal</Th>
                <Th>Debit / credit legs</Th>
              </tr>
            </thead>
            <tbody>
              {data.journals.map((j) => (
                <tr key={j.id}>
                  <Td className="whitespace-nowrap align-top text-ink-2">{fmtDate(j.created_at, true)}</Td>
                  <Td className="align-top">
                    <div className="font-medium">{j.memo}</div>
                    <div className="font-mono text-[11px] text-muted">
                      {j.id} · {j.kind}
                    </div>
                  </Td>
                  <Td>
                    <div className="space-y-0.5">
                      {j.entries.map((e, k) => (
                        <div key={k} className="flex justify-between gap-6 text-[13px]">
                          <span className="text-ink-2">{e.account}</span>
                          <span className={cx("tnum", e.amount > 0 ? "text-good-ink" : "text-ink")}>
                            {e.amount > 0 ? `Dr ${fmtMoney(e.amount, data.currency)}` : `Cr ${fmtMoney(-e.amount, data.currency)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
