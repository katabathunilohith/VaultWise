"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, CircleCheck, Clock, HeartPulse, KeyRound, ShieldAlert, Siren, Upload } from "lucide-react";
import { api, refreshAll, useApi } from "@/lib/client";
import { EMERGENCY_REASONS, fmtDate, fmtMoney, timeAgo, type VaultCategory } from "@/lib/shared";
import { CategoryIcon } from "@/components/vault-bits";
import { DecisionBanner, PipelineStages, ProofPicker, useProof } from "@/components/verification";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  ErrorNote,
  Field,
  Input,
  Modal,
  MoneyInput,
  Notice,
  PageHeader,
  Progress,
  Select,
  Skeleton,
  StatusIcon,
  Table,
  Td,
  Th,
  Textarea,
  cx,
  useToast,
  type Tone,
} from "@/components/ui";

interface PlanItem {
  vaultId: string;
  vaultName: string;
  category: VaultCategory;
  amount: number;
  tier: 1 | 2;
  settled: boolean;
}
interface Plan {
  amount: number;
  items: PlanItem[];
  tier1: number;
  tier2: number;
  shortfall: number;
  needsPin: boolean;
  needsNote: boolean;
  coolingOff: boolean;
  releaseEstimate: string;
  checks: { key: string; label: string; status: "pass" | "warn" | "block"; detail: string }[];
  blocked: boolean;
  risk: { score: number; features: { name: string; value: number | null; points: number }[] };
}
interface RequestView {
  id: string;
  amount: number;
  reason: string;
  note: string | null;
  tier: number;
  plan: PlanItem[];
  riskScore: number;
  status: "released" | "processing" | "cooling_off" | "blocked";
  releaseAt: number | null;
  releasedAt: number | null;
  receiptStatus: string;
  receiptDueAt: number | null;
  receiptProofId: string | null;
  createdAt: number;
}
interface Status {
  currency: string;
  cap: number;
  usedThisMonth: number;
  remainingCap: number;
  requestsLast7d: number;
  friction: { level: number; label: string; detail: string };
  tier1Available: number;
  tier2Available: number;
  healthVaults: { id: string; name: string; category: VaultCategory; available: number }[];
  tier2Vaults: { id: string; name: string; category: VaultCategory; available: number }[];
  history: RequestView[];
  rules: { maxRequestsPer7d: number; cooloffHours: number; tier2HoldSeconds: number; receiptWindowDays: number };
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  released: { label: "Released", tone: "good" },
  processing: { label: "Releasing", tone: "info" },
  cooling_off: { label: "Cooling-off", tone: "warn" },
  blocked: { label: "Blocked", tone: "bad" },
};
const RECEIPT: Record<string, { label: string; tone: Tone }> = {
  not_required: { label: "Not required", tone: "neutral" },
  optional: { label: "Optional", tone: "neutral" },
  requested: { label: "Requested", tone: "warn" },
  submitted: { label: "Checking", tone: "info" },
  in_review: { label: "With reviewer", tone: "info" },
  verified: { label: "Verified", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
  overdue: { label: "Overdue", tone: "bad" },
};

function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.round((to - now) / 1000));
  useEffect(() => {
    if (s === 0) {
      const t = setTimeout(refreshAll, 1500);
      return () => clearTimeout(t);
    }
  }, [s]);
  if (s === 0) return <span>releasing…</span>;
  if (s > 3600)
    return (
      <span className="tnum">
        {Math.floor(s / 3600)}h {Math.floor((s % 3600) / 60)}m
      </span>
    );
  return (
    <span className="tnum">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

function CascadeViz({ plan, currency }: { plan: Plan; currency: string }) {
  const t1 = plan.items.filter((i) => i.tier === 1);
  const t2 = plan.items.filter((i) => i.tier === 2);
  const Row = ({ i }: { i: PlanItem }) => (
    <div className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2">
      <CategoryIcon category={i.category} size="sm" />
      <span className="flex-1 truncate text-[13px] font-medium">{i.vaultName}</span>
      <span className="tnum text-[13px] font-semibold">{fmtMoney(i.amount, currency)}</span>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className={cx("rounded-xl border p-3", t1.length ? "border-good/40 bg-good-soft" : "border-line bg-sunken opacity-70")}>
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-good-ink">
          <span className="inline-flex items-center gap-1.5">
            <HeartPulse className="size-3.5" /> Tier 1 · Health vault · attestation only
          </span>
          <span>instant</span>
        </div>
        {t1.length ? t1.map((i) => <Row key={i.vaultId} i={i} />) : <div className="px-1 text-xs text-ink-2">Health vault is empty</div>}
      </div>
      {t2.length > 0 && (
        <>
          <div className="flex justify-center text-muted">
            <ArrowDown className="size-4" aria-hidden />
          </div>
          <div className="rounded-xl border border-warn/40 bg-warn-soft p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-warn-ink">
              <span className="inline-flex items-center gap-1.5">
                <KeyRound className="size-3.5" /> Tier 2 · other vaults · PIN + reason
              </span>
              <span>within minutes</span>
            </div>
            <div className="space-y-1.5">
              {t2.map((i) => (
                <Row key={i.vaultId} i={i} />
              ))}
            </div>
          </div>
        </>
      )}
      {plan.shortfall > 0 && <Notice tone="bad">Short by {fmtMoney(plan.shortfall, currency)} across all vaults.</Notice>}
    </div>
  );
}

function ReceiptUpload({ request, currency, onClose }: { request: RequestView; currency: string; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [proofId, setProofId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const proof = useProof(proofId);
  if (proof)
    return (
      <div className="space-y-4">
        <DecisionBanner v={proof} currency={currency} />
        <div className="rounded-xl border border-line p-4">
          <PipelineStages stages={proof.verification.stages} compact />
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose} disabled={proof.verification.status === "processing"}>
            Done
          </Button>
        </div>
      </div>
    );
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        Your {fmtMoney(request.amount, currency)} release already went through. A supporting bill keeps emergency access fast for you next time — it
        never claws back the money.
      </p>
      <ProofPicker file={file} onFile={setFile} />
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Later
        </Button>
        <Button
          disabled={!file}
          loading={busy}
          onClick={async () => {
            if (!file) return;
            setBusy(true);
            setErr(null);
            try {
              const fd = new FormData();
              fd.append("file", file);
              const r = await api.upload<{ id: string }>(`/api/v1/emergency/${request.id}/receipt`, fd);
              setProofId(r.id);
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Submit receipt
        </Button>
      </div>
    </div>
  );
}

export default function EmergencyPage() {
  const { data: st } = useApi<Status>("/api/v1/emergency", { interval: 15_000 });
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("medical");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [attest, setAttest] = useState(false);
  const [fetchedPlan, setPlan] = useState<Plan | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; releaseAt?: number; receiptRequired?: boolean; plan: Plan } | null>(null);
  const [receiptFor, setReceiptFor] = useState<RequestView | null>(null);

  const minor = Math.round(Number(amount || 0) * 100);
  useEffect(() => {
    if (!minor) return;
    const t = setTimeout(async () => {
      try {
        setPlan(await api.post<Plan>("/api/v1/emergency/preview", { amount: Number(amount) }));
        setPlanErr(null);
      } catch (e) {
        setPlanErr((e as Error).message);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minor, st?.usedThisMonth]);

  const plan = minor && fetchedPlan?.amount === minor ? fetchedPlan : null;

  if (!st)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96" />
      </div>
    );
  const cur = st.currency;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ status: string; releaseAt?: number; receiptRequired?: boolean; plan: Plan }>("/api/v1/emergency/withdrawals", {
        amount: Number(amount),
        reasonCode: reason,
        note: note || undefined,
        attest,
        pin: plan?.needsPin ? pin : undefined,
      });
      setResult(r);
      setAmount("");
      setPin("");
      setAttest(false);
      setNote("");
      toast({ tone: "good", text: r.status === "released" ? "Funds released to your linked account." : "Request accepted." });
      refreshAll();
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const capUsed = st.usedThisMonth / st.cap;

  return (
    <div className="vw-in">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2.5">
            <Siren className="size-7 text-bad" /> Emergency access
          </span>
        }
        subtitle="For genuine emergencies: your Health vault releases instantly on your word. Only once it's empty do other vaults open — with your PIN, a reason and a short hold."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="border-bad/25">
          {result ? (
            <div className="vw-in space-y-4">
              {result.status === "blocked" ? (
                <Notice tone="bad" title="Request blocked by a guardrail">
                  {result.plan.checks
                    .filter((c) => c.status === "block")
                    .map((c) => c.detail)
                    .join(" · ")}
                </Notice>
              ) : (
                <Notice
                  tone="good"
                  title={
                    result.status === "released"
                      ? "Released to your linked account"
                      : result.status === "cooling_off"
                        ? "Cooling-off period applies"
                        : "Tier 1 released — Tier 2 is on its way"
                  }
                >
                  {result.status === "released" && "The money is in your linked bank account now."}
                  {result.status === "processing" && (
                    <>
                      {result.plan.tier1 > 0 && `${fmtMoney(result.plan.tier1, cur)} from your Health vault is already in your account. `}
                      {fmtMoney(result.plan.tier2, cur)} from other vaults releases in {result.releaseAt && <Countdown to={result.releaseAt} />}.
                    </>
                  )}
                  {result.status === "cooling_off" && (
                    <>
                      Because this is repeat use within 72 hours, release waits {st.rules.cooloffHours} hours (
                      {result.releaseAt && <Countdown to={result.releaseAt} />}).
                    </>
                  )}
                </Notice>
              )}
              {result.receiptRequired && result.status !== "blocked" && (
                <Notice tone="info" title="A receipt will be requested">
                  Upload the bill within {st.rules.receiptWindowDays} days. It doesn&apos;t delay or reverse this release.
                </Notice>
              )}
              <CascadeViz plan={result.plan} currency={cur} />
              <Button variant="secondary" onClick={() => setResult(null)}>
                New request
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="How much do you need?">
                  <MoneyInput
                    currency={cur}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="0.00"
                    className="h-12 text-lg"
                  />
                </Field>
                <Field label="Reason">
                  <Select value={reason} onChange={(e) => setReason(e.target.value)} className="h-12">
                    {Object.entries(EMERGENCY_REASONS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {planErr && <ErrorNote>{planErr}</ErrorNote>}
              {plan && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 text-[13px] font-medium text-ink-2">Where it comes from</div>
                    <CascadeViz plan={plan} currency={cur} />
                  </div>
                  <div>
                    <div className="mb-2 text-[13px] font-medium text-ink-2">Guardrails</div>
                    <ul className="space-y-2">
                      {plan.checks.map((c) => (
                        <li key={c.key} className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2">
                          <StatusIcon status={c.status === "block" ? "fail" : c.status} className="mt-0.5" />
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium">{c.label}</div>
                            <div className="text-xs text-ink-2">{c.detail}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {plan && !plan.blocked && (
                <div className="space-y-4 rounded-xl bg-surface-2 p-4">
                  {plan.needsNote && (
                    <Field label="What happened?" hint="Repeat use this month — a short description is required.">
                      <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
                    </Field>
                  )}
                  {plan.needsPin && (
                    <Field label="Your security PIN" hint="Tier 2 opens other vaults, so we re-confirm it's you.">
                      <Input
                        type="password"
                        inputMode="numeric"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                        maxLength={6}
                        className="max-w-[180px]"
                        autoComplete="off"
                      />
                    </Field>
                  )}
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={attest}
                      onChange={(e) => setAttest(e.target.checked)}
                      className="mt-0.5 size-4 accent-[var(--bad)]"
                    />
                    <span>
                      <span className="font-medium">I confirm this is a genuine emergency.</span>
                      <span className="block text-xs text-muted">
                        Your attestation is recorded in the audit log. We may ask for a receipt afterwards; it won&apos;t delay this release.
                      </span>
                    </span>
                  </label>
                  {err && <ErrorNote>{err}</ErrorNote>}
                  <Button
                    variant="danger"
                    size="lg"
                    className="w-full"
                    disabled={!attest || (plan.needsPin && pin.length < 4) || (plan.needsNote && note.trim().length < 10)}
                    loading={busy}
                    onClick={submit}
                  >
                    Release {fmtMoney(plan.amount, cur)} · {plan.releaseEstimate}
                  </Button>
                </div>
              )}
              {plan?.blocked && (
                <Notice tone="bad" title="This request would be blocked">
                  Guardrails protect your savings from misuse. If this is urgent and above the cap, contact support.
                </Notice>
              )}
              {!plan && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    { icon: HeartPulse, t: "Tier 1", b: "Health vault, released instantly on your attestation. No paperwork." },
                    { icon: KeyRound, t: "Tier 2", b: "Only when Health is empty: PIN + reason, released within minutes." },
                    { icon: ShieldAlert, t: "Guardrails", b: "Monthly cap, velocity limit, cooling-off on repeat use, risk review." },
                  ].map((x) => (
                    <div key={x.t} className="rounded-xl bg-surface-2 p-4">
                      <x.icon className="size-5 text-ink-2" />
                      <div className="mt-2 text-sm font-semibold">{x.t}</div>
                      <div className="mt-1 text-xs leading-relaxed text-ink-2">{x.b}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardTitle>Available now</CardTitle>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-ink-2">Tier 1 · Health</span>
                <span className="tnum font-semibold">{fmtMoney(st.tier1Available, cur)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-ink-2">Tier 2 · other vaults</span>
                <span className="tnum font-semibold">{fmtMoney(st.tier2Available, cur)}</span>
              </div>
            </div>
          </Card>
          <Card>
            <CardTitle>Your guardrails</CardTitle>
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-muted">Monthly cap</span>
                  <span className="tnum text-ink-2">
                    {fmtMoney(st.usedThisMonth, cur, { decimals: false })} / {fmtMoney(st.cap, cur, { decimals: false })}
                  </span>
                </div>
                <Progress
                  value={capUsed}
                  color={capUsed > 0.8 ? "var(--bad)" : capUsed > 0.5 ? "var(--warn)" : "var(--accent)"}
                  label="Monthly cap used"
                />
              </div>
              <div>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-muted">Requests in last 7 days</span>
                  <span className="tnum text-ink-2">
                    {st.requestsLast7d} / {st.rules.maxRequestsPer7d}
                  </span>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: st.rules.maxRequestsPer7d }, (_, k) => (
                    <span key={k} className={cx("h-2 flex-1 rounded-full", k < st.requestsLast7d ? "bg-warn" : "bg-sunken")} />
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg bg-surface-2 p-3">
                <Clock className="mt-0.5 size-4 text-ink-2" />
                <div>
                  <div className="text-[13px] font-medium">Friction: {st.friction.label}</div>
                  <div className="text-xs text-ink-2">{st.friction.detail}</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardTitle sub="Every request — released, held or blocked — is in your audit log">History</CardTitle>
        {st.history.length === 0 ? (
          <p className="text-sm text-muted">No emergency requests yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Reason</Th>
                <Th>Tier</Th>
                <Th right>Amount</Th>
                <Th>Status</Th>
                <Th>Receipt</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {st.history.map((h) => (
                <tr key={h.id}>
                  <Td className="whitespace-nowrap text-ink-2">{timeAgo(h.createdAt)}</Td>
                  <Td>{h.reason}</Td>
                  <Td>{h.tier === 2 ? <Badge tone="warn">Tier 2</Badge> : <Badge tone="good">Tier 1</Badge>}</Td>
                  <Td right>{fmtMoney(h.amount, cur)}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <Badge tone={STATUS[h.status].tone}>{STATUS[h.status].label}</Badge>
                      {(h.status === "processing" || h.status === "cooling_off") && h.releaseAt && (
                        <span className="text-xs text-muted">
                          <Countdown to={h.releaseAt} />
                        </span>
                      )}
                    </span>
                  </Td>
                  <Td>
                    <span className="inline-flex flex-col">
                      <Badge tone={RECEIPT[h.receiptStatus]?.tone ?? "neutral"}>{RECEIPT[h.receiptStatus]?.label ?? h.receiptStatus}</Badge>
                      {h.receiptStatus === "requested" && h.receiptDueAt && (
                        <span className="mt-0.5 text-[11px] text-muted">due {fmtDate(h.receiptDueAt)}</span>
                      )}
                    </span>
                  </Td>
                  <Td right>
                    {["requested", "optional", "overdue", "rejected"].includes(h.receiptStatus) && h.status !== "blocked" ? (
                      <Button size="sm" variant="secondary" icon={<Upload className="size-3.5" />} onClick={() => setReceiptFor(h)}>
                        Receipt
                      </Button>
                    ) : h.receiptProofId ? (
                      <Link href={`/proofs/${h.receiptProofId}`} className="text-[13px] font-medium text-accent-ink hover:underline">
                        Report
                      </Link>
                    ) : h.status === "released" ? (
                      <CircleCheck className="ml-auto size-4 text-good" aria-label="Released" />
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={!!receiptFor} onClose={() => setReceiptFor(null)} title="Supporting receipt" wide>
        {receiptFor && <ReceiptUpload request={receiptFor} currency={cur} onClose={() => setReceiptFor(null)} />}
      </Modal>
    </div>
  );
}
