"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX, Eye, FileImage, Gavel, Hourglass, ImageUp, LoaderCircle, ScanSearch, Upload } from "lucide-react";
import { api, refreshAll, useApi } from "@/lib/client";
import { CATEGORIES, fmtMoney, type VaultCategory } from "@/lib/shared";
import { Badge, Button, ErrorNote, Field, MoneyInput, Notice, Progress, Segmented, StatusIcon, Textarea, Input, cx, useToast } from "./ui";

export interface StageView {
  key: string;
  name: string;
  status: "pending" | "running" | "passed" | "warning" | "failed" | "skipped";
  score?: number;
  startedAt?: number;
  finishedAt?: number;
  summary?: string;
  checks: { label: string; status: "pass" | "warn" | "fail" | "info"; detail: string }[];
  data?: Record<string, unknown>;
}

export interface ProofView {
  id: string;
  purpose: string;
  category: VaultCategory;
  fileName: string;
  createdAt: number;
  hasEla: boolean;
  extracted: Record<string, unknown> | null;
  vault: { id: string; name: string; category: string } | null;
  withdrawal: { id: string; amount: number; payee: string; status: string } | null;
  emergencyId: string | null;
  verification: {
    status: "processing" | "complete" | "error";
    stages: StageView[];
    confidence: number | null;
    decision: "auto_approved" | "auto_denied" | "human_review" | null;
    finalDecision: "approved" | "denied" | "appealed" | null;
    reasons: string[];
    modelVersion: string | null;
    reviewer: string | null;
    reviewerNote: string | null;
    appealNote: string | null;
    queuedAt: number | null;
    decidedAt: number | null;
    durationMs: number | null;
  };
}

/* ---------- Upload ---------- */

const SAMPLE_ORDER = ["medical-invoice", "pharmacy-receipt", "tuition-invoice", "rent-receipt", "coffee-receipt", "old-invoice", "tampered-invoice"];

