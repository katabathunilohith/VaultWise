import { useCallback, useEffect, useMemo, useState } from "react";
import { ModalScreen, ScreenSkeleton, useHardwareBack } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { DEFAULT_CURRENCY, useRules, useVault } from "@/lib/api/hooks";
import type { Sample, Vault } from "@/lib/api/types";
import { rulesCategory } from "@/lib/categories";
import { useCameraAccess } from "@/lib/media/camera";
import { parseAmount } from "@/lib/money";
import { CalmError } from "../components/CalmError";
import { AmountStep } from "./AmountStep";
import { CameraOffStep } from "./CameraOffStep";
import { CameraPrimerStep } from "./CameraPrimerStep";
import { CameraStep } from "./CameraStep";
import { ChooseVaultStep } from "./ChooseVaultStep";
import { cameraDoc, pickFromLibrary, sampleDoc } from "./documents";
import { PayeeStep, savedPayees } from "./PayeeStep";
import { ProofOptionsStep } from "./ProofOptionsStep";
import { ResumeStep } from "./ResumeStep";
import { ReviewStep } from "./ReviewStep";
import { SamplesStep } from "./SamplesStep";
import type { CameraOffReason, FlowVault, PickedDoc, Step } from "./types";
import { useStepStack } from "./useStepStack";
import { useWithdrawalSubmission } from "./useWithdrawalSubmission";
import { VerifyingStep } from "./VerifyingStep";

function flowVault(v: Vault, currency?: string): FlowVault {
  return {
    id: v.id,
    name: v.name,
    category: v.category,
    proofCategory: rulesCategory(v),
    available: v.available,
    held: v.held,
    currency: v.currency ?? currency ?? DEFAULT_CURRENCY,
  };
}

/**
 * Withdraw with proof — a full-screen modal state machine. Steps live on a stack so Back always
 * returns to where you were; Close appears on the first step and on Verifying, where it means
 * "continue in background", never cancel.
 */
export function WithdrawFlow({ vaultParam, withdrawalParam }: { vaultParam: string; withdrawalParam?: string }) {
  const rules = useRules();
  const [vaultId, setVaultId] = useState<string | null>(vaultParam === "choose" ? null : vaultParam);
  const vaultQ = useVault(vaultId ?? undefined);

  const { step, depth, go, back, swap, reset } = useStepStack<Step>(() => (withdrawalParam ? "resume" : vaultParam === "choose" ? "choose" : "amount"));

  const [amountTextValue, setAmountText] = useState("");
  const [fixedAmount, setFixedAmount] = useState<number | null>(null);
  const [payee, setPayee] = useState("");
  const [note, setNote] = useState("");
  const [doc, setDoc] = useState<PickedDoc | null>(null);
  const [cameraOff, setCameraOff] = useState<CameraOffReason>("unavailable");
  const [askingCamera, setAskingCamera] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const {
    proofId,
    lastDecline,
    submitting,
    error: submitError,
    clearError: clearSubmitError,
    submit,
    tryAnother,
    resume,
    dropOrphan,
    finish,
    refresh,
  } = useWithdrawalSubmission({ onSent: () => reset("verifying") });
  const busy = submitting || askingCamera;

  const {
    status: cameraStatus,
    request: requestCamera,
    recheck: recheckCamera,
    openSettings,
  } = useCameraAccess({
    // Back from Settings with the camera turned on: straight to the camera.
    recheckOnReturn: step === "cameraOff" && cameraOff === "denied",
    onRecheck: (answer) => {
      if (answer === "granted") swap("camera");
    },
  });

  const detail = vaultQ.data;
  const vault = useMemo(() => (detail ? flowVault(detail.vault, detail.currency) : null), [detail]);
  const amount = fixedAmount ?? parseAmount(amountTextValue) ?? 0;
  const saved = useMemo(() => savedPayees(detail?.withdrawals), [detail]);

  /* ---------- leaving ---------- */

  const nav = { onClose: finish, onBack: depth > 1 ? back : undefined };

  // If the bill never arrived for a request created here and the details change, start afresh.
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

  useHardwareBack(
    () => {
      if (step === "verifying" || depth <= 1) finish();
      else back();
    },
    { whileFocused: true },
  );

  /* ---------- resuming a request from the vault ---------- */

  const resumeRow = step === "resume" && detail ? detail.withdrawals.find((w) => w.id === withdrawalParam) : undefined;
  useEffect(() => {
    const target = resumeRow ? resume(resumeRow) : null;
    if (!resumeRow || !target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds the flow once from the withdrawal loaded from the server
    setFixedAmount(resumeRow.amount);
    setPayee(resumeRow.payee ?? "");
    setNote(resumeRow.note ?? "");
    reset(target);
  }, [resumeRow, resume, reset]);

  /* ---------- getting a document ---------- */

  const choosePhoto = useCallback(async () => {
    setPickError(null);
    clearSubmitError();
    const r = await pickFromLibrary();
    if (r.ok) {
      setDoc(r.doc);
      if (step !== "review") go("review");
    } else if (r.reason === "unavailable") {
      setPickError(errorMessage(r.error, "Your photos didn't open. Try again."));
    }
  }, [clearSubmitError, go, step]);

  const startScan = useCallback(async () => {
    if (cameraStatus === "unsupported") {
      setCameraOff("web");
      go("cameraOff");
      return;
    }
    const answer = (await recheckCamera()) ?? cameraStatus;
    if (answer === "granted") go("camera");
    else if (answer === "blocked") {
      setCameraOff("denied");
      go("cameraOff");
    } else go("primer");
  }, [cameraStatus, recheckCamera, go]);

  const askCamera = useCallback(async () => {
    setAskingCamera(true);
    try {
      const answer = await requestCamera();
      if (answer === "granted") swap("camera");
      else {
        setCameraOff(answer ? "denied" : "unavailable");
        swap("cameraOff");
      }
    } finally {
      setAskingCamera(false);
    }
  }, [requestCamera, swap]);

  const pickSample = useCallback(
    (s: Sample) => {
      clearSubmitError();
      setDoc(sampleDoc(s));
      go("review");
    },
    [clearSubmitError, go],
  );

  /* ---------- sending ---------- */

  const onTryAnother = useCallback(
    (reason: string) => {
      tryAnother(reason);
      setDoc(null);
      reset("proof");
    },
    [tryAnother, reset],
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
          canAskAgain={cameraStatus === "needs-permission"}
          busy={busy}
          onAskAgain={() => void askCamera()}
          onSettings={openSettings}
          onChoose={() => void choosePhoto()}
          onSamples={() => go("samples")}
        />
      );
    case "camera":
      return (
        <CameraStep
          onClose={back}
          onCaptured={(photo) => {
            clearSubmitError();
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
          onUse={() => void submit({ vaultId: vault.id, amount, payee, note, file: doc.file })}
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
          onResult={refresh}
          onTryAnother={onTryAnother}
        />
      );
    default:
      return null;
  }
}
