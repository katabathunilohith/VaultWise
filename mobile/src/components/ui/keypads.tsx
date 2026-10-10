import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { BackspaceIcon, FingerprintIcon, ScanSmileyIcon } from "@/components/icons";
import { haptic } from "@/lib/haptics";
import { layout, radius, useTheme } from "@/theme";
import { useReduceMotion } from "./hooks";
import { Press } from "./Press";
import { Txt } from "./Txt";

/**
 * Amount keypad: 3×4, 64 pt keys, 8 pt gaps, decimal · 0 · ⌫ bottom row. Lives in the lower
 * middle of the screen (inside the both-thumbs sweet spot), directly above the main button.
 * Each key plays the same light key haptic (tactile keys improve touchscreen entry).
 */
export function AmountKeypad({ value, onChange, maxDecimals = 2 }: { value: string; onChange: (next: string) => void; maxDecimals?: number }) {
  const press = (k: string) => {
    haptic("pin.digit");
    if (k === "⌫") return onChange(value.slice(0, -1));
    if (k === ".") {
      if (value.includes(".") || maxDecimals === 0) return;
      return onChange((value || "0") + ".");
    }
    const [, dec = ""] = value.split(".");
    if (value.includes(".") && dec.length >= maxDecimals) return;
    if (value === "0") return onChange(k);
    if (value.replace(".", "").length >= 9) return;
    onChange(value + k);
  };
  return <KeyGrid keys={["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"]} onKey={press} />;
}

/** PIN pad. Submits on the last digit; bottom row is [biometric] · 0 · ⌫. Never shuffled. */
export function PinPad({
  length = 4,
  onComplete,
  error,
  biometric,
  onBiometric,
  disabled,
}: {
  length?: number;
  onComplete: (pin: string) => void;
  /** Change this value (e.g. a counter) to shake the dots and clear. */
  error?: number;
  biometric?: "face" | "finger" | null;
  onBiometric?: () => void;
  disabled?: boolean;
}) {
  const [pin, setPin] = useState("");
  const shake = useSharedValue(0);
  const reduce = useReduceMotion();
  // Set when the last digit goes in. Until the parent answers (a wrong-PIN tick, a remount with a
  // new key, or `disabled` turning off again) every key is ignored, so a quick extra tap can't
  // send the PIN a second time.
  const sent = useRef(false);
  // Shake and clear only when the error counter changes after mount, never on a (re)mount.
  const lastError = useRef(error);
  const rejected = useEffectEvent(() => {
    sent.current = false;
    setPin("");
    // iOS has no live regions, so the parent's error line isn't read out on its own.
    AccessibilityInfo.announceForAccessibility("PIN cleared");
    if (!reduce) shake.set(withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 70 }), withTiming(-6, { duration: 70 }), withTiming(6, { duration: 70 }), withTiming(0, { duration: 60 })));
  });
  useEffect(() => {
    if (!error || error === lastError.current) return;
    lastError.current = error;
    rejected();
  }, [error]);
  // The parent finished with the PIN but kept it on screen: let Delete work again.
  useEffect(() => {
    if (!disabled) sent.current = false;
  }, [disabled]);
  // Submit a beat after the last dot fills, so it's seen. Leaving the screen first cancels it.
  const complete = useEffectEvent((value: string) => onComplete(value));
  useEffect(() => {
    if (pin.length < length) return;
    const t = setTimeout(() => complete(pin), 120);
    return () => clearTimeout(t);
  }, [pin, length]);
  const dotsStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
  const press = (k: string) => {
    if (disabled || sent.current) return;
    if (k === "bio") return onBiometric?.();
    if (!k) return;
    if (k === "⌫") {
      haptic("pin.digit");
      if (!pin) return;
      setPin(pin.slice(0, -1));
      sayProgress(pin.length - 1, length);
      return;
    }
    if (pin.length >= length) return;
    haptic("pin.digit");
    const next = pin + k;
    setPin(next);
    // The full PIN isn't announced: the screen's status line ("Checking your PIN") takes over.
    if (next.length === length) sent.current = true;
    else sayProgress(next.length, length);
  };
  return (
    <View style={{ gap: 28 }}>
      <Animated.View style={[styles.dots, dotsStyle]} accessible accessibilityLabel={`${pin.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, i) => (
          <PinDot key={i} filled={i < pin.length} />
        ))}
      </Animated.View>
      <KeyGrid keys={["1", "2", "3", "4", "5", "6", "7", "8", "9", biometric ? "bio" : "", "0", "⌫"]} onKey={press} biometric={biometric ?? null} />
    </View>
  );
}

/** Screen readers hear how many digits are in, never which ones. */
function sayProgress(count: number, length: number) {
  AccessibilityInfo.announceForAccessibility(`${count} of ${length} digits entered`);
}

function PinDot({ filled }: { filled: boolean }) {
  const { c } = useTheme();
  return <View style={[styles.dot, { borderColor: filled ? c.accent : c.borderStrong, backgroundColor: filled ? c.accent : "transparent" }]} />;
}

function KeyGrid({ keys, onKey, biometric = null }: { keys: string[]; onKey: (k: string) => void; biometric?: "face" | "finger" | null }) {
  const { c } = useTheme();
  return (
    <View style={styles.grid}>
      {keys.map((k, i) => {
        if (!k) return <View key={i} style={styles.key} />;
        const label = k === "⌫" ? "Delete" : k === "bio" ? (biometric === "face" ? "Use Face ID" : "Use fingerprint") : k === "." ? "Decimal point" : k;
        return (
          <Press key={i} accessibilityLabel={label} onPress={() => onKey(k)} scaleTo={0.92} style={[styles.key, { backgroundColor: k === "⌫" || k === "bio" ? "transparent" : c.surface, borderRadius: radius.md }]}>
            {k === "⌫" ? (
              <BackspaceIcon size={28} color={c.text} />
            ) : k === "bio" ? (
              biometric === "face" ? (
                <ScanSmileyIcon size={30} color={c.accent} />
              ) : (
                <FingerprintIcon size={30} color={c.accent} />
              )
            ) : (
              <Txt v="headline" style={{ fontFamily: "Figtree_600SemiBold" }}>
                {k}
              </Txt>
            )}
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: layout.keyGap, justifyContent: "space-between" },
  key: { width: "31.8%", height: layout.keyHeight, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 18 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
});
