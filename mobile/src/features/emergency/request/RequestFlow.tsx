import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { router } from "expo-router";
import { ModalScreen, PracticeBadge, ScreenSkeleton } from "@/components/ui";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { useConnection, useEmergency, useInvalidateMoney } from "@/lib/api/hooks";
import type { EmergencyOverview, EmergencyPreview, Guardrail } from "@/lib/api/types";
import { haptic } from "@/lib/haptics";
import { parseAmount } from "@/lib/money";
import { CalmError } from "../CalmError";
import { blockedReason, NOTE_MIN } from "../copy";
import { go } from "../routes";
import { AmountStep } from "./AmountStep";
import { Blocked, CoolingOff, Released, SafetyPause, Sending } from "./Outcomes";
import { PinStep } from "./PinStep";
import { ReasonStep } from "./ReasonStep";
import { ReviewStep } from "./ReviewStep";
import { usePlanPreview } from "./usePlanPreview";

/**
 * Emergency request: amount → reason → review (hold to confirm) → PIN (Tier 2 only) → outcome.
 * Calm throughout: no alarms, no per-second ticking except the last five seconds of a pause.
 */
export function RequestFlow() {
  const q = useEmergency();
  if (q.data) return <Flow o={q.data} />;
  return (
    <ModalScreen title="Emergency money" onClose={go.close} headerRight={<PracticeBadge compact />}>
      {q.isError ? <CalmError error={q.error} onRetry={() => void q.refetch()} /> : <ScreenSkeleton />}
    </ModalScreen>
  );
}

type Step = "amount" | "reason" | "review" | "pin" | "sending" | "outcome";

type Outcome =
  | { kind: "released"; id: string; receiptRequired: boolean }
  | { kind: "pause"; id: string; releaseAt: number; startedAt: number; receiptRequired: boolean }
  | { kind: "cooling"; id: string; releaseAt: number }
  | { kind: "blocked"; reason: string };

const isWrongPin = (e: unknown) => e instanceof ApiError && (e.status === 403 || /\bpin\b/i.test(e.message));
const wantsNote = (e: unknown) => e instanceof ApiError && e.status === 400 && /description|note/i.test(e.message);

