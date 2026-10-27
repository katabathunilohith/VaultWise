import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PinPad, Txt } from "@/components/ui";
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
}: {
  guard: PinGuard;
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

export function formatWait(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * What the PIN pad is waiting for: "Wrong PIN. Try again.", or after five wrong tries a calm
 * countdown (Geist Mono, so the digits don't jitter). Otherwise the hint, if any.
 */
export function PinStatus({ guard, hint }: { guard: PinGuard; hint?: string | null }) {
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