export function ProofPicker({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const { data } = useApi<{ samples: { key: string; label: string; category: string; expect: string }[] }>("/api/v1/samples");
  const [drag, setDrag] = useState(false);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const pickSample = async (key: string) => {
    setLoadingSample(key);
    try {
      const res = await fetch(`/api/v1/samples/${key}`);
      const blob = await res.blob();
      onFile(new File([blob], `${key}.jpg`, { type: "image/jpeg" }));
    } finally {
      setLoadingSample(null);
    }
  };

  const samples = (data?.samples ?? []).sort((a, b) => SAMPLE_ORDER.indexOf(a.key) - SAMPLE_ORDER.indexOf(b.key));

  return (
    <div className="space-y-4">
      {file && preview ? (
        <div className="flex items-center gap-4 rounded-xl border border-line bg-surface-2 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Selected proof" className="h-24 w-20 rounded-md border border-line object-cover" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{file.name}</div>
            <div className="text-xs text-muted">
              {(file.size / 1024).toFixed(0)} KB · {file.type || "image"}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onFile(null)}>
            Change
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className={cx(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
            drag ? "border-accent bg-accent-soft" : "border-line-strong hover:border-accent",
          )}
        >
          <ImageUp className="size-7 text-muted" aria-hidden />
          <div className="text-sm font-medium">Drop a photo or scan of the bill</div>
          <div className="text-xs text-muted">JPEG, PNG or WebP · up to 10 MB</div>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {!file && samples.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-muted">Or try a generated sample document</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {samples.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => pickSample(s.key)}
                className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent-soft/50"
              >
                {loadingSample === s.key ? (
                  <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-accent" />
                ) : (
                  <FileImage className="mt-0.5 size-4 shrink-0 text-muted" />
                )}
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">{s.label}</span>
                  <span className="block text-[11px] leading-snug text-muted">{s.expect}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Pipeline ---------- */

function stageIcon(s: StageView["status"]) {
  if (s === "running") return <LoaderCircle className="size-[18px] animate-spin text-accent" aria-label="running" />;
  if (s === "passed") return <CircleCheck className="size-[18px] text-good" aria-label="passed" />;
  if (s === "warning") return <StatusIcon status="warn" className="size-[18px]" />;
  if (s === "failed") return <CircleX className="size-[18px] text-bad" aria-label="failed" />;
  if (s === "skipped") return <span className="block size-[18px] rounded-full border-2 border-dashed border-line-strong" aria-label="skipped" />;
  return <span className="block size-[18px] rounded-full border-2 border-line-strong" aria-label="pending" />;
}

export function DecisionBanner({ v, currency }: { v: ProofView; currency: string }) {
  const ver = v.verification;
  if (ver.status === "processing")
    return (
      <div className="flex items-center gap-3 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">
        <LoaderCircle className="size-5 animate-spin" aria-hidden />
        <div>
          <div className="font-semibold">Verifying your proof</div>
          <div className="text-[13px] opacity-90">Most documents are decided in a few seconds.</div>
        </div>
      </div>
    );
  const final = ver.finalDecision;
  const approved = final === "approved";
  const denied = final === "denied";
  const appealed = final === "appealed";
  const tone = approved ? "good" : denied ? "bad" : "warn";
  const title = approved
    ? ver.reviewer
      ? "Approved by a reviewer"
      : "Approved automatically"
    : denied
      ? ver.reviewer
        ? "Declined by a reviewer"
        : "Declined automatically"
      : appealed
        ? "Appeal with a reviewer"
        : "Sent to a human reviewer";
  const body = approved
    ? v.withdrawal
      ? `${fmtMoney(v.withdrawal.amount, currency)} released to your linked bank account.`
      : "Receipt verified — thank you."
    : denied
      ? "No money moved. You can appeal and a person will look at it."
      : `Funds stay held while a reviewer checks it (target: within 4 business hours).`;
  return (
    <div
      className={cx(
        "rounded-xl px-4 py-3.5",
        tone === "good" ? "bg-good-soft text-good-ink" : tone === "bad" ? "bg-bad-soft text-bad-ink" : "bg-warn-soft text-warn-ink",
      )}
    >
      <div className="flex items-start gap-3">
        {approved ? (
          <CircleCheck className="mt-0.5 size-5 shrink-0" />
        ) : denied ? (
          <CircleX className="mt-0.5 size-5 shrink-0" />
        ) : (
          <Hourglass className="mt-0.5 size-5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          <div className="mt-0.5 text-[13px] opacity-90">{body}</div>
          {ver.reasons.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[13px] opacity-90">
              {ver.reasons.slice(0, 4).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {ver.reviewerNote && <div className="mt-2 text-[13px]">Reviewer: “{ver.reviewerNote}”</div>}
        </div>
        {ver.confidence != null && (
          <div className="shrink-0 text-right">
            <div className="tnum text-xl font-semibold">{Math.round(ver.confidence * 100)}%</div>
            <div className="text-[11px] opacity-80">confidence</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PipelineStages({ stages, compact }: { stages: StageView[]; compact?: boolean }) {
  return (
    <ol className="relative space-y-1">
      {stages.map((s, i) => {
        const dur = s.startedAt && s.finishedAt ? s.finishedAt - s.startedAt : null;
        const open = !compact || s.status === "failed" || s.status === "warning" || s.status === "running";
        return (
          <li key={s.key} className="relative pl-9">
            {i < stages.length - 1 && <span className="absolute top-6 bottom-[-6px] left-[8px] w-px bg-line" aria-hidden />}
            <span className="absolute top-0.5 left-0 rounded-full bg-surface">{stageIcon(s.status)}</span>
            <div className="flex items-center gap-2 pb-1">
              <span className={cx("text-sm font-medium", s.status === "pending" ? "text-muted" : "text-ink")}>
                {i + 1}. {s.name}
              </span>
              {s.status === "running" && s.key === "extract" && <span className="text-xs text-muted">reading the document…</span>}
              {dur != null && (
                <span className="tnum ml-auto text-[11px] text-muted">{dur < 1000 ? `${dur} ms` : `${(dur / 1000).toFixed(1)} s`}</span>
              )}
            </div>
            {s.summary && <div className="pb-1 text-xs text-muted">{s.summary}</div>}
            {open && s.checks.length > 0 && (
              <ul className="space-y-1 pb-3">
                {s.checks.map((c, k) => (
                  <li key={k} className="flex items-start gap-2 text-[13px]">
                    <StatusIcon status={c.status} className="mt-0.5 size-3.5" />
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{c.label}</span>
                      <span className="text-ink-2"> — {c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function useProof(id: string | null) {
  const { data, reload } = useApi<ProofView>(id ? `/api/v1/proofs/${id}` : null);
  const processing = !data || data.verification.status === "processing";
  useEffect(() => {
    if (!id || !processing) return;
    const t = setInterval(reload, 700);
    return () => clearInterval(t);
  }, [id, processing, reload]);
  useEffect(() => {
    if (data && data.verification.status !== "processing") refreshAll();
    // Refresh the rest of the app once, when the decision lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.verification.status]);
  return data;
}

export function ProofImages({ proofId, hasEla }: { proofId: string; hasEla: boolean }) {
  const [mode, setMode] = useState<"original" | "ela">("original");
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{mode === "ela" ? "Error-level analysis heatmap" : "Uploaded document"}</span>
        {hasEla && (
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              {
                value: "original",
                label: (
                  <span className="inline-flex items-center gap-1">
                    <Eye className="size-3" />
                    Original
                  </span>
                ),
              },
              {
                value: "ela",
                label: (
                  <span className="inline-flex items-center gap-1">
                    <ScanSearch className="size-3" />
                    ELA
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/v1/proofs/${proofId}/file${mode === "ela" ? "?kind=ela" : ""}`}
        alt={mode === "ela" ? "ELA heatmap: brighter regions changed more when re-compressed" : "Proof document"}
        className="w-full rounded-lg border border-line bg-sunken"
      />
      {mode === "ela" && (
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Brighter areas changed more on re-compression. A bright patch that stands out from similar text suggests it was pasted in later.
        </p>
      )}
    </div>
  );
}

export function AppealForm({ proofId, onDone }: { proofId: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  if (!open)
    return (
      <Button variant="secondary" icon={<Gavel className="size-4" />} onClick={() => setOpen(true)}>
        Appeal to a person
      </Button>
    );
  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <Field label="What should the reviewer know?" hint="E.g. the bill is for a dependant, or the hospital sent a revised invoice.">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex gap-2">
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await api.post(`/api/v1/proofs/${proofId}/appeal`, { note });
              toast({ tone: "good", text: "Appeal sent — a reviewer will take a look." });
              setOpen(false);
              refreshAll();
              onDone?.();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Send appeal
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ---------- Withdrawal flow ---------- */

export function WithdrawFlow({
  vault,
  currency,
  onClose,
  resume,
}: {
  vault: {
    id: string;
    name: string;
    category: VaultCategory;
    template: VaultCategory;
    available: number;
    monthlyNeeded: number | null;
    rule: { type: string; amount: number | null; frequency: string | null };
  };
  currency: string;
  onClose: () => void;
  /** Continue a request that was created earlier but never got its proof. */
  resume?: { withdrawalId: string; amount: number; payee: string };
}) {
  const [step, setStep] = useState<"details" | "proof" | "verify">(resume ? "proof" : "details");
  const [amount, setAmount] = useState(resume ? String(resume.amount / 100) : "");
  const [payee, setPayee] = useState(resume?.payee ?? "");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [withdrawalId, setWithdrawalId] = useState<string | null>(resume?.withdrawalId ?? null);
  const [proofId, setProofId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const proof = useProof(proofId);
  const { data: limits } = useApi<{ limits: { singleWithdrawal: number }; usage: { dailyRemaining: number } }>("/api/v1/limits");
  const minor = Math.round(Number(amount || 0) * 100);
  const monthlyPace =
    vault.rule.type === "fixed" && vault.rule.amount
      ? vault.rule.frequency === "weekly"
        ? vault.rule.amount * 4.33
        : vault.rule.frequency === "biweekly"
          ? vault.rule.amount * 2.17
          : vault.rule.amount
      : vault.monthlyNeeded;
  const setback = monthlyPace && minor > 0 ? minor / monthlyPace : null;

  const createWithdrawal = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>(`/api/v1/vaults/${vault.id}/withdrawals`, { amount: Number(amount), payee, note: note || undefined });
      setWithdrawalId(r.id);
      setStep("proof");
      refreshAll();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitProof = async () => {
    if (!file || !withdrawalId) return;
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("withdrawalId", withdrawalId);
      const r = await api.upload<{ id: string }>(`/api/v1/vaults/${vault.id}/proofs`, fd);
      setProofId(r.id);
      setStep("verify");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <ol className="flex items-center gap-2 text-xs font-medium">
        {(["details", "proof", "verify"] as const).map((s, i) => (
          <li key={s} className={cx("flex items-center gap-2", step === s ? "text-ink" : "text-muted")}>
            <span
              className={cx("flex size-5 items-center justify-center rounded-full text-[11px]", step === s ? "bg-accent text-white" : "bg-sunken")}
            >
              {i + 1}
            </span>
            {s === "details" ? "Amount" : s === "proof" ? "Proof" : "Verification"}
            {i < 2 && <span className="mx-1 h-px w-6 bg-line" />}
          </li>
        ))}
      </ol>

      {step === "details" && (
        <div className="space-y-4">
          <Field
            label="Amount"
            hint={`Available: ${fmtMoney(vault.available, currency)}${
              limits
                ? ` · limit ${fmtMoney(limits.limits.singleWithdrawal, currency, { decimals: false })} per withdrawal, ${fmtMoney(limits.usage.dailyRemaining, currency, { decimals: false })} left today`
                : ""
            }`}
          >
            <MoneyInput
              currency={currency}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0.00"
              autoFocus
            />
          </Field>
          <Field label="Paid to" hint="The hospital, school, landlord or merchant on the bill">
            <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="e.g. City General Hospital" />
          </Field>
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {setback != null && setback >= 0.5 && (
            <Notice tone="info" title="Before you withdraw">
              This would set {vault.name} back about {setback < 1.5 ? "one month" : `${Math.round(setback)} months`} of saving at your current pace.
            </Notice>
          )}
          <Notice tone="info" icon={<Upload className="size-4" />}>
            You&apos;ll need: {CATEGORIES[vault.template].proofHint.toLowerCase()}.
          </Notice>
          {err && <ErrorNote>{err}</ErrorNote>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={createWithdrawal} loading={busy} disabled={!minor || payee.trim().length < 2}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === "proof" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">
            Upload proof for <span className="tnum font-semibold text-ink">{fmtMoney(minor, currency)}</span> to {payee}. The amount is held in the
            vault until it&apos;s verified.
          </p>
          <ProofPicker file={file} onFile={setFile} />
          {err && <ErrorNote>{err}</ErrorNote>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-xs text-muted">Not ready? Close this and use “Add proof” on the vault within 24 hours.</span>
            <Button onClick={submitProof} loading={busy} disabled={!file} icon={<ScanSearch className="size-4" />}>
              Verify &amp; withdraw
            </Button>
          </div>
        </div>
      )}

      {step === "verify" && proof && (
        <div className="space-y-4">
          <DecisionBanner v={proof} currency={currency} />
          <div className="rounded-xl border border-line p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Verification pipeline</span>
              {proof.verification.durationMs != null && <Badge>{(proof.verification.durationMs / 1000).toFixed(1)} s</Badge>}
            </div>
            <PipelineStages stages={proof.verification.stages} compact />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {proof.verification.finalDecision === "denied" && <AppealForm proofId={proof.id} />}
            <Link
              href={`/proofs/${proof.id}`}
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-accent-ink hover:bg-accent-soft"
            >
              Full report
            </Link>
            <Button variant="secondary" onClick={onClose} disabled={proof.verification.status === "processing"}>
              Done
            </Button>
          </div>
        </div>
      )}
      {step === "verify" && !proof && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" /> Starting verification…
        </div>
      )}
      {step === "verify" && proof?.verification.status === "processing" && <ProgressHint />}
    </div>
  );
}

/** Mounted only while verification runs, so its timer starts from zero each time. */
function ProgressHint() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (secs < 6) return null;
  return (
    <div className="space-y-1.5">
      <Progress value={Math.min(0.95, secs / 40)} height={4} label="Waiting for model capacity" />
      <p className="text-xs text-muted">The vision model is busy — the request is queued and retries automatically ({secs}s).</p>
    </div>
  );
}
