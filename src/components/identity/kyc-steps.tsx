"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CircleCheck, CircleX, ExternalLink, Hourglass, IdCard, Landmark, ShieldCheck } from "lucide-react";
import { api, useNow } from "@/lib/client";
import { Badge, Button, Card, CardTitle, ErrorNote, Field, Input, Notice, type Tone } from "@/components/ui";
import { checkIdNumber } from "./types";

/**
 * kyc-checks: the steps flow on /verify (server KYC_FLOW=steps): PAN, then Aadhaar through DigiLocker, then a
 * bank account by a ₹1 reverse penny drop. The server decides everything; this only calls the step routes.
 */

export type StepKey = "pan" | "aadhaar" | "bank";
export type StepStatus = "todo" | "done" | "review" | "failed";
export type KycSteps = Record<StepKey, { status: StepStatus; last4: string | null }>;

const STEP_KEYS: StepKey[] = ["pan", "aadhaar", "bank"];
const STATUSES: StepStatus[] = ["todo", "done", "review", "failed"];
const PENDING_DL = "vw.kyc.digilocker";

/** `steps` from GET /api/v1/kyc, or null in the photo flow (no `flow: "steps"`). */
export function readKycSteps(raw: unknown): KycSteps | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!o || o.flow !== "steps" || !o.steps || typeof o.steps !== "object") return null;
  const s = o.steps as Record<string, unknown>;
  const out = {} as KycSteps;
  for (const k of STEP_KEYS) {
    const v = (s[k] && typeof s[k] === "object" ? s[k] : {}) as Record<string, unknown>;
    out[k] = {
      status: STATUSES.includes(v.status as StepStatus) ? (v.status as StepStatus) : "todo",
      last4: typeof v.last4 === "string" && v.last4 ? v.last4 : null,
    };
  }
  return out;
}

const BADGE: Record<StepStatus, { label: string; tone: Tone }> = {
  todo: { label: "To do", tone: "neutral" },
  done: { label: "Done", tone: "good" },
  review: { label: "With a person", tone: "warn" },
  failed: { label: "Try again", tone: "bad" },
};

function StepIcon({ status, fallback }: { status: StepStatus; fallback: ReactNode }) {
  if (status === "done") return <CircleCheck className="size-5 text-good" aria-hidden />;
  if (status === "review") return <Hourglass className="size-5 text-warn" aria-hidden />;
  if (status === "failed") return <CircleX className="size-5 text-bad" aria-hidden />;
  return <span className="text-muted">{fallback}</span>;
}

function Step({ n, title, status, last4, children }: { n: number; title: string; status: StepStatus; last4: string | null; children?: ReactNode }) {
  const icons: Record<number, ReactNode> = { 1: <IdCard className="size-5" />, 2: <ShieldCheck className="size-5" />, 3: <Landmark className="size-5" /> };
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <StepIcon status={status} fallback={icons[n]} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold">
              {n}. {title}
            </h3>
            <Badge tone={BADGE[status].tone}>{BADGE[status].label}</Badge>
            {last4 && <span className="text-xs text-muted">ending {last4}</span>}
          </div>
          {children && <div className="mt-2.5 space-y-2.5">{children}</div>}
        </div>
      </div>
    </li>
  );
}

const ARRIVAL_KEYS = ["id", "success", "scope", "errCode", "errMessage"];

const DIGILOCKER_FAILED = "DigiLocker didn't finish. Try again.";

/**
 * Fixed sentences for the error codes DigiLocker (through the provider) sends back in the return link.
 * The link's `errMessage` is never shown: anyone can craft a /verify link, so its text can't be trusted
 * on a page about identity. An unknown or missing code gets the generic sentence.
 */
const DIGILOCKER_ERRORS: Record<string, string> = {
  access_denied: "You didn't allow sharing your Aadhaar in DigiLocker. Try again and choose Allow.",
  consent_denied: "You didn't allow sharing your Aadhaar in DigiLocker. Try again and choose Allow.",
  user_cancelled: "You left DigiLocker before it finished. Try again when you're ready.",
  session_expired: "The DigiLocker session timed out. Try again.",
  expired: "The DigiLocker session timed out. Try again.",
  aadhaar_not_found: "We couldn't find an Aadhaar in your DigiLocker. Add it in the DigiLocker app, then try again.",
};

