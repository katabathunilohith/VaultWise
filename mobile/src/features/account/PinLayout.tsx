import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, PinPad, Txt } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { startPracticeOverAfterLockout } from "@/features/protection"; // protection
import { space, useTheme } from "@/theme";
import type { Biometric, PinGuard } from "./pin-guard";

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
  length = 6,
}: {
  guard: PinGuard;
  verify: (pin: string) => Promise<boolean>;
  onSuccess: (pin: string) => void;
  biometric?: Biometric;
  onBiometric?: () => void;
  /** 6 for the MPIN; 4 for a PIN chosen before it (useDevicePinLength). */
  length?: number;
}) {
  return (
    <PinPad
      key={length}
      length={length}
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

export function formatWait(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "45 seconds", "5 minutes": a wait, said in words for screen readers. */
function spokenWait(seconds: number) {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const m = Math.ceil(seconds / 60);
  return `${m} ${m === 1 ? "minute" : "minutes"}`;
}

const tries = (n: number) => (n === 1 ? "1 try" : `${n} tries`);

/**
 * What the PIN pad is waiting for: "Wrong MPIN. 3 tries left." (the MPIN sheet's words), or after
 * five wrong tries a calm countdown (Geist Mono, so the digits don't jitter). protection: past the
 * first wait it says how many tries are left before the end; at the end, that the app is signing
 * out, or a Start Practice over button. Otherwise the hint, if any.
 */
export function PinStatus({ guard, hint, word = "MPIN" }: { guard: PinGuard; hint?: string | null; word?: string }) {
  const { c } = useTheme();
  if (guard.lockout === "startOver") return <LockedOutStartOver />;
  if (guard.lockout === "signOut")
    return (
      <Txt v="labelM" color="textMuted" align="center">
        Too many wrong tries. Signing you out of Vaultwise…
      </Txt>
    );
  if (guard.locked)
    return (
      <View style={styles.waitWrap} accessible accessibilityLabel={`Too many wrong tries. You can try again in ${spokenWait(guard.secondsLeft)}.`}>
        <Txt v="labelM" color="textMuted" align="center">
          Too many wrong tries. Take a break.
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
  const ending =
    guard.ending === "signOut" ? "before Vaultwise signs you out" : guard.ending === "startOver" ? "before you need to start Practice over" : null;
  const text = guard.wrong
    ? `Wrong ${word}. ${tries(guard.triesLeft)} left.`
    : guard.pastFirstWait && ending
      ? `${tries(guard.triesLeft)} left ${ending}.`
      : hint;
  return text ? (
    <Txt v="labelM" color={guard.wrong ? "text" : "textMuted"} align="center">
      {text}
    </Txt>
  ) : null;
}

/** protection, Practice: after 10 wrong tries in a row, only starting Practice over carries on. */
function LockedOutStartOver() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.lockout}>
      <Txt v="labelM" align="center">
        Too many wrong tries.
      </Txt>
      <Txt v="bodyM" color="textMuted" align="center">
        To carry on, start Practice over. The pretend money and the MPIN on this phone are cleared.
      </Txt>
      <Button
        label="Start Practice over"
        variant="dangerOutline"
        size="md"
        loading={busy}
        onPress={() => {
          setBusy(true);
          setFailed(false);
          startPracticeOverAfterLockout().catch(() => {
            haptic("error");
            setFailed(true);
            setBusy(false);
          });
        }}
      />
      {failed ? (
        <Txt v="caption" color="textMuted" align="center">
          That didn&apos;t work. Try again.
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { gap: space.xs, paddingTop: space.lg, alignItems: "center" },
  status: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.md },
  pad: { flex: 1, justifyContent: "flex-end", gap: space.md },
  wait: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  waitWrap: { gap: 4, alignItems: "center" },
  lockout: { gap: space.xs, alignItems: "stretch", paddingVertical: space.xs },
});
