import { useCallback, useEffect, useRef, useState } from "react";
import { useNow } from "@/components/ui";
import { api } from "@/lib/api/client";
import type { OtpPurpose, OtpSent } from "@/lib/api/security-types";
import { haptic } from "@/lib/haptics";
import { RESEND_AFTER_MS } from "./config";
import { readOtpError, type OtpProblem } from "./errors";

/**
 * One code for one purpose: send it (POST /otp/send), check what the person typed (POST
 * /otp/verify) for a single-use token, and send a new one after a short wait. Server answers about
 * codes become `problem` (./errors.ts); anything else is kept as `failure` for errorMessage().
 */
export function useOtp(purpose: OtpPurpose) {
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<OtpProblem | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  /** Bumped on a refused code, so the field can clear and shake. */
  const [errorTick, setErrorTick] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const phoneRef = useRef<string | undefined>(undefined);
  const busy = useRef(false);
  /** When "Send a new code" works again (0: now). */
  const now = useNow(1000, resendAt !== 0);
  useEffect(() => {
    if (!resendAt) return undefined;
    const t = setTimeout(() => setResendAt(0), Math.max(0, resendAt - Date.now()));
    return () => clearTimeout(t);
  }, [resendAt]);

  /** Sends a code (to `phone` for phone_verify; to the verified number otherwise). True when it went. */
  const send = useCallback(
    async (phone?: string) => {
      if (busy.current) return false;
      busy.current = true;
      if (phone !== undefined) phoneRef.current = phone;
      setSending(true);
      setProblem(null);
      setFailure(null);
      try {
        const r = await api.sendOtp(purpose, phoneRef.current);
        setSent(r);
        setResendAt(Date.now() + RESEND_AFTER_MS);
        return true;
      } catch (e) {
        const p = readOtpError(e);
        if (p?.kind === "rate_limited" && p.retryAt) setResendAt(p.retryAt);
        if (p) setProblem(p);
        else setFailure(e);
        haptic("error");
        return false;
      } finally {
        busy.current = false;
        setSending(false);
      }
    },
    [purpose],
  );

  /** Checks a typed code. The token on success; null when refused (see `problem` / `failure`). */
  const verify = useCallback(
    async (code: string): Promise<string | null> => {
      if (busy.current || !sent) return null;
      busy.current = true;
      setChecking(true);
      setProblem(null);
      setFailure(null);
      try {
        const r = await api.verifyOtp(sent.otpId, code);
        return r.verificationToken || null;
      } catch (e) {
        const p = readOtpError(e);
        if (p) setProblem(p);
        else setFailure(e);
        haptic("error");
        setErrorTick((t) => t + 1);
        return null;
      } finally {
        busy.current = false;
        setChecking(false);
      }
    },
    [sent],
  );

  /** A token that was refused later (expired before it was used): the person needs a new code. */
  const tokenRefused = useCallback((e: unknown) => {
    const p = readOtpError(e);
    if (p) setProblem(p);
    else setFailure(e);
    setErrorTick((t) => t + 1);
  }, []);

  const secondsToResend = resendAt ? Math.max(0, Math.ceil((resendAt - now) / 1000)) : 0;
  return {
    purpose,
    sent,
    sending,
    checking,
    problem,
    failure,
    errorTick,
    /** Seconds until "Send a new code" works again. */
    secondsToResend,
    /** A new code is needed before anything can be typed (spent, or none sent yet). */
    needsNewCode: !sent || problem?.kind === "spent",
    send,
    verify,
    tokenRefused,
  };
}

export type OtpController = ReturnType<typeof useOtp>;
