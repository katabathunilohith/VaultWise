import { useCallback, useEffect, useRef, useState } from "react";
import { useBiometricKind } from "@/features/account/pin-guard";
import { useNow } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/api/hooks";
import { isPracticeMode, usePracticeMode } from "@/lib/api/practice";
import { haptic } from "@/lib/haptics";
import type { MpinRun } from "./ask";
import { mpinFromBiometric, turnOffMpinShortcut, useMpinShortcut } from "./biometric";
import { deviceProblemFor, lockedMpinText, readDeviceError, readMpinError, type MpinProblem, type UntrustedProblem } from "./errors"; // devices: readDeviceError, deviceProblemFor
import { checkNewMpin, LEGACY_PIN_LENGTH, MPIN_LENGTH } from "./policy";
import { changeMpin, mpinCheckedByServer, refreshMpinStatus, rememberMpin, useMpinStatus } from "./sync";

/**
 * enter:    type the MPIN (or Face ID / fingerprint, when the shortcut is on).
 * checking: the MPIN is with the server (the call runs while the pad waits).
 * upgrade-*: the server still has a 4-digit PIN (/me `mpin.upgradeDue`): current PIN, then a new
 *            6-digit MPIN twice, then the money move carries on with the new one.
 */
export type MpinPhase = "enter" | "checking" | "upgrade-current" | "upgrade-new" | "upgrade-confirm";

const isUpgrade = (p: MpinPhase) => p.startsWith("upgrade");

/**
 * The MPIN prompt's logic, shared by the sheet (app/mpin.tsx) and the step flows embed when they
 * can't open a route (flows inside a React Native Modal). Server answers are read in one place
 * (./errors.ts): a wrong MPIN shakes the dots and says how many tries are left, a lock shows when
 * it ends and pauses the pad, a missing MPIN asks again.
 */
