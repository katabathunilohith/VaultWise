import { useCallback, useEffect, useState } from "react";
import { useNow } from "@/components/ui";
import { isPracticeMode, PRACTICE_PIN } from "@/lib/api/practice";
import { biometricKind } from "@/lib/auth/biometrics";
import { checkDevicePin, readDevicePinLength } from "@/lib/auth/device-pin";
import { useSession } from "@/lib/auth/session-state";
import { haptic } from "@/lib/haptics";
import { getItem, onDeviceReset, setItem } from "@/lib/storage";
import {
  PIN_TRIES_BEFORE_WAIT,
  pinLockoutKind,
  pinTriesExhausted,
  pinTriesLeft,
  pinWaitAfter,
  PROTECTION,
  signOutAfterWrongPins,
  type PinLockout,
} from "@/features/protection"; // protection

/**
 * PIN rules shared by every PIN screen on this phone: biometrics on offer, the wrong-PIN limit, which
 * PIN counts and how long it is. Choosing a new MPIN follows the policy in features/mpin.
 */

export type Biometric = "face" | "finger" | null;

/** The device's biometric (Face ID / fingerprint), or null. `undefined` while it's being checked. */
export function useBiometricKind() {
  const [kind, setKind] = useState<Biometric | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    biometricKind().then((k) => alive && setKind(k));
    return () => {
      alive = false;
    };
  }, []);
  return kind;
}

export const biometricName = (kind: Biometric | undefined) => (kind === "face" ? "Face ID" : kind === "finger" ? "fingerprint" : null);

/**
 * How many digits the PIN on this phone has: 6 (the MPIN), or 4 for a PIN chosen before the MPIN,
 * which keeps working until it's changed. `undefined` while it's read; null with no PIN.
 */
export function useDevicePinLength() {
  const { hasDevicePin } = useSession();
  const [length, setLength] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    readDevicePinLength().then((n) => alive && setLength(n));
    return () => {
      alive = false;
    };
  }, [hasDevicePin]);
  return length;
}

/** "MPIN" for a 6-digit PIN, "PIN" for an older 4-digit one. */
export const pinWord = (length: number | null | undefined) => (length === 4 ? "PIN" : "MPIN");

/* ---------- wrong-PIN limit ---------- */

const KEY = "vw.pinAttempts";
/** protection off (escalatingPinGuard): the old limit, 5 tries then a 30-second wait, and the count starts again. */
const LEGACY_TRIES = 5;
const LEGACY_WAIT_MS = 30_000;

interface Attempts {
  /** Wrong tries in a row (protection: kept through the waits; a right PIN clears it). */
  fails: number;
  /** When the current wait ends (ms since epoch), or 0. */
  until: number;
}

/** One counter for every PIN entry in the app, kept on the device so a restart doesn't reset it. */
let attempts: Attempts = { fails: 0, until: 0 };
let loaded: Promise<Attempts> | null = null;
/** protection: the lockout sign-out has started (it runs once). */
let signingOut = false;

/** The longest a wait can be after `fails` wrong tries in a row. */
function longestWait(fails: number) {
  return Math.max(LEGACY_WAIT_MS, PROTECTION.escalatingPinGuard ? (pinWaitAfter(fails) ?? 0) : 0);
}

/**
 * protection: a wait never ends later than now plus its full length. Moving the phone's clock back
 * (or a Keychain counter that outlived a reinstall on iOS) would otherwise leave `until` far ahead
 * and freeze the countdown. Returns the same object when nothing changes.
 */
function clampWait(a: Attempts, now = Date.now()): Attempts {
  const latest = now + longestWait(a.fails);
  return a.until > latest ? { fails: a.fails, until: latest } : a;
}

function loadAttempts() {
  loaded ??= getItem(KEY).then((raw) => {
    let read: Attempts;
    try {
      const parsed = raw ? (JSON.parse(raw) as Partial<Attempts>) : {};
      read = { fails: Number(parsed.fails) || 0, until: Number(parsed.until) || 0 };
    } catch {
      read = { fails: 0, until: 0 };
    }
    attempts = clampWait(read);
    if (attempts !== read) void writeAttempts(attempts); // protection
    return attempts;
  });
  return loaded;
}

/** Only the stored copy (the count in memory stays as it is). */
function writeAttempts(next: Attempts) {
  return setItem(KEY, JSON.stringify(next));
}

async function saveAttempts(next: Attempts) {
  attempts = next;
  await writeAttempts(next);
}

/** Clears the wrong-PIN counter (PIN changed). */
export async function resetPinAttempts() {
  await saveAttempts({ fails: 0, until: 0 });
}

// Delete account: the stored counter is gone, so the count starts again.
onDeviceReset(() => {
  attempts = { fails: 0, until: 0 };
  loaded = Promise.resolve(attempts);
  signingOut = false;
});

/** protection: what ends the guard right now after 10 wrong tries in a row (pin-policy.ts), if anything. */
function lockoutFor(fails: number): PinLockout {
  return PROTECTION.escalatingPinGuard && pinTriesExhausted(fails) ? pinLockoutKind() : null;
}

