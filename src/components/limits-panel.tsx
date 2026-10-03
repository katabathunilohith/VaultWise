"use client";

import { useState } from "react";
import { CalendarClock, CircleCheck, CircleX, Gauge, Hourglass, ShieldAlert, Siren } from "lucide-react";
import { api, refreshAll, useApi } from "@/lib/client";
import { EMERGENCY_REASONS, fmtDate, fmtMoney, LIMIT_LABELS, type LimitKey } from "@/lib/shared";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  ErrorNote,
  Field,
  Modal,
  MoneyInput,
  Notice,
  Select,
  Skeleton,
  Textarea,
  cx,
  useToast,
  type Tone,
} from "./ui";

const KEYS: LimitKey[] = ["singleWithdrawal", "dailyWithdrawal", "monthlyEmergency"];
type Limits = Record<LimitKey, number>;

interface Change {
  id: string;
  kind: "tighten" | "standard" | "emergency";
  status: "applied" | "in_review" | "denied" | "reverted" | "superseded";
  before: Limits;
  after: Limits;
  reason: string | null;
  explanation: string | null;
  assessment: {
    ai: { genuine: number; urgency: number; proportionate: number; scam_risk: number; signals: string[]; user_message: string } | null;
    decision: string;
    reasons: string[];
  } | null;
  reviewerNote: string | null;
  expiresAt: number | null;
  createdAt: number;
}

export interface LimitsOverview {
  currency: string;
  limits: Limits;
  bounds: Record<LimitKey, { min: number; max: number; default: number }>;
  usage: { withdrawnToday: number; dailyRemaining: number };
  quota: { perMonth: number; used: number; available: boolean; lastUsedAt: number | null; nextAvailableAt: number; resetsAt: number };
  emergency: { perMonth: number; used: number; increaseDays: number; maxIncreaseRatio: number };
  active: Change[];
  history: Change[];
}

interface EmergencyResult {
  decision: "approved" | "in_review" | "denied";
  reasons: string[];
  message: string | null;
  expiresAt: number | null;
}

const STATUS: Record<Change["status"], { label: string; tone: Tone }> = {
  applied: { label: "Applied", tone: "good" },
  in_review: { label: "With reviewer", tone: "warn" },
  denied: { label: "Declined", tone: "bad" },
  reverted: { label: "Expired", tone: "neutral" },
  superseded: { label: "Replaced", tone: "neutral" },
};
const KIND: Record<Change["kind"], string> = { tighten: "Lowered", standard: "Monthly change", emergency: "Emergency request" };

function changedSummary(c: Change, cur: string) {
  return KEYS.filter((k) => c.before[k] !== c.after[k])
    .map((k) => `${LIMIT_LABELS[k].label} ${fmtMoney(c.before[k], cur, { decimals: false })} → ${fmtMoney(c.after[k], cur, { decimals: false })}`)
    .join(" · ");
}

function Score({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const good = invert ? value < 0.3 : value >= 0.6;
  return (
    <div className="rounded-lg bg-surface-2 px-2.5 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cx("tnum text-sm font-semibold", good ? "text-good-ink" : "text-warn-ink")}>{Math.round(value * 100)}%</div>
    </div>
  );
}

export function AssessmentScores({ ai }: { ai: NonNullable<NonNullable<Change["assessment"]>["ai"]> }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        <Score label="Genuine" value={ai.genuine} />
        <Score label="Urgent" value={ai.urgency} />
        <Score label="Proportionate" value={ai.proportionate} />
        <Score label="Scam risk" value={ai.scam_risk} invert />
      </div>
      {ai.signals.length > 0 && <div className="text-xs text-ink-2">Signals: {ai.signals.join(" · ")}</div>}
    </div>
  );
}

