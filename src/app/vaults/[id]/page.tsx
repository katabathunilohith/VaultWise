"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, FileCheck2, Lock, Pencil, Plus, Users } from "lucide-react";
import { api, refreshAll, useApi, useNow } from "@/lib/client";
import { CATEGORIES, fmtDate, fmtMoney, timeAgo } from "@/lib/shared";
import { BalanceChart } from "@/components/charts";
import { CategoryIcon, RuleIcon, ruleLabel, WITHDRAWAL_STATUS, type VaultView } from "@/components/vault-bits";
import { WithdrawFlow } from "@/components/verification";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Empty,
  ErrorNote,
  Field,
  KV,
  Modal,
  MoneyInput,
  Notice,
  PageHeader,
  Progress,
  Segmented,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
  Input,
  useToast,
} from "@/components/ui";

interface Detail {
  vault: VaultView;
  history: { journal_id: string; kind: string; memo: string; created_at: number; amount: number }[];
  series: { t: number; balance: number }[];
  withdrawals: {
    id: string;
    amount: number;
    payee: string;
    status: string;
    proof_id: string | null;
    created_at: number;
    confidence: number | null;
    decision: string | null;
  }[];
  currency: string;
}

function AddMoney({ vault, currency, onClose }: { vault: VaultView; currency: string; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  return (
    <div className="space-y-4">
      <Field label="Amount" hint="Moved from your linked bank account">
        <MoneyInput
          currency={currency}
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          autoFocus
          placeholder="0.00"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {[25, 50, 100, 250].map((q) => (
          <Button key={q} size="sm" variant="secondary" onClick={() => setAmount(String(q * (currency === "INR" ? 80 : 1)))}>
            {fmtMoney(q * (currency === "INR" ? 80 : 1) * 100, currency, { decimals: false })}
          </Button>
        ))}
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={busy}
          disabled={!Number(amount)}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await api.post(`/api/v1/vaults/${vault.id}/deposits`, { amount: Number(amount) });
              toast({ tone: "good", text: `${fmtMoney(Math.round(Number(amount) * 100), currency)} added to ${vault.name}` });
              refreshAll();
              onClose();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Add money
        </Button>
      </div>
    </div>
  );
}

function EditRule({ vault, currency, onClose }: { vault: VaultView; currency: string; onClose: () => void }) {
  const [rule, setRule] = useState(vault.rule.type);
  const [amount, setAmount] = useState(vault.rule.amount ? String(vault.rule.amount / 100) : "100");
  const [percent, setPercent] = useState(String(vault.rule.percent ?? 5));
  const [freq, setFreq] = useState(vault.rule.frequency ?? "monthly");
  const [target, setTarget] = useState(String(vault.target / 100));
  const [date, setDate] = useState(vault.targetDate ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Goal">
          <MoneyInput currency={currency} value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
        <Field label="Target date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Segmented
        value={rule}
        onChange={setRule}
        options={[
          { value: "fixed", label: "Fixed" },
          { value: "percent_income", label: "% income" },
          { value: "roundup", label: "Round-ups" },
          { value: "none", label: "Manual" },
        ]}
      />
      {rule === "fixed" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Amount">
            <MoneyInput currency={currency} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label="Every">
            <Select value={freq} onChange={(e) => setFreq(e.target.value)}>
              <option value="weekly">Week</option>
              <option value="biweekly">Two weeks</option>
              <option value="monthly">Month</option>
            </Select>
          </Field>
        </div>
      )}
      {rule === "percent_income" && (
        <Field label="Share of income">
          <Select value={percent} onChange={(e) => setPercent(e.target.value)}>
            {[2, 3, 5, 8, 10, 15, 20].map((p) => (
              <option key={p} value={p}>
                {p}%
              </option>
            ))}
          </Select>
        </Field>
      )}
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await api.patch(`/api/v1/vaults/${vault.id}`, {
                target: Number(target),
                targetDate: date || null,
                ruleType: rule,
                ruleAmount: rule === "fixed" ? Number(amount) : undefined,
                rulePercent: rule === "percent_income" ? Number(percent) : undefined,
                ruleFrequency: rule === "fixed" ? freq : undefined,
              });
              refreshAll();
              onClose();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

export default function VaultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useApi<Detail>(`/api/v1/vaults/${id}`);
  const now = useNow();
  const [modal, setModal] = useState<null | "add" | "withdraw" | "rule">(null);
  const [resume, setResume] = useState<{ withdrawalId: string; amount: number; payee: string } | null>(null);
  const toast = useToast();

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-72" />
      </div>
    );
  const v = data.vault;
  const cur = data.currency;
  const color = `var(--cat-${v.category})`;

  return (
    <div className="vw-in">
      <Link href="/vaults" className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Vaults
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <CategoryIcon category={v.category} size="lg" />
            <span>
              {v.name}
              <span className="mt-0.5 block text-sm font-normal text-muted">
                {CATEGORIES[v.category].label}
                {v.category === "custom" && ` · verifies as ${v.template === "custom" ? "strictest tier" : CATEGORIES[v.template].label}`}
              </span>
            </span>
          </span>
        }
        actions={
          <>
            <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setModal("rule")}>
              Goal &amp; rule
            </Button>
            <Button variant="secondary" icon={<ArrowUpRight className="size-4" />} onClick={() => setModal("withdraw")} disabled={v.available <= 0}>
              Withdraw with proof
            </Button>
            <Button variant="brand" icon={<Plus className="size-4" />} onClick={() => setModal("add")}>
              Add money
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[13px] text-muted">Balance</div>
              <div className="tnum text-4xl font-semibold tracking-tight">{fmtMoney(v.balance, cur)}</div>
              <div className="tnum mt-1 text-[13px] text-ink-2">
                {Math.round(v.progress * 100)}% of {fmtMoney(v.target, cur, { decimals: false })}
                {v.targetDate && ` by ${fmtDate(v.targetDate)}`}
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1.5 text-xs text-ink-2">
              <Lock className="size-3.5" /> Locked · released against proof
            </div>
          </div>
          <Progress value={v.progress} color={color} className="mt-4" label="Progress to goal" />
          <div className="mt-6">
            <BalanceChart points={data.series} target={v.target} currency={cur} color={color} now={now} />
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardTitle>Summary</CardTitle>
            <div className="divide-y divide-line">
              <KV k="Available" v={<span className="tnum font-medium">{fmtMoney(v.available, cur)}</span>} />
              <KV k="Held for pending withdrawals" v={<span className="tnum">{fmtMoney(v.held, cur)}</span>} />
              <KV
                k="Contribution rule"
                v={
                  <span className="inline-flex items-center gap-1.5">
                    <RuleIcon type={v.rule.type} /> {ruleLabel(v)}
                  </span>
                }
              />
              {v.rule.nextRunAt && <KV k="Next contribution" v={fmtDate(v.rule.nextRunAt)} />}
              {v.monthlyNeeded != null && (
                <KV k="Needed per month for goal" v={<span className="tnum">{fmtMoney(v.monthlyNeeded, cur, { decimals: false })}</span>} />
              )}
              <KV k="Opened" v={fmtDate(v.createdAt)} />
            </div>
          </Card>
          <Card>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <FileCheck2 className="size-4 text-accent" /> Proof that releases funds
              </span>
            </CardTitle>
            <p className="text-[13px] text-ink-2">{CATEGORIES[v.template].proofHint}.</p>
            <p className="mt-2 text-xs text-muted">
              Checked by a 6-stage AI pipeline: forensics, document understanding, purpose classification and tamper detection. Uncertain cases go to
              a person.
            </p>
          </Card>
          {v.isJoint && (
            <Card>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Users className="size-4" /> Saving together
                </span>
              </CardTitle>
              <ul className="space-y-2.5">
                {v.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 text-sm">
                    <span className="flex size-8 items-center justify-center rounded-full bg-sunken text-xs font-semibold">
                      {m.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")}
                    </span>
                    <span className="flex-1">
                      {m.name}
                      <span className="block text-xs text-muted">{m.role === "owner" ? "Owner" : "Co-saver"}</span>
                    </span>
                    <span className="tnum text-[13px] text-ink-2">{fmtMoney(m.contributed, cur, { decimals: false })}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-5">
        <CardTitle sub="Every withdrawal request and its verification outcome">Withdrawals</CardTitle>
        {data.withdrawals.length === 0 ? (
          <p className="text-sm text-muted">No withdrawals yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Requested</Th>
                <Th>Paid to</Th>
                <Th right>Amount</Th>
                <Th>Status</Th>
                <Th right>Confidence</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.withdrawals.map((w) => (
                <tr key={w.id}>
                  <Td className="text-ink-2">{timeAgo(w.created_at)}</Td>
                  <Td>{w.payee}</Td>
                  <Td right>{fmtMoney(w.amount, cur)}</Td>
                  <Td>
                    <Badge tone={WITHDRAWAL_STATUS[w.status]?.tone ?? "neutral"}>{WITHDRAWAL_STATUS[w.status]?.label ?? w.status}</Badge>
                  </Td>
                  <Td right>{w.confidence != null ? `${Math.round(w.confidence * 100)}%` : "—"}</Td>
                  <Td right>
                    {w.proof_id ? (
                      <Link href={`/proofs/${w.proof_id}`} className="text-[13px] font-medium text-accent-ink hover:underline">
                        Report
                      </Link>
                    ) : w.status === "awaiting_proof" ? (
                      <span className="inline-flex gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setResume({ withdrawalId: w.id, amount: w.amount, payee: w.payee })}>
                          Add proof
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await api.del(`/api/v1/withdrawals/${w.id}`);
                              toast({ tone: "good", text: "Request cancelled — the money is available again." });
                              refreshAll();
                            } catch (e) {
                              toast({ tone: "bad", text: (e as Error).message });
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-5">
        <CardTitle sub="Immutable double-entry postings for this vault's sub-ledger">Ledger</CardTitle>
        {data.history.length === 0 ? (
          <Empty title="No postings yet" body="Add money or set a contribution rule to get started." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Type</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {data.history.slice(0, 40).map((h, i) => (
                <tr key={h.journal_id + i}>
                  <Td className="whitespace-nowrap text-ink-2">{fmtDate(h.created_at, true)}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      {h.amount > 0 ? <ArrowDownLeft className="size-3.5 text-good" /> : <ArrowUpRight className="size-3.5 text-muted" />}
                      {h.memo}
                    </span>
                  </Td>
                  <Td>
                    <Badge>{h.kind.replace(/_/g, " ")}</Badge>
                  </Td>
                  <Td right className={h.amount > 0 ? "text-good-ink" : "text-ink"}>
                    {fmtMoney(h.amount, cur, { sign: true })}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={modal === "add"} onClose={() => setModal(null)} title={`Add money to ${v.name}`}>
        <AddMoney vault={v} currency={cur} onClose={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "rule"} onClose={() => setModal(null)} title="Goal & contribution rule">
        <EditRule vault={v} currency={cur} onClose={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "withdraw"} onClose={() => setModal(null)} title={`Withdraw from ${v.name}`} wide>
        {modal === "withdraw" && <WithdrawFlow vault={v} currency={cur} onClose={() => setModal(null)} />}
      </Modal>
      <Modal open={!!resume} onClose={() => setResume(null)} title={`Add proof · ${v.name}`} wide>
        {resume && <WithdrawFlow vault={v} currency={cur} resume={resume} onClose={() => setResume(null)} />}
      </Modal>
      {v.available <= 0 && v.balance > 0 && (
        <div className="mt-4">
          <Notice tone="warn">All of this vault&apos;s balance is held for pending requests.</Notice>
        </div>
      )}
    </div>
  );
}