/** The count and wait after one more wrong PIN. */
function afterWrong(fails: number, now = Date.now()): Attempts {
  if (!PROTECTION.escalatingPinGuard) return fails >= LEGACY_TRIES ? { fails: 0, until: now + LEGACY_WAIT_MS } : { fails, until: 0 };
  if (lockoutFor(fails)) return { fails, until: 0 };
  const wait = pinWaitAfter(fails);
  return { fails, until: wait ? now + wait : 0 };
}

/**
 * Checks a PIN with a calm limit. protection (plan 04): 4 free wrong tries, then a wait after each
 * wrong try in a row (1, 5, 30, then 60 minutes) with a countdown; the 10th wrong try in a row
 * signs out of Vaultwise (whenever a login is on the phone, Practice included) or asks for Start
 * Practice over (Practice with nobody signed in). Each try is counted before it's checked.
 * Wrong PINs play `pin.wrong` and bump `errorTick` (pass it to PinPad to shake and clear the dots).
 */
export function usePinGuard() {
  const [state, setState] = useState<Attempts>(attempts);
  const [errorTick, setErrorTick] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let alive = true;
    // Read the current counter, not the first load's result: wrong PINs since then must still count.
    loadAttempts().then(() => alive && setState(attempts));
    return () => {
      alive = false;
    };
  }, []);
  const now = useNow(1000, state.until > 0);
  // `now` can be up to a tick stale when a wait starts, so never show more than the full wait.
  const longest = longestWait(state.fails);
  const secondsLeft = state.until > 0 ? Math.min(longest / 1000, Math.max(0, Math.ceil((state.until - now) / 1000))) : 0;
  const lockout = lockoutFor(state.fails);
  const locked = secondsLeft > 0 || lockout !== null;

  useEffect(() => {
    let next: Attempts | null = null;
    if (state.until > 0 && secondsLeft === 0) {
      // protection: the count stays, so the next wrong try waits longer.
      next = PROTECTION.escalatingPinGuard ? { fails: state.fails, until: 0 } : { fails: 0, until: 0 };
    } else if (state.until > 0) {
      // protection: the clock went back while waiting; the wait ends no later than its full length from now.
      const clamped = clampWait(state, now);
      if (clamped !== state) next = clamped;
    }
    if (!next) return;
    void saveAttempts(next);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the wait is driven by the clock; ending or clamping it updates the counter once
    setState(next);
  }, [state, secondsLeft, now]);

  // protection: with a login on the phone, the 10th wrong try in a row signs out (once); the gate then asks to sign in.
  useEffect(() => {
    if (lockout !== "signOut" || signingOut) return;
    signingOut = true;
    void signOutAfterWrongPins().catch(() => {
      signingOut = false;
    });
  }, [lockout]);

  const submit = useCallback(
    async (pin: string, verify: (pin: string) => Promise<boolean>) => {
      if (locked || checking) return false;
      setChecking(true);
      const before = attempts;
      try {
        // protection: the try is counted as wrong before it's checked (and cleared if it's right), so
        // closing the app while it's checked can't skip a count.
        await writeAttempts(afterWrong(before.fails + 1));
        let ok: boolean;
        try {
          ok = await verify(pin);
        } catch (e) {
          // Not an answer: the try doesn't count.
          await writeAttempts(before);
          throw e;
        }
        if (ok) {
          await saveAttempts({ fails: 0, until: 0 });
          setState(attempts);
          setWrong(false);
          return true;
        }
        haptic("pin.wrong");
        setErrorTick((t) => t + 1);
        const next = afterWrong(before.fails + 1);
        await saveAttempts(next);
        setState(next);
        setWrong(next.until === 0 && !lockoutFor(next.fails));
        return false;
      } finally {
        setChecking(false);
      }
    },
    [locked, checking],
  );

  const escalating = PROTECTION.escalatingPinGuard;
  return {
    submit,
    errorTick,
    locked,
    secondsLeft,
    wrong: wrong && !locked,
    checking,
    /** protection: wrong tries left before the first wait, then before the end. */
    triesLeft: escalating ? pinTriesLeft(state.fails) : Math.max(0, LEGACY_TRIES - state.fails),
    /** protection: past the first wait, so each wrong try waits and counts toward the end. */
    pastFirstWait: escalating && state.fails >= PIN_TRIES_BEFORE_WAIT,
    /** protection: what the 10th wrong try in a row does on this build, if anything. */
    ending: escalating ? pinLockoutKind() : null,
    /** protection: it ended: signing out, or Start Practice over is the only way on. */
    lockout,
  };
}

export type PinGuard = ReturnType<typeof usePinGuard>;

/* ---------- which PIN counts ---------- */

/**
 * The PIN that confirms account actions on this phone: the device PIN when one is set, the
 * Practice MPIN in Practice mode (with no PIN on the phone, the simulator's MPIN is still the
 * Practice one: changing it sets the phone's PIN, and wiping the phone puts it back). Returns null
 * when neither exists (live account created on the web).
 */
export function pinVerifier(hasDevicePin: boolean): ((pin: string) => Promise<boolean>) | null {
  if (hasDevicePin) return checkDevicePin;
  if (isPracticeMode()) return async (pin) => pin === PRACTICE_PIN;
  return null;
}