function ChangeLimits({ o, onClose }: { o: LimitsOverview; onClose: () => void }) {
  const toast = useToast();
  const cur = o.currency;
  const [vals, setVals] = useState<Record<LimitKey, string>>(
    () => Object.fromEntries(KEYS.map((k) => [k, String(o.limits[k] / 100)])) as Record<LimitKey, string>,
  );
  const [reason, setReason] = useState("medical");
  const [explanation, setExplanation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<EmergencyResult | null>(null);

  const next = Object.fromEntries(KEYS.map((k) => [k, Math.round(Number(vals[k] || 0) * 100)])) as Limits;
  const loosened = KEYS.filter((k) => next[k] > o.limits[k]);
  const tightened = KEYS.filter((k) => next[k] < o.limits[k]);
  const overMax = KEYS.filter((k) => next[k] > o.bounds[k].max);
  const needsEmergency = loosened.length > 0 && !o.quota.available;
  const emergencyLeft = o.emergency.perMonth - o.emergency.used;

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (needsEmergency) {
        const fd = new FormData();
        for (const k of loosened) fd.append(k, String(next[k] / 100));
        fd.append("reasonCode", reason);
        fd.append("explanation", explanation);
        if (file) fd.append("file", file);
        setResult(await api.upload<EmergencyResult>("/api/v1/limits/emergency", fd));
      } else {
        const body = Object.fromEntries(KEYS.filter((k) => next[k] !== o.limits[k]).map((k) => [k, next[k] / 100]));
        await api.put("/api/v1/limits", body);
        toast({ tone: "good", text: loosened.length ? "Limits updated — that was this month's raise." : "Limits lowered." });
        onClose();
      }
      refreshAll();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const tone = result.decision === "approved" ? "good" : result.decision === "denied" ? "bad" : "warn";
    return (
      <div className="space-y-4">
        <div
          className={cx(
            "flex items-start gap-3 rounded-xl px-4 py-3.5",
            tone === "good" ? "bg-good-soft text-good-ink" : tone === "bad" ? "bg-bad-soft text-bad-ink" : "bg-warn-soft text-warn-ink",
          )}
        >
          {result.decision === "approved" ? (
            <CircleCheck className="mt-0.5 size-5 shrink-0" />
          ) : result.decision === "denied" ? (
            <CircleX className="mt-0.5 size-5 shrink-0" />
          ) : (
            <Hourglass className="mt-0.5 size-5 shrink-0" />
          )}
          <div className="text-sm">
            <div className="font-semibold">
              {result.decision === "approved"
                ? "Emergency increase approved"
                : result.decision === "denied"
                  ? "Request declined"
                  : "Sent to a reviewer"}
            </div>
            {result.decision === "approved" && result.expiresAt && (
              <div className="mt-0.5 opacity-90">New limits are active until {fmtDate(result.expiresAt)}, then return to your previous limits.</div>
            )}
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 opacity-90">
              {result.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {/* The model writes before the policy decides, so its note is only shown when a person will follow up. */}
            {result.decision === "in_review" && result.message && <p className="mt-2 opacity-90">“{result.message}”</p>}
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        {KEYS.map((k) => (
          <Field
            key={k}
            label={LIMIT_LABELS[k].label}
            hint={`${LIMIT_LABELS[k].help} · max ${fmtMoney(o.bounds[k].max, cur, { decimals: false })}`}
            error={next[k] > o.bounds[k].max ? `Above your market's maximum of ${fmtMoney(o.bounds[k].max, cur, { decimals: false })}` : null}
          >
            <MoneyInput currency={cur} value={vals[k]} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value.replace(/[^\d.]/g, "") }))} />
          </Field>
        ))}
      </div>

      {tightened.length > 0 && loosened.length === 0 && (
        <Notice tone="good">Lowering a limit takes effect immediately and doesn&apos;t use your monthly change.</Notice>
      )}
      {loosened.length > 0 && o.quota.available && (
        <Notice tone="info" title="This uses your one raise for the month">
          After this, the next increase is available on {fmtDate(o.quota.resetsAt)}. Lowering limits is always allowed.
        </Notice>
      )}
      {needsEmergency && (
        <div className="space-y-4 rounded-xl border border-warn/40 bg-warn-soft/40 p-4">
          <div className="flex items-start gap-2.5 text-sm">
            <Siren className="mt-0.5 size-4 shrink-0 text-bad" />
            <div>
              <div className="font-semibold">You&apos;ve already raised a limit this month</div>
              <p className="mt-0.5 text-[13px] text-ink-2">
                The next regular change is on {fmtDate(o.quota.nextAvailableAt)}. If this is a genuine emergency, describe it below — an AI assessor
                checks that it&apos;s urgent, specific and in proportion, and a person reviews anything unclear. Approved increases last{" "}
                {o.emergency.increaseDays} days. {emergencyLeft} of {o.emergency.perMonth} requests left this month.
              </p>
            </div>
          </div>
          <Field label="What's happening?">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries(EMERGENCY_REASONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Explain the emergency" hint="Be specific: what happened, when the money is needed, and roughly how much.">
            <Textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              maxLength={2000}
              placeholder={`e.g. My mother was admitted to hospital last night and the surgery deposit of ${fmtMoney(o.bounds.singleWithdrawal.default * 1.6, cur, { decimals: false })} is due on Friday.`}
            />
          </Field>
          <Field label="Supporting document (optional)" hint="A bill, admission letter or quote helps. JPEG, PNG or WebP.">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
            />
          </Field>
        </div>
      )}
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={needsEmergency ? "danger" : "primary"}
          loading={busy}
          disabled={
            (!loosened.length && !tightened.length) ||
            overMax.length > 0 ||
            (needsEmergency && (explanation.trim().length < 20 || emergencyLeft <= 0))
          }
          onClick={save}
          icon={needsEmergency ? <ShieldAlert className="size-4" /> : undefined}
        >
          {needsEmergency ? (busy ? "Assessing…" : "Request emergency change") : "Save limits"}
        </Button>
      </div>
    </div>
  );
}