/** The sentence to show for DigiLocker's `errCode` (case and spacing ignored); never the link's own text. */
export function digilockerErrorText(code: string | null | undefined): string {
  const key = (code ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return Object.hasOwn(DIGILOCKER_ERRORS, key) ? DIGILOCKER_ERRORS[key] : DIGILOCKER_FAILED;
}

/** DigiLocker sends people back to /verify?success=True&id=<requestId>&scope=… (or success=False&errCode=…). */
function readArrival(): { id: string; ok: boolean; message: string | null } | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const id = q.get("id");
  const success = q.get("success");
  if (!id || success === null) return null;
  const ok = success.toLowerCase() === "true";
  return { id, ok, message: ok ? null : digilockerErrorText(q.get("errCode")) };
}

/** The DigiLocker request this tab started, so "I've finished" works if the return link didn't. */
function readPending(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(PENDING_DL);
  } catch {
    return null;
  }
}

function writePending(id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(PENDING_DL, id);
    else window.sessionStorage.removeItem(PENDING_DL);
  } catch {
    // Storage blocked: the return link still finishes the step.
  }
}

type BankLink = { upiLink: string; requestId: string; expiresAt: number };

/**
 * The three steps. `locked` shows them without actions (a person is checking). `onChanged` reloads the
 * KYC view and /me after any step answers.
 */
