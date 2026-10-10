import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useCameraPermissions } from "expo-camera";
import { ModalScreen, ScreenSkeleton } from "@/components/ui";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useInvalidateMoney, useVault } from "@/lib/api/hooks";
import type { Sample, Vault } from "@/lib/api/types";
import { haptic } from "@/lib/haptics";
import { parseAmount } from "@/lib/money";
import { withSystemUi } from "@/lib/session";
import { CalmError } from "../components/CalmError";
import { useHardwareBack, useProofRules } from "../hooks";
import { AmountStep } from "./AmountStep";
import { CameraOffStep } from "./CameraOffStep";
import { CameraPrimerStep } from "./CameraPrimerStep";
import { CameraStep } from "./CameraStep";
import { ChooseVaultStep } from "./ChooseVaultStep";
import { cameraDoc, pickFromLibrary, sampleDoc } from "./documents";
import { PayeeStep, savedPayees } from "./PayeeStep";
import { ProofOptionsStep } from "./ProofOptionsStep";
import { ResumeStep, resumeTarget } from "./ResumeStep";
import { ReviewStep } from "./ReviewStep";
import { SamplesStep } from "./SamplesStep";
import type { CameraOffReason, FlowVault, PickedDoc, Step } from "./types";
import { VerifyingStep } from "./VerifyingStep";

function flowVault(v: Vault, currency?: string): FlowVault {
  return {
    id: v.id,
    name: v.name,
    category: v.category,
    proofCategory: v.category === "custom" && v.template && v.template !== "custom" ? v.template : v.category,
    available: v.available,
    held: v.held,
    currency: v.currency ?? currency ?? "INR",
  };
}

/** The withdrawal this flow is attached to (created here, or resumed from the vault). */
interface Attached {
  id: string;
  createdHere: boolean;
  hasProof: boolean;
}

/**
 * Withdraw with proof — a full-screen modal state machine. Steps live on a stack so Back always
 * returns to where you were; Close appears on the first step and on Verifying, where it means
 * "continue in background", never cancel.
 */
