import { useEffect } from "react";
import { StyleSheet, View, type DimensionValue } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Image } from "expo-image";
import { HourglassIcon, WarningCircleIcon } from "@/components/icons";
import { errorMessage, isRecoveryHold, ON_HOLD } from "@/lib/api/errors"; // identity: ON_HOLD
import { emoji3d } from "@/lib/categories";
import { radius, space, useTheme } from "@/theme";
import { Button } from "./Button";
import { useReduceMotion } from "./hooks";
import { Txt } from "./Txt";

export function Skeleton({ height = 18, width = "100%", r = radius.sm }: { height?: number; width?: DimensionValue; r?: number }) {
  const { c } = useTheme();
  const reduce = useReduceMotion();
  const o = useSharedValue(0.5);
  useEffect(() => {
    // Reduce Motion is only known after mount, so a pulse may already be running: stop it.
    if (reduce) {
      cancelAnimation(o);
      o.set(0.75);
      return;
    }
    o.set(0.5);
    o.set(withRepeat(withTiming(1, { duration: 700 }), -1, true));
    return () => cancelAnimation(o);
  }, [reduce, o]);
  const s = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: c.surfaceRaised }, s]} />;
}

/** Loading placeholder for a typical screen: hero + three rows. */
export function ScreenSkeleton() {
  return (
    <View style={{ gap: space.lg, paddingTop: space.lg }} accessible accessibilityRole="progressbar" accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      <Skeleton height={20} width="40%" />
      <Skeleton height={56} width="70%" />
      <Skeleton height={120} r={radius.lg} />
      <Skeleton height={72} r={radius.lg} />
      <Skeleton height={72} r={radius.lg} />
    </View>
  );
}

/** A quieter second action on an error, e.g. "Ask a person". */
export interface ErrorAction {
  label: string;
  onPress: () => void;
}

/**
 * Errors explain what went wrong and how to fix it — no apologies, no vagueness.
 * `variant="calm"` is for calm-core screens (money out, verification, emergency, invest, limits,
 * settings), which never show 3D objects (DESIGN.md §2): a plain warning icon instead.
 */
export function ErrorState({
  error,
  title = "This didn't load",
  onRetry,
  footnote,
  secondaryAction,
  variant = "illustrated",
  iconSize = 32,
  bareIcon = false,
  compact = false,
  heading = false,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  /** Said after the reason, e.g. what didn't change. */
  footnote?: string;
  /** Shown under "Try again", the two stacked close together. */
  secondaryAction?: ErrorAction;
  variant?: "illustrated" | "calm";
  /** Calm only: the warning icon's size. */
  iconSize?: number;
  /** Calm only: the icon without its raised disc. */
  bareIcon?: boolean;
  /** Smaller title and tighter spacing, for an error inside part of a screen. */
  compact?: boolean;
  /** Announces the title as a heading. */
  heading?: boolean;
}) {
  const { c } = useTheme();
  // identity: while a recovery request waits, most of the account can't be read yet. That's a
  // wait, not a failure: say when it opens, with no retry.
  if (isRecoveryHold(error))
    return (
      <View style={compact ? styles.compact : styles.center} accessibilityRole="summary">
        <View style={[styles.disc, { backgroundColor: c.surfaceRaised }]}>
          <HourglassIcon size={iconSize} color={c.textMuted} />
        </View>
        <Txt v={compact ? "titleM" : "titleL"} align="center" accessibilityRole={heading ? "header" : undefined}>
          {ON_HOLD.title}
        </Txt>
        <Txt v="bodyM" color="textMuted" align="center">
          {ON_HOLD.body}
        </Txt>
      </View>
    );
  const reason = errorMessage(error);
  const retry = onRetry ? <Button label="Try again" variant="tonal" size="md" onPress={onRetry} /> : null;
  return (
    <View style={compact ? styles.compact : styles.center} accessibilityRole="alert">
      {variant === "illustrated" ? (
        <Image source={emoji3d.umbrella} style={styles.object} contentFit="contain" />
      ) : bareIcon ? (
        <WarningCircleIcon size={iconSize} color={c.textMuted} />
      ) : (
        <View style={[styles.disc, { backgroundColor: c.surfaceRaised }]}>
          <WarningCircleIcon size={iconSize} color={c.textMuted} />
        </View>
      )}
      <Txt v={compact ? "titleM" : "titleL"} align="center" accessibilityRole={heading ? "header" : undefined}>
        {title}
      </Txt>
      <Txt v="bodyM" color="textMuted" align="center">
        {footnote ? `${reason} ${footnote}` : reason}
      </Txt>
      {secondaryAction ? (
        <View style={styles.actions}>
          {retry}
          <Button label={secondaryAction.label} variant="ghost" size="sm" onPress={secondaryAction.onPress} />
        </View>
      ) : (
        retry
      )}
    </View>
  );
}

export function EmptyState({ image, title, body, action, onAction }: { image?: number; title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.center}>
      {image ? <Image source={image} style={{ width: 96, height: 96 }} contentFit="contain" /> : null}
      <Txt v="titleL" align="center">
        {title}
      </Txt>
      {body ? (
        <Txt v="bodyM" color="textMuted" align="center">
          {body}
        </Txt>
      ) : null}
      {action && onAction ? <Button label={action} variant="primary" size="md" onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  compact: { alignItems: "center", gap: space.xs, paddingVertical: space.xl, paddingHorizontal: space.md },
  object: { width: 88, height: 88 },
  disc: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
  actions: { alignItems: "center", gap: space.xs, marginTop: space.xs },
});