export function KycStepsCard({ steps, locked, onChanged }: { steps: KycSteps; locked?: boolean; onChanged: () => void | Promise<void> }) {
  // This card only renders after the KYC view loads in the browser, so reading the URL and storage up front is safe.
  const [arrival] = useState(readArrival);
  const [busy, setBusy] = useState<StepKey | null>(null);
  const [errors, setErrors] = useState<Partial<Record<StepKey, string>>>(() =>
    arrival && !arrival.ok ? { aadhaar: arrival.message || DIGILOCKER_FAILED } : {},
  );
  const [pan, setPan] = useState("");
  const [panError, setPanError] = useState<string | null>(null);
  const [bank, setBank] = useState<BankLink | null>(null);
  const [dlPending, setDlPending] = useState<string | null>(readPending);
  const now = useNow(bank ? 15_000 : 0);
  const handledReturn = useRef(false);

  const run = async <T,>(step: StepKey, fn: () => Promise<T>): Promise<T | null> => {
    setErrors((e) => ({ ...e, [step]: undefined }));
    setBusy(step);
    try {
      return await fn();
    } catch (e) {
      setErrors((x) => ({ ...x, [step]: (e as Error).message }));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const finishDigiLocker = async (requestId: string) => {
    const done = await run("aadhaar", () => api.post("/api/v1/kyc/digilocker/finish", { requestId }));
    if (done) {
      writePending(null);
      setDlPending(null);
      await onChanged();
    }
  };

  // Coming back from DigiLocker: drop its query from the address bar, then finish the step once.
  useEffect(() => {
    if (!arrival || handledReturn.current) return;
    handledReturn.current = true;
    const clean = new URL(window.location.href);
    for (const k of ARRIVAL_KEYS) clean.searchParams.delete(k);
    window.history.replaceState(window.history.state, "", clean.toString());
    if (arrival.ok) void finishDigiLocker(arrival.id);
    // Runs once on arrival; finishDigiLocker is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival]);

  const submitPan = async (e: FormEvent) => {
    e.preventDefault();
    const problem = pan.trim() ? checkIdNumber("pan", pan) : "Enter your PAN.";
    setPanError(problem);
    if (problem) return;
    const ok = await run("pan", () => api.post("/api/v1/kyc/pan", { pan }));
    if (ok) {
      setPan("");
      await onChanged();
    }
  };

  const startDigiLocker = async () => {
    const r = await run("aadhaar", () => api.post<{ url: string; requestId: string }>("/api/v1/kyc/digilocker/start"));
    if (!r) return;
    writePending(r.requestId);
    window.location.assign(r.url);
  };

  const startBank = async () => {
    const r = await run("bank", () => api.post<BankLink>("/api/v1/kyc/bank/start"));
    if (r) setBank(r);
  };

  const finishBank = async () => {
    if (!bank) return;
    const done = await run("bank", () => api.post("/api/v1/kyc/bank/finish", { requestId: bank.requestId }));
    if (done) {
      setBank(null);
      await onChanged();
    }
  };

  const open = (k: StepKey) => !locked && steps[k].status !== "done";
  const ready = (k: StepKey) => steps[k].status === "done" || steps[k].status === "review";
  const bankExpired = bank ? bank.expiresAt <= now : false;

  return (
    <Card>
      <CardTitle sub="Three quick checks. Most people finish in two minutes.">Verify it&apos;s you</CardTitle>
      <ol className="divide-y divide-line">
        <Step n={1} title="Your PAN" status={steps.pan.status} last4={steps.pan.last4}>
          {open("pan") && (
            <form onSubmit={submitPan} className="space-y-2.5" noValidate>
              <Field label={steps.pan.status === "todo" ? "PAN" : "Try a different PAN"} error={panError} hint="10 characters, like ABCDE1234F. We check the name on it.">
                <Input
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={12}
                  placeholder="ABCDE1234F"
                />
              </Field>
              <Button type="submit" loading={busy === "pan"} disabled={!!busy}>
                Check PAN
              </Button>
            </form>
          )}
          {errors.pan && <ErrorNote>{errors.pan}</ErrorNote>}
        </Step>

        <Step n={2} title="Aadhaar with DigiLocker" status={steps.aadhaar.status} last4={steps.aadhaar.last4}>
          {open("aadhaar") &&
            (ready("pan") ? (
              <>
                <p className="text-[13px] text-ink-2">
                  Sign in to DigiLocker and allow sharing your Aadhaar. We keep only the name, year of birth and last 4 digits.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={startDigiLocker} loading={busy === "aadhaar"} disabled={!!busy} icon={<ExternalLink className="size-4" />}>
                    Continue with DigiLocker
                  </Button>
                  {dlPending && (
                    <Button variant="secondary" onClick={() => finishDigiLocker(dlPending)} disabled={!!busy}>
                      I&apos;ve finished in DigiLocker
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-[13px] text-muted">After your PAN.</p>
            ))}
          {errors.aadhaar && <ErrorNote>{errors.aadhaar}</ErrorNote>}
        </Step>

        <Step n={3} title="Your bank account" status={steps.bank.status} last4={steps.bank.last4}>
          {open("bank") &&
            (ready("aadhaar") ? (
              bank && !bankExpired ? (
                <>
                  <p className="text-[13px] text-ink-2">
                    Pay ₹1 from your bank account with any UPI app. We read the account from the payment, and the ₹1 comes back to you within 2 days.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={bank.upiLink}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
                    >
                      Pay ₹1 with UPI
                    </a>
                    <Button variant="secondary" onClick={finishBank} loading={busy === "bank"} disabled={!!busy}>
                      I&apos;ve paid
                    </Button>
                  </div>
                  <p className="text-xs text-muted">The link works for {Math.max(1, Math.round((bank.expiresAt - now) / 60_000))} more minutes. On a computer, open it on your phone.</p>
                </>
              ) : (
                <>
                  {bankExpired && <Notice tone="warn">That payment link expired. Get a new one.</Notice>}
                  <Button onClick={startBank} loading={busy === "bank"} disabled={!!busy}>
                    Get a ₹1 payment link
                  </Button>
                </>
              )
            ) : (
              <p className="text-[13px] text-muted">After DigiLocker.</p>
            ))}
          {errors.bank && <ErrorNote>{errors.bank}</ErrorNote>}
        </Step>
      </ol>
    </Card>
  );
}

/** What the steps flow keeps, for the "What we keep" card. */
export const STEPS_KEEPS = [
  "We never store your full PAN, Aadhaar or bank account number. We keep the last 4 characters.",
  "From DigiLocker we keep the name and year of birth on your Aadhaar. Never the document.",
  "We check each name matches the name on your account. If one doesn't, a person takes a look.",
];