export function WithdrawFlow({ vaultParam, withdrawalParam }: { vaultParam: string; withdrawalParam?: string }) {
  const invalidate = useInvalidateMoney();
  const rules = useProofRules();
  const [vaultId, setVaultId] = useState<string | null>(vaultParam === "choose" ? null : vaultParam);
  const vaultQ = useVault(vaultId ?? undefined);

  const [stack, setStack] = useState<Step[]>(() => [withdrawalParam ? "resume" : vaultParam === "choose" ? "choose" : "amount"]);
  const step = stack[stack.length - 1];
  const go = useCallback((s: Step) => setStack((st) => [...st, s]), []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const swap = useCallback((s: Step) => setStack((st) => [...st.slice(0, -1), s]), []);
  const reset = useCallback((s: Step) => setStack([s]), []);

  const [amountTextValue, setAmountText] = useState("");
  const [fixedAmount, setFixedAmount] = useState<number | null>(null);
  const [payee, setPayee] = useState("");
  const [note, setNote] = useState("");
  const [attached, setAttached] = useState<Attached | null>(null);
  const [doc, setDoc] = useState<PickedDoc | null>(null);
  const [proofId, setProofId] = useState<string | null>(null);
  const [lastDecline, setLastDecline] = useState<string | null>(null);
  const [cameraOff, setCameraOff] = useState<CameraOffReason>("unavailable");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [cameraPerm, requestCameraPerm, getCameraPerm] = useCameraPermissions({ get: Platform.OS !== "web" });

  const detail = vaultQ.data;
  const vault = useMemo(() => (detail ? flowVault(detail.vault, detail.currency) : null), [detail]);
  const amount = fixedAmount ?? parseAmount(amountTextValue) ?? 0;
  const saved = useMemo(() => savedPayees(detail?.withdrawals), [detail]);

  /* ---------- leaving ---------- */

  const finish = useCallback(() => {
    // A request created here whose bill never arrived (the upload failed) isn't left holding money.
    const orphan = attached?.createdHere && !attached.hasProof ? attached.id : null;
    const settle = orphan ? api.cancelWithdrawal(orphan).catch(() => undefined) : Promise.resolve();
    void settle.then(() => invalidate());
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [attached, invalidate]);

  const nav = { onClose: finish, onBack: stack.length > 1 ? back : undefined };

  // If the bill never arrived for a request created here and the details change, start afresh.
  const dropOrphan = useCallback(() => {
    if (!attached?.createdHere || attached.hasProof) return;
    void api
      .cancelWithdrawal(attached.id)
      .catch(() => undefined)
      .then(() => invalidate());
    setAttached(null);
  }, [attached, invalidate]);
  const editAmount = useCallback(
    (v: string) => {
      dropOrphan();
      setAmountText(v);
    },
    [dropOrphan],
  );
  const editPayee = useCallback(
    (v: string) => {
      dropOrphan();
      setPayee(v);
    },
    [dropOrphan],
  );
  const editNote = useCallback(
    (v: string) => {
      dropOrphan();
      setNote(v);
    },
    [dropOrphan],
  );

  useHardwareBack(() => {
    if (step === "verifying" || stack.length <= 1) finish();
    else back();
    return true;
  });

  /* ---------- resuming a request from the vault ---------- */

  const resumeRow = step === "resume" && detail ? detail.withdrawals.find((w) => w.id === withdrawalParam) : undefined;
  useEffect(() => {
    const target = resumeRow ? resumeTarget(resumeRow) : null;
    if (!resumeRow || !target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds the flow once from the withdrawal loaded from the server
    setFixedAmount(resumeRow.amount);
    setPayee(resumeRow.payee ?? "");
    setNote(resumeRow.note ?? "");
    if (target === "verifying" && resumeRow.proof_id) {
      setAttached({ id: resumeRow.id, createdHere: false, hasProof: true });
      setProofId(resumeRow.proof_id);
      reset("verifying");
      return;
    }
    if (resumeRow.status === "denied") {
      // A declined request can't take another bill, so the next one goes with a fresh request
      // for the same amount and payee (the declined one no longer holds any money).
      setAttached(null);
      setLastDecline("Send a different bill, or ask a person to check the last one.");
    } else {
      setAttached({ id: resumeRow.id, createdHere: false, hasProof: false });
    }
    reset("proof");
  }, [resumeRow, reset]);

  /* ---------- getting a document ---------- */

  const choosePhoto = useCallback(async () => {
    setPickError(null);
    setSubmitError(null);
    try {
      const picked = await pickFromLibrary();
      if (!picked) return;
      setDoc(picked);
      if (step !== "review") go("review");
    } catch (e) {
      setPickError(errorMessage(e, "Your photos didn't open. Try again."));
    }
  }, [go, step]);

  const startScan = useCallback(async () => {
    if (Platform.OS === "web") {
      setCameraOff("web");
      go("cameraOff");
      return;
    }
    const p = (await getCameraPerm().catch(() => null)) ?? cameraPerm;
    if (p?.granted) go("camera");
    else if (!p || p.canAskAgain) go("primer");
    else {
      setCameraOff("denied");
      go("cameraOff");
    }
  }, [cameraPerm, getCameraPerm, go]);

  const askCamera = useCallback(async () => {
    setBusy(true);
    try {
      // The permission prompt is system UI: the app lock waits for it rather than closing the flow.
      const p = await withSystemUi(requestCameraPerm).catch(() => null);
      if (p?.granted) swap("camera");
      else {
        setCameraOff(p ? "denied" : "unavailable");
        swap("cameraOff");
      }
    } finally {
      setBusy(false);
    }
  }, [requestCameraPerm, swap]);

  const recheckCamera = useCallback(() => {
    void getCameraPerm()
      .then((p) => {
        if (p.granted) swap("camera");
      })
      .catch(() => undefined);
  }, [getCameraPerm, swap]);

  const pickSample = useCallback(
    (s: Sample) => {
      setSubmitError(null);
      setDoc(sampleDoc(s));
      go("review");
    },
    [go],
  );

  /* ---------- sending ---------- */

  const submit = useCallback(async () => {
    if (!vault || !doc || busy) return;
    setBusy(true);
    setSubmitError(null);
    try {
      let wid = attached?.id ?? null;
      if (!wid) {
        const w = await api.withdraw(vault.id, amount / 100, payee.trim(), note.trim() || undefined);
        wid = w.id;
        setAttached({ id: w.id, createdHere: true, hasProof: false });
      }
      const p = await api.uploadProof(vault.id, wid, doc.file);
      setAttached({ id: wid, createdHere: attached?.createdHere ?? !attached, hasProof: true });
      setProofId(p.id);
      setLastDecline(null);
      reset("verifying");
    } catch (e) {
      haptic("error");
      setSubmitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [vault, doc, busy, attached, amount, payee, note, reset]);

  const onResult = useCallback(() => void invalidate(), [invalidate]);

  const tryAnother = useCallback(
    (reason: string) => {
      // The declined request is closed (the server won't take a second bill on it), so the
      // next bill goes with a fresh request for the same amount, payee and note.
      setAttached(null);
      setLastDecline(reason);
      setDoc(null);
      setProofId(null);
      setSubmitError(null);
      reset("proof");
    },
    [reset],
  );

  /* ---------- render ---------- */

  if (step === "choose")
    return (
      <ChooseVaultStep
        nav={nav}
        onPick={(v) => {
          if (v.id !== vaultId) setAmountText("");
          setVaultId(v.id);
          go("amount");
        }}
      />
    );

  if (!vault)
    return (
      <ModalScreen title="Withdraw" onClose={finish} back={nav.onBack}>
        {vaultQ.isError ? <CalmError error={vaultQ.error} onRetry={() => void vaultQ.refetch()} /> : <ScreenSkeleton />}
      </ModalScreen>
    );

  switch (step) {
    case "resume":
      return <ResumeStep nav={nav} vault={vault} row={detail?.withdrawals.find((w) => w.id === withdrawalParam) ?? null} />;
    case "amount":
      return <AmountStep nav={nav} vault={vault} value={amountTextValue} onChange={editAmount} onContinue={() => go("payee")} />;
    case "payee":
      return (
        <PayeeStep
          nav={nav}
          vault={vault}
          amount={amount}
          saved={saved}
          payee={payee}
          note={note}
          onPayee={editPayee}
          onNote={editNote}
          onContinue={() => go("proof")}
        />
      );
    case "proof":
      return (
        <ProofOptionsStep
          nav={nav}
          vault={vault}
          amount={amount}
          payee={payee}
          maxDocAgeDays={rules.maxDocAgeDays}
          lastDecline={lastDecline}
          pickError={pickError}
          busy={busy}
          onScan={() => void startScan()}
          onChoose={() => void choosePhoto()}
          onSamples={() => go("samples")}
        />
      );
    case "samples":
      return <SamplesStep nav={nav} vault={vault} onPick={pickSample} />;
    case "primer":
      return <CameraPrimerStep nav={nav} busy={busy} onAllow={() => void askCamera()} onChoose={() => void choosePhoto()} />;
    case "cameraOff":
      return (
        <CameraOffStep
          nav={nav}
          reason={cameraOff}
          canAskAgain={!!cameraPerm?.canAskAgain && !cameraPerm.granted}
          busy={busy}
          onAskAgain={() => void askCamera()}
          onRecheck={recheckCamera}
          onChoose={() => void choosePhoto()}
          onSamples={() => go("samples")}
        />
      );
    case "camera":
      return (
        <CameraStep
          onClose={back}
          onCaptured={(photo) => {
            setSubmitError(null);
            setDoc(cameraDoc(photo));
            go("review");
          }}
          onPhotos={() => void choosePhoto()}
          onUnavailable={() => {
            setCameraOff("unavailable");
            swap("cameraOff");
          }}
        />
      );
    case "review":
      if (!doc) return null;
      return (
        <ReviewStep
          key={doc.file.uri}
          nav={nav}
          doc={doc}
          vault={vault}
          amount={amount}
          maxDocAgeDays={rules.maxDocAgeDays}
          submitting={busy}
          error={submitError}
          onUse={() => void submit()}
          onSecondary={doc.source === "library" ? () => void choosePhoto() : back}
        />
      );
    case "verifying":
      if (!proofId) return null;
      return (
        <VerifyingStep
          key={proofId}
          proofId={proofId}
          vault={vault}
          amount={amount}
          payee={payee}
          onClose={finish}
          onResult={onResult}
          onTryAnother={tryAnother}
        />
      );
    default:
      return null;
  }
}
