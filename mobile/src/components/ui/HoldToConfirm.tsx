import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { createHold } from "@/lib/haptics";
import { layout, radius, useTheme } from "@/theme";
import { Txt } from "./Txt";

type Hold = ReturnType<typeof createHold>;
type Timer = { current: ReturnType<typeof setTimeout> | null };

/**
 * Press and hold to confirm an irreversible money movement (Pay with Vaultwise, Tier 2 release).
 * Deliberate friction instead of a one-tap at the easiest-to-reach spot. The fill and a rising
 * haptic ramp share the same 800 ms curve; release early to cancel. Screen-reader users get a
 * double-tap "activate" action instead of a hold.
 */
export function HoldToConfirm({
  label,
  onConfirm,
  disabled,
  commitHaptic = true,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Set false when the money only commits later (e.g. after a PIN step), and play irreversible.commit then. */
  commitHaptic?: boolean;
}) {
  const { c } = useTheme();
  const [hold] = useState(createHold);
  const progress = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The props as of the last render. The timer fires 800 ms after press-in, and by then the
  // parent may have re-rendered with a new handler or turned the control off.
  const latest = useRef({ onConfirm, disabled, commitHaptic });
  useEffect(() => {
    latest.current = { onConfirm, disabled, commitHaptic };
  });
  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  const begin = () => {
    if (disabled || timer.current) return;
    hold.start();
    progress.set(withTiming(1, { duration: hold.durationMs, easing: Easing.bezier(0.3, 0, 0.8, 0.15) }));
    timer.current = setTimeout(() => {
      timer.current = null;
      const now = latest.current;
      if (now.disabled) {
        hold.cancel();
        emptyFill(progress);
        return;
      }
      if (now.commitHaptic) hold.commit();
      else hold.stop();
      now.onConfirm();
    }, hold.durationMs);
  };
  const end = () => {
    if (cancelHold(timer, hold)) emptyFill(progress);
  };

  // Turned off mid-hold (e.g. the balance changed): drop the hold instead of confirming.
  useEffect(() => {
    if (disabled && cancelHold(timer, hold)) emptyFill(progress);
  }, [disabled, hold, progress]);
  // Gone mid-hold (Back, or the payment expired): onPressOut never comes, so cancel here.
  useEffect(
    () => () => {
      cancelHold(timer, hold);
    },
    [hold],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold to confirm. With a screen reader, double-tap to confirm."
      accessibilityState={{ disabled: !!disabled }}
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName !== "activate" || disabled) return;
        if (commitHaptic) hold.commit();
        onConfirm();
        // Only when this is the last step. Otherwise a PIN or Face ID check still follows, and the
        // next screen says what to do.
        if (commitHaptic) AccessibilityInfo.announceForAccessibility("Confirmed");
      }}
      onPressIn={begin}
      onPressOut={end}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8 }}
      style={[styles.base, { backgroundColor: c.surfaceRaised, borderColor: c.primary, opacity: disabled ? 0.45 : 1 }]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: c.primary }, fill]} />
      <View style={styles.labelWrap} pointerEvents="none">
        <Txt v="labelL" color="text" align="center">
          {label}
        </Txt>
      </View>
    </Pressable>
  );
}

/** Stops a hold in progress. True if there was one. */
function cancelHold(timer: Timer, hold: Hold) {
  if (!timer.current) return false;
  clearTimeout(timer.current);
  timer.current = null;
  hold.cancel();
  return true;
}

function emptyFill(progress: SharedValue<number>) {
  cancelAnimation(progress);
  progress.set(withTiming(0, { duration: 200 }));
}

const styles = StyleSheet.create({
  // A minimum, not a fixed height: with large text the label wraps and the control grows, so the
  // amount being confirmed is never cut off. overflow only clips the fill to the corners.
  base: { minHeight: layout.ctaHeight, borderRadius: radius.lg, overflow: "hidden", borderWidth: 2, justifyContent: "center" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, opacity: 0.35 },
  // Padding sits here, not on the Pressable, so the fill's percentage width spans the whole control.
  labelWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 20 },
});