export function useMpinEntry({
  reason,
  run,
  onDone,
  onError,
}: {
  reason: string;
  run: MpinRun | null;
  onDone: (pin: string, value: unknown) => void;
  /** A failure that isn't about the MPIN: the flow shows it. */
  onError: (e: unknown) => void;
}) {
  const status = useMpinStatus();
  // devices: what /me says about this phone, so an answer for a phone the account couldn't add offers no Trust button.
  const me = useMe();
  const device = me.data?.onboarded ? me.data.device : undefined;
  const practice = usePracticeMode();
  const kind = useBiometricKind();
  const shortcut = useMpinShortcut();
  const [phase, setPhaseState] = useState<MpinPhase>(() => (status?.upgradeDue ? "upgrade-current" : "enter"));
  /** Which pad is on screen. It stays the same while checking, so a wrong answer can shake the same dots. */
  const [pad, setPad] = useState<MpinPhase>(phase);
  const setPhase = useCallback((next: MpinPhase) => {
    setPhaseState(next);
    if (next !== "checking") setPad(next);
  }, []);
  const [problem, setProblem] = useState<MpinProblem | null>(null);
  /** devices: the MPIN was fine, but this phone isn't trusted for an amount this large (403 device_untrusted). */
  const [untrusted, setUntrusted] = useState<UntrustedProblem | null>(null);
  /** A line of our own: a refusal the server didn't send (error), or a neutral note. */
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  /** Bumped to shake the dots and clear them (a rejected MPIN). */
  const [errorTick, setErrorTick] = useState(0);
  /** Bumped to clear the dots without a shake (a fresh pad). */
  const [padKey, setPadKey] = useState(0);
  const upgradeCurrent = useRef("");
  const upgradeNew = useRef("");
  const busy = useRef(false);

  const lockedUntil = problem?.kind === "locked" ? problem.lockedUntil : (status?.lockedUntil ?? null);
  const now = useNow(1000, lockedUntil !== null);
  const locked = lockedUntil !== null && lockedUntil > now;
  const secondsLeft = locked ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;

  // The lock ended (driven by the clock): the pad works again, its message goes, and /me is read so
  // it no longer reports the old lock.
  const wasLocked = useRef(locked);
  useEffect(() => {
    if (wasLocked.current && !locked) {
      void refreshMpinStatus();
      setProblem((p) => (p?.kind === "locked" ? null : p));
    }
    wasLocked.current = locked;
  }, [locked]);

  const reject = useCallback((p: MpinProblem | null, message?: string) => {
    haptic("pin.wrong");
    setErrorTick((t) => t + 1);
    setProblem(p);
    setNote(message ? { text: message, error: true } : null);
  }, []);

  /** Handles an MPIN answer. Returns false for any other error. */
  const answer = useCallback(
    (e: unknown, via: "typed" | "biometric") => {
      const p = readMpinError(e);
      if (!p) return false;
      void refreshMpinStatus();
      if (p.kind === "required") {
        setProblem(p);
        setPadKey((k) => k + 1);
        return true;
      }
      if (via === "biometric" && p.kind === "wrong") {
        // The saved copy is out of date (the MPIN was changed elsewhere): stop offering it.
        void turnOffMpinShortcut();
        reject(p, "The MPIN saved for Face ID or fingerprint is out of date, so it's turned off. Type your MPIN.");
        return true;
      }
      reject(p);
      return true;
    },
    [reject],
  );

  const submit = useCallback(
    async (pin: string, via: "typed" | "biometric" = "typed") => {
      if (busy.current || locked) return;
      busy.current = true;
      setPhase("checking");
      setProblem(null);
      setNote(null);
      // Where the call goes (live or Practice) is decided now, so read these now too.
      const remember = !!run && mpinCheckedByServer(status);
      const live = !isPracticeMode();
      try {
        const value = run ? await run(pin) : undefined;
        // Proven by the server (live, MPIN enforced): it's the unlock PIN too from now on.
        if (remember) await rememberMpin(pin).catch(() => undefined);
        busy.current = false;
        onDone(pin, value);
      } catch (e) {
        busy.current = false;
        setPhase("enter");
        // devices: say why and offer to trust the phone, instead of asking for the MPIN again.
        const u = readDeviceError(e);
        if (u) {
          haptic("warning");
          setUntrusted(deviceProblemFor(u, device));
          setPadKey((k) => k + 1);
          return;
        }
        // A biometric try that went to Practice says nothing about the live copy.
        if (!answer(e, live ? via : "typed")) onError(e);
      }
    },
    [answer, device, locked, onDone, onError, run, setPhase, status],
  );

  const tryBiometric = useCallback(async () => {
    if (busy.current || locked || !shortcut || !kind) return;
    const r = await mpinFromBiometric(reason);
    if (r.kind === "pin") await submit(r.pin, "biometric");
    else if (r.kind === "invalidated")
      setNote({ text: "Face ID or fingerprint changed on this phone, so enter your MPIN. You can turn the shortcut on again in Settings.", error: false });
  }, [kind, locked, reason, shortcut, submit]);

  // Offer Face ID / fingerprint once as the prompt opens, like the unlock screen.
  const offered = useRef(false);
  const canBio = shortcut && !!kind && phase === "enter" && !locked;
  useEffect(() => {
    if (!canBio || offered.current) return;
    offered.current = true;
    void tryBiometric();
  }, [canBio, tryBiometric]);

  /** The upgrade: the 4-digit PIN, then the new MPIN twice, then on with the money move. */
  const upgrade = useCallback(
    async (pin: string) => {
      if (busy.current || locked) return;
      if (phase === "upgrade-current") {
        upgradeCurrent.current = pin;
        setProblem(null);
        setNote(null);
        setPhase("upgrade-new");
        return;
      }
      if (phase === "upgrade-new") {
        const check = checkNewMpin(pin);
        if (!check.ok) return reject(null, check.message);
        upgradeNew.current = pin;
        setNote(null);
        setPhase("upgrade-confirm");
        return;
      }
      if (pin !== upgradeNew.current) {
        setPhase("upgrade-new");
        return reject(null, "Those didn't match. Choose your new MPIN again.");
      }
      busy.current = true;
      setPhase("checking");
      try {
        await changeMpin(upgradeCurrent.current, pin, "Use the new MPIN with Face ID or fingerprint");
      } catch (e) {
        busy.current = false;
        const p = readMpinError(e);
        if (p?.kind === "weak") {
          setPhase("upgrade-new");
          return reject(null, p.message);
        }
        if (p) {
          setPhase("upgrade-current");
          void refreshMpinStatus();
          return reject(p);
        }
        haptic("error");
        setPhase("upgrade-new");
        setNote({ text: `Your new MPIN wasn't saved. ${errorMessage(e)}`, error: true });
        return;
      }
      busy.current = false;
      // Saved: the money move goes ahead with the new MPIN.
      await submit(pin);
    },
    [locked, phase, reject, setPhase, submit],
  );

  const onPin = useCallback((pin: string) => void (isUpgrade(phase) ? upgrade(pin) : submit(pin)), [phase, submit, upgrade]);

  /** "My PIN has 6 digits": an older account whose PIN is already 6 digits approves with it as it is. */
  const skipUpgrade = useCallback(() => {
    setProblem(null);
    setNote(null);
    setPhase("enter");
  }, [setPhase]);

  return {
    phase,
    checking: phase === "checking",
    upgrading: isUpgrade(pad),
    /** The pad on screen (it stays the same while checking). */
    step: pad,
    length: pad === "upgrade-current" ? LEGACY_PIN_LENGTH : MPIN_LENGTH,
    /** The wrong/required message, the lock, or a note (never colour alone: the screen pairs it with an icon). */
    message: locked && lockedUntil ? lockedMpinText(lockedUntil, now) : (note?.text ?? problem?.message ?? null),
    /** True when the message is a refusal (shown as an error); false for neutral notes. */
    isError: locked || (note ? note.error : problem !== null && problem.kind !== "required"),
    locked,
    secondsLeft,
    errorTick,
    padKey: `${pad}-${padKey}`,
    practiceHint: practice && status?.practiceDefault !== false,
    /** devices: shown instead of the pad's message; the pad pauses. */
    untrusted,
    biometric: canBio ? kind : null,
    tryBiometric,
    onPin,
    skipUpgrade,
  };
}

export type MpinEntry = ReturnType<typeof useMpinEntry>;