function Flow({ o }: { o: EmergencyOverview }) {
  const { mode } = useConnection();
  const invalidate = useInvalidateMoney();

  const [step, setStep] = useState<Step>("amount");
  const [text, setText] = useState("");
  const amount = parseAmount(text);
  const preview = usePlanPreview(amount);
  const [plan, setPlan] = useState<EmergencyPreview | null>(null);

  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [forceNote, setForceNote] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [attest, setAttest] = useState(false);

  const [pinLength, setPinLength] = useState(4);
  const [pinErrors, setPinErrors] = useState(0);
  const [pinResets, setPinResets] = useState(0);
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  // `busy` is state, so a handler from an older render can still see false. This can't be stale.
  const inFlight = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const noteRequired = !!plan?.needsNote || forceNote;

  const back = useCallback(() => {
    if (busy) return;
    setSubmitError(null);
    setStep((s) => (s === "reason" ? "amount" : s === "review" ? "reason" : s === "pin" ? "review" : s));
  }, [busy]);

  // Android back steps back through the flow instead of closing it mid-way. While sending, it
  // closes like the X does (the request carries on).
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step === "amount" || step === "outcome" || step === "sending") return false;
      back();
      return true;
    });
    return () => sub.remove();
  }, [step, back]);

  /** A live blocked request comes back as HTTP 422 without its body: re-check to say why. */
  const blockedOutcome = async (p: EmergencyPreview, checks?: Guardrail[]) => {
    let fresh: EmergencyPreview = p;
    if (!checks) {
      try {
        fresh = await api.emergencyPreview(p.amount / 100);
      } catch {
        // keep the plan we had
      }
    }
    haptic("warning");
    setOutcome({ kind: "blocked", reason: blockedReason(checks ?? fresh.checks, o, fresh) });
    setStep("outcome");
  };

  const submit = async (pin?: string) => {
    if (!plan || !reason || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setSubmitError(null);
    setPinMessage(null);
    if (!plan.needsPin) setStep("sending");
    try {
      const r = await api.emergencyWithdraw({ amount: plan.amount / 100, reasonCode: reason, note: note.trim() || undefined, attest: true, pin });
      void invalidate();
      const receiptRequired = r.receiptRequired ?? true;
      // The server re-plans at submit time; show what actually moved, not the earlier preview.
      const done = Array.isArray(r.plan) ? { ...plan, items: r.plan } : r.plan;
      if (r.status === "blocked") {
        await blockedOutcome(done, done.checks);
        return;
      }
      setPlan(done);
      // With a PIN step the hold committed nothing; the money commits here.
      if (pin) haptic("irreversible.commit");
      if (r.status === "processing") {
        // Count down to the server's release time, unless the phone's clock disagrees with it.
        const startedAt = Date.now();
        const local = startedAt + o.rules.tier2HoldSeconds * 1000;
        const releaseAt = r.releaseAt && Math.abs(r.releaseAt - local) < 30_000 ? r.releaseAt : local;
        setOutcome({ kind: "pause", id: r.id, releaseAt, startedAt, receiptRequired });
      } else if (r.status === "cooling_off") {
        setOutcome({ kind: "cooling", id: r.id, releaseAt: r.releaseAt ?? Date.now() + o.rules.cooloffHours * 3_600_000 });
      } else {
        setOutcome({ kind: "released", id: r.id, receiptRequired });
      }
      setStep("outcome");
    } catch (e) {
      void invalidate();
      if (isWrongPin(e)) {
        haptic("pin.wrong");
        setPinErrors((n) => n + 1);
        setPinMessage("That PIN isn't right.");
        setStep("pin");
      } else if (e instanceof ApiError && e.status === 422) {
        await blockedOutcome(plan);
      } else if (wantsNote(e)) {
        haptic("error");
        setForceNote(true);
        setNotice(`Add a short note about what happened — at least ${NOTE_MIN} characters.`);
        setStep("reason");
      } else {
        haptic("error");
        const msg = errorMessage(e);
        if (plan.needsPin) {
          setPinErrors(0);
          setPinResets((n) => n + 1);
          setPinMessage(`That didn't go through. ${msg}`);
          setStep("pin");
        } else {
          setSubmitError(msg);
          setStep("review");
        }
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const onReleased = useCallback(() => {
    setOutcome((cur) => (cur?.kind === "pause" ? { kind: "released", id: cur.id, receiptRequired: cur.receiptRequired } : cur));
    void invalidate();
  }, [invalidate]);

  if (step === "outcome" && outcome && plan) {
    switch (outcome.kind) {
      case "released":
        return <Released o={o} plan={plan} receiptRequired={outcome.receiptRequired} onAddReceipt={() => router.setParams({ receipt: outcome.id })} />;
      case "pause":
        return <SafetyPause o={o} plan={plan} releaseAt={outcome.releaseAt} startedAt={outcome.startedAt} onReleased={onReleased} />;
      case "cooling":
        return <CoolingOff o={o} plan={plan} releaseAt={outcome.releaseAt} />;
      case "blocked":
        return <Blocked reason={outcome.reason} />;
    }
  }

  if (step === "sending") return <Sending />;

  if (step === "pin" && plan)
    return (
      <PinStep
        o={o}
        plan={plan}
        demo={mode === "demo"}
        length={pinLength}
        onLength={(n) => {
          setPinLength(n);
          setPinErrors(0);
          setPinMessage(null);
        }}
        errors={pinErrors}
        resets={pinResets}
        message={pinMessage}
        busy={busy}
        onBack={back}
        onPin={(pin) => void submit(pin)}
      />
    );

  if (step === "review" && plan && reason)
    return (
      <ReviewStep
        o={o}
        plan={plan}
        reasonCode={reason}
        note={note}
        attest={attest}
        onAttest={setAttest}
        error={submitError}
        onBack={back}
        onConfirm={() => {
          if (plan.needsPin) {
            setPinMessage(null);
            setStep("pin");
          } else void submit();
        }}
      />
    );

  if (step === "reason" && plan)
    return (
      <ReasonStep
        reason={reason}
        onReason={setReason}
        note={note}
        onNote={(t) => {
          setNote(t);
          if (notice && t.trim().length >= NOTE_MIN) setNotice(null);
        }}
        noteRequired={noteRequired}
        notice={notice}
        onBack={back}
        onContinue={() => setStep("review")}
      />
    );

  return (
    <AmountStep
      o={o}
      text={text}
      onText={setText}
      preview={preview}
      onContinue={() => {
        if (!preview.current || preview.current.blocked) return;
        // A different amount means a different plan: confirm it again.
        if (plan?.amount !== preview.current.amount) setAttest(false);
        setPlan(preview.current);
        setStep("reason");
      }}
    />
  );
}
