import { useCallback, useEffect, useState } from "react";
import { useNow } from "@/components/ui";
import { isPracticeMode, PRACTICE_PIN } from "@/lib/api/practice";
import { biometricKind } from "@/lib/auth/biometrics";
import { checkDevicePin } from "@/lib/auth/device-pin";
import { haptic } from "@/lib/haptics";
import { getItem, onDeviceReset, setItem } from "@/lib/storage";

/** PIN rules shared by every PIN screen: biometrics on offer, the wrong-PIN limit, which PIN counts, weak PINs. */

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

/* ---------- wrong-PIN limit ---------- */

const KEY = "vw.pinAttempts";
const MAX_TRIES = 5;
const WAIT_MS = 30_000;

interface Attempts {
  fails: number;
  until: number;
}

/** One counter for every PIN entry in the app, kept on the device so a restart doesn't reset it. */
let attempts: Attempts = { fails: 0, until: 0 };
let loaded: Promise<Attempts> | null = null;

function loadAttempts() {
  loaded ??= getItem(KEY).then((raw) => {
    try {
      const parsed = raw ? (JSON.parse(raw) as Partial<Attempts>) : {};
      attempts = { fails: Number(parsed.fails) || 0, until: Number(parsed.until) || 0 };
    } catch {
      attempts = { fails: 0, until: 0 };
    }
    return attempts;
  });
  return loaded;
}

async function saveAttempts(next: Attempts) {
  attempts = next;
  await setItem(KEY, JSON.stringify(next));
}

/** Clears the wrong-PIN counter (PIN changed). */
export async function resetPinAttempts() {
  await saveAttempts({ fails: 0, until: 0 });
}

// Delete account: the stored counter is gone, so the count starts again.
onDeviceReset(() => {
  attempts = { fails: 0, until: 0 };
  loaded = Promise.resolve(attempts);
});

/**
 * Checks a PIN with a calm limit: after 5 wrong tries, a 30-second wait with a countdown.
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
  const secondsLeft = state.until > 0 ? Math.min(WAIT_MS / 1000, Math.max(0, Math.ceil((state.until - now) / 1000))) : 0;
  const locked = secondsLeft > 0;

  useEffect(() => {
    if (state.until > 0 && secondsLeft === 0) {
      void saveAttempts({ fails: 0, until: 0 });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the 30 s wait is driven by the clock; ending it resets the counter once
      setState({ fails: 0, until: 0 });
    }
  }, [state.until, secondsLeft]);

  const submit = useCallback(
    async (pin: string, verify: (pin: string) => Promise<boolean>) => {
      if (locked || checking) return false;
      setChecking(true);
      try {
        const ok = await verify(pin);
        if (ok) {
          await saveAttempts({ fails: 0, until: 0 });
          setState(attempts);
          setWrong(false);
          return true;
        }
        haptic("pin.wrong");
        setErrorTick((t) => t + 1);
        const fails = attempts.fails + 1;
        const next = fails >= MAX_TRIES ? { fails: 0, until: Date.now() + WAIT_MS } : { fails, until: 0 };
        await saveAttempts(next);
        setState(next);
        setWrong(next.until === 0);
        return false;
      } finally {
        setChecking(false);
      }
    },
    [locked, checking],
  );

  return { submit, errorTick, locked, secondsLeft, wrong: wrong && !locked, checking };
}

export type PinGuard = ReturnType<typeof usePinGuard>;

/* ---------- which PIN counts, and which are too weak ---------- */

/**
 * The PIN that confirms account actions on this phone: the device PIN when one is set, the
 * Practice PIN in Practice mode. Returns null when neither exists (live account created on the web).
 */
export function pinVerifier(hasDevicePin: boolean): ((pin: string) => Promise<boolean>) | null {
  if (hasDevicePin) return checkDevicePin;
  if (isPracticeMode()) return async (pin) => pin === PRACTICE_PIN;
  return null;
}

/** PINs that are too easy to guess: one repeated digit, or a straight run up or down. */
export function isWeakPin(pin: string) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = pin.split("").map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}
