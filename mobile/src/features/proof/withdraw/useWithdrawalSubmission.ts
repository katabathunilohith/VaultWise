import { useCallback, useState } from "react";
import { router } from "expo-router";
import { resumeTarget, withdrawalStatus } from "@/features/vaults/withdrawal-status";
import { api } from "@/lib/api/client";
import { errorMessage, mayHaveGoneThrough } from "@/lib/api/errors";
import { useInvalidateMoney } from "@/lib/api/hooks";
import type { UploadFile, WithdrawalRow } from "@/lib/api/types";
import { haptic } from "@/lib/haptics";
import { ensureAiAnswer } from "@/features/ai-consent"; // ai-consent
import { withMpin } from "@/features/mpin"; // mpin
import { UNCONFIRMED_TEXT } from "./ReviewStep";
import { money } from "@/lib/money";

/** The withdrawal this flow is attached to (created here, or resumed from the vault). */
interface Attached {
  id: string;
  createdHere: boolean;
  hasProof: boolean;
}

/** A request created here whose bill never arrived (the upload failed) isn't left holding money. */
function orphanOf(a: Attached | null) {
  return a?.createdHere && !a.hasProof ? a.id : null;
}

export interface WithdrawalRequest {
  vaultId: string;
  /** Minor units. */
  amount: number;
  payee: string;
  note: string;
  file: UploadFile;
  /** For the MPIN prompt's line ("Withdraw ₹1,200 for City Clinic"). */
  currency?: string;
}

/**
 * The request behind the withdraw flow and its bill: creates the request when the first bill goes
 * (or reuses the one attached), uploads the bill, picks a request up from the vault, and cancels an
 * orphan (a request created here that never got its bill) when the details change or the flow closes.
 */
export function useWithdrawalSubmission({ onSent }: { onSent: () => void }) {
  const invalidate = useInvalidateMoney();
  const [attached, setAttached] = useState<Attached | null>(null);
  const [proofId, setProofId] = useState<string | null>(null);
  const [lastDecline, setLastDecline] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The request (the money move) got no answer: it may exist, so it's never sent again from here. */
  const [unconfirmed, setUnconfirmed] = useState(false);

  /** Cancels the orphan, if any, then refreshes the money screens. */
  const release = useCallback(
    (orphan: string | null) => {
      const cancelled = orphan ? api.cancelWithdrawal(orphan).catch(() => undefined) : Promise.resolve();
      void cancelled.then(() => invalidate());
    },
    [invalidate],
  );

  /** Leaves the flow. */
  const finish = useCallback(() => {
    release(orphanOf(attached));
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [attached, release]);

  /** The details changed before the bill arrived: cancel the orphan, so the next bill starts afresh. */
  const dropOrphan = useCallback(() => {
    const orphan = orphanOf(attached);
    if (!orphan) return;
    release(orphan);
    setAttached(null);
  }, [attached, release]);

  /** Attaches a request from the vault. Returns the step to show, or null when there's nothing left to do. */
  const resume = useCallback((row: WithdrawalRow): "proof" | "verifying" | null => {
    const target = resumeTarget(row);
    if (!target) return null;
    if (target === "verifying" && row.proof_id) {
      setAttached({ id: row.id, createdHere: false, hasProof: true });
      setProofId(row.proof_id);
      return "verifying";
    }
    if (withdrawalStatus(row.status) === "denied") {
      // A declined request can't take another bill, so the next one goes with a fresh request
      // for the same amount and payee (the declined one no longer holds any money).
      setAttached(null);
      setLastDecline("Send a different bill, or ask a person to check the last one.");
    } else {
      setAttached({ id: row.id, createdHere: false, hasProof: false });
    }
    return "proof";
  }, []);

  /** Sends the bill, creating the request first if none is attached. Calls onSent once it's in. */
  const submit = useCallback(
    async (req: WithdrawalRequest) => {
      if (submitting || unconfirmed) return;
      // ai-consent: ask once whether an AI may read the bill; closing the question sends nothing.
      if (!(await ensureAiAnswer())) return;
      setSubmitting(true);
      setError(null);
      /** Sending the request itself (not the bill), so a lost answer there means it may exist. */
      let creating = false;
      try {
        let wid = attached?.id ?? null;
        if (!wid) {
          creating = true;
          // mpin: the request is the money move, so the MPIN goes with it (the sheet stays up while it's checked).
          const payee = req.payee.trim();
          const what = req.currency ? `Withdraw ${money(req.amount, req.currency)} for ${payee}` : `Withdraw for ${payee}`;
          const w = await withMpin(what, (pin) => api.withdraw(req.vaultId, req.amount / 100, payee, req.note.trim() || undefined, pin));
          if (!w) return; // closed the MPIN prompt: nothing was sent
          creating = false;
          wid = w.id;
          setAttached({ id: w.id, createdHere: true, hasProof: false });
        }
        const p = await api.uploadProof(req.vaultId, wid, req.file);
        setAttached({ id: wid, createdHere: attached?.createdHere ?? !attached, hasProof: true });
        setProofId(p.id);
        setLastDecline(null);
        onSent();
      } catch (e) {
        haptic("error");
        if (creating && mayHaveGoneThrough(e)) {
          // It may have been made: re-read the vault (its withdrawals show it) instead of offering to send it again.
          setUnconfirmed(true);
          void invalidate();
          setError(UNCONFIRMED_TEXT);
        } else setError(errorMessage(e));
      } finally {
        setSubmitting(false);
      }
    },
    [attached, submitting, unconfirmed, onSent, invalidate],
  );

  /**
   * After a decline. The declined request is closed (the server won't take a second bill on it),
   * so the next bill goes with a fresh request for the same amount, payee and note.
   */
  const tryAnother = useCallback((reason: string) => {
    setAttached(null);
    setLastDecline(reason);
    setProofId(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /** A verdict came in (money paid out or released): refresh the money screens. */
  const refresh = useCallback(() => void invalidate(), [invalidate]);

  return { proofId, lastDecline, submitting, error, unconfirmed, clearError, submit, tryAnother, resume, dropOrphan, finish, refresh };
}