export function LimitsCard() {
  const { data: o } = useApi<LimitsOverview>("/api/v1/limits");
  const [open, setOpen] = useState(false);
  if (!o) return <Skeleton className="h-64" />;
  const cur = o.currency;
  return (
    <Card>
      <CardTitle
        sub="A commitment device: lower a limit any time; raise one once a month — or, in a genuine emergency, with an AI-checked exception."
        action={
          <Button size="sm" onClick={() => setOpen(true)} icon={<Gauge className="size-3.5" />}>
            Change limits
          </Button>
        }
      >
        <span className="inline-flex items-center gap-2">
          <Gauge className="size-4" /> Your limits
        </span>
      </CardTitle>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {KEYS.map((k) => (
          <div key={k} className="rounded-xl border border-line p-3.5">
            <div className="text-[13px] text-muted">{LIMIT_LABELS[k].label}</div>
            <div className="tnum mt-1 text-xl font-semibold">{fmtMoney(o.limits[k], cur, { decimals: false })}</div>
            <div className="mt-0.5 text-[11px] text-muted">
              {k === "dailyWithdrawal" ? `${fmtMoney(o.usage.dailyRemaining, cur, { decimals: false })} left today · ` : ""}max{" "}
              {fmtMoney(o.bounds[k].max, cur, { decimals: false })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
        <CalendarClock className="size-4 text-muted" />
        {o.quota.available ? (
          <Badge tone="good">Monthly raise available</Badge>
        ) : (
          <>
            <Badge tone="warn">Raised this month</Badge>
            <span className="text-ink-2">next raise on {fmtDate(o.quota.nextAvailableAt)}</span>
          </>
        )}
        <span className="text-muted">
          · emergency requests {o.emergency.perMonth - o.emergency.used}/{o.emergency.perMonth} left
        </span>
      </div>

      {o.active.map((a) => (
        <div key={a.id} className="mt-3">
          <Notice tone="info" title="Temporary emergency increase">
            {changedSummary(a, cur)} — until {a.expiresAt ? fmtDate(a.expiresAt) : "—"}, then back to your previous limits.
          </Notice>
        </div>
      ))}

      {o.history.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-medium text-muted">Recent changes</div>
          <ul className="divide-y divide-line">
            {o.history.slice(0, 5).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
                <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                <span className="font-medium">{KIND[c.kind]}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{changedSummary(c, cur)}</span>
                <span className="text-xs text-muted">{fmtDate(c.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Change your limits" wide>
        {open && <ChangeLimits o={o} onClose={() => setOpen(false)} />}
      </Modal>
    </Card>
  );
}
