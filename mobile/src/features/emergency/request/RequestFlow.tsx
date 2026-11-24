import { useCallback, useRef, useState } from "react";
import { router } from "expo-router";
import { ModalScreen, PracticeBadge, ScreenSkeleton, useHardwareBack } from "@/components/ui";
import { withMpin } from "@/features/mpin"; // mpin
import { api } from "@/lib/api/client";
import { ApiError, errorMessage, mayHaveGoneThrough } from "@/lib/api/errors";
import { useEmergency, useInvalidateMoney } from "@/lib/api/hooks";
import type { EmergencyOverview, EmergencyPreview } from "@/lib/api/types";
import { haptic } from "@/lib/haptics";
import { parseAmount } from "@/lib/money";
import { CalmError } from "../CalmError";
import { blockedReason, NOTE_MIN } from "../copy";
import { fmt } from "../format";
import { go } from "../routes";
import { AmountStep } from "./AmountStep";
import { Blocked, CoolingOff, Released, SafetyPause, Sending, Unconfirmed } from "./Outcomes";
import { ReasonStep } from "./ReasonStep";
import { ReviewStep } from "./ReviewStep";
import { usePlanPreview } from "./usePlanPreview";

/**
 * Emergency request: amount → reason → review (hold to confirm) → MPIN (every tier, the shared
 * MPIN sheet in features/mpin) → outcome.
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

type Step = "amount" | "reason" | "review" | "sending" | "outcome";

type Outcome =
  | { kind: "released"; id: string; receiptRequired: boolean }
  | { kind: "pause"; id: string; releaseAt: number; startedAt: number; receiptRequired: boolean }
  | { kind: "cooling"; id: string; releaseAt: number }
  | { kind: "blocked"; reason: string }
  /** No answer came: it may have gone through, so it's never offered again. */
  | { kind: "unconfirmed" };

const wantsNote = (e: unknown) => e instanceof ApiError && e.status === 400 && /description|note/i.test(e.message);

function Flow({ o }: { o: EmergencyOverview }) {
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

  const [busy, setBusy] = useState(false);
  // `busy` is state, so a handler from an older render can still see false. This can't be stale.
  const inFlight = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const noteRequired = !!plan?.needsNote || forceNote;

  const back = useCallback(() => {
    if (busy) return;
    setSubmitError(null);
    setStep((s) => (s === "reason" ? "amount" : s === "review" ? "reason" : s));
  }, [busy]);

  // Android back steps back through the flow instead of closing it mid-way. While sending, it
  // closes like the X does (the request carries on).
  useHardwareBack(step === "amount" || step === "outcome" || step === "sending" ? null : back);

  /** A safety limit stopped the request: say which, from the plan that explains it. */
  const blockedOutcome = (p: EmergencyPreview) => {
    haptic("warning");
    setOutcome({ kind: "blocked", reason: blockedReason(p.checks, o, p) });
    setStep("outcome");
  };

  const submit = async () => {
    if (!plan || !reason || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      // mpin: every tier needs the MPIN. The sheet stays up while it's checked; closing it sends nothing.
      const r = await withMpin(`Get ${fmt(plan.amount, o.currency)} in emergency money`, (pin) =>
        api.emergencyWithdraw({ amount: plan.amount / 100, reasonCode: reason, note: note.trim() || undefined, attest: true, pin }),
      );
      if (!r) return;
      void invalidate();
      const receiptRequired = r.receiptRequired ?? true;
      // The server re-plans at submit time; show what actually moved, not the earlier preview.
      if (r.status === "blocked") {
        blockedOutcome(r.plan);
        return;
      }
      setPlan(r.plan);
      // The hold committed nothing (the MPIN followed it); the money commits here.
      haptic("irreversible.commit");
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
      if (mayHaveGoneThrough(e)) {
        // The money may be on its way: show that (the refresh above updates the emergency screen), never Hold to get again.
        haptic("warning");
        setOutcome({ kind: "unconfirmed" });
        setStep("outcome");
      } else if (e instanceof ApiError && e.status === 422) {
        blockedOutcome(plan);
      } else if (wantsNote(e)) {
        haptic("error");
        setForceNote(true);
        setNotice(`Add a short note about what happened — at least ${NOTE_MIN} characters.`);
        setStep("reason");
      } else {
        haptic("error");
        setSubmitError(errorMessage(e));
        setStep("review");
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
      case "unconfirmed":
        return <Unconfirmed />;
    }
  }

  if (step === "sending") return <Sending />;

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
        onConfirm={() => void submit()}
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
