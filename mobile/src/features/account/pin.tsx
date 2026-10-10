import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PinPad, Txt, useNow } from "@/components/ui";
import { DEMO_PIN } from "@/lib/api/demo";
import { getConnection } from "@/lib/api/connection";
import { haptic } from "@/lib/haptics";
import { biometricKind, checkDevicePin } from "@/lib/session";
import { getItem, setItem } from "@/lib/storage";
import { space, useTheme } from "@/theme";

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

/** Clears the wrong-PIN counter (account deleted, PIN changed). */
export async function resetPinAttempts() {
  await saveAttempts({ fails: 0, until: 0 });
}

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
    loadAttempts().then((a) => alive && setState(a));
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

export function formatWait(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The PIN that confirms account actions on this phone: the device PIN when one is set, the
 * demo PIN in demo mode. Returns null when neither exists (live account created on the web).
 */
export function pinVerifier(hasDevicePin: boolean): ((pin: string) => Promise<boolean>) | null {
  if (hasDevicePin) return checkDevicePin;
  if (getConnection().mode === "demo") return async (pin) => pin === DEMO_PIN;
  return null;
}

/** PINs that are too easy to guess: one repeated digit, or a straight run up or down. */
export function isWeakPin(pin: string) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = pin.split("").map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

/* ---------- layout ---------- */

/**
 * PIN screen body (R9): what you're doing at the top, a status line under it, and the pad with
 * its bottom edge about 48 pt above the home indicator. Status is words, never colour alone.
 */
export function PinLayout({
  title,
  body,
  status,
  pad,
  below,
  bottomInset = true,
}: {
  title: string;
  body?: ReactNode;
  status?: ReactNode;
  pad: ReactNode;
  below?: ReactNode;
  /** Add the safe-area inset under the pad (off when the parent already does). */
  bottomInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.fill}>
      <View style={styles.top}>
        <Txt v="headline" align="center" accessibilityRole="header">
          {title}
        </Txt>
        {typeof body === "string" ? (
          <Txt v="bodyM" color="textMuted" align="center">
            {body}
          </Txt>
        ) : (
          body
        )}
        <View style={styles.status} accessibilityLiveRegion="polite">
          {typeof status === "string" ? (
            <Txt v="labelM" color="textMuted" align="center">
              {status}
            </Txt>
          ) : (
            status
          )}
        </View>
      </View>
      <View style={[styles.pad, { paddingBottom: (bottomInset ? insets.bottom : 0) + 48 }]}>
        {pad}
        {below}
      </View>
    </View>
  );
}

/** A PinPad wired to the guard: shakes on a wrong PIN and pauses during the wait. */
export function GuardedPinPad({
  guard,
  verify,
  onSuccess,
  biometric,
  onBiometric,
}: {
  guard: ReturnType<typeof usePinGuard>;
  verify: (pin: string) => Promise<boolean>;
  onSuccess: (pin: string) => void;
  biometric?: Biometric;
  onBiometric?: () => void;
}) {
  return (
    <PinPad
      error={guard.errorTick}
      disabled={guard.locked || guard.checking}
      biometric={biometric ?? null}
      onBiometric={onBiometric}
      onComplete={async (pin) => {
        if (await guard.submit(pin, verify)) onSuccess(pin);
      }}
    />
  );
}

/**
 * What the PIN pad is waiting for: "Wrong PIN. Try again.", or after five wrong tries a calm
 * countdown (Geist Mono, so the digits don't jitter). Otherwise the hint, if any.
 */
export function PinStatus({ guard, hint }: { guard: ReturnType<typeof usePinGuard>; hint?: string | null }) {
  const { c } = useTheme();
  if (guard.locked)
    return (
      <View style={styles.waitWrap} accessible accessibilityLabel={`Too many tries. You can try again in ${guard.secondsLeft} seconds.`}>
        <Txt v="labelM" color="textMuted" align="center">
          Too many tries. Take a short break.
        </Txt>
        <View style={styles.wait}>
          <Txt v="bodyM" color="textMuted">
            Try again in
          </Txt>
          <Txt v="numM" color={c.text}>
            {formatWait(guard.secondsLeft)}
          </Txt>
        </View>
      </View>
    );
  const text = guard.wrong ? "Wrong PIN. Try again." : hint;
  return text ? (
    <Txt v="labelM" color={guard.wrong ? "text" : "textMuted"} align="center">
      {text}
    </Txt>
  ) : null;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { gap: space.xs, paddingTop: space.lg, alignItems: "center" },
  status: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.md },
  pad: { flex: 1, justifyContent: "flex-end", gap: space.md },
  wait: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  waitWrap: { gap: 4, alignItems: "center" },
});
