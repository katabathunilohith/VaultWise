import { useEffect } from "react";
import { StyleSheet, View, type DimensionValue } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Image } from "expo-image";
import { WarningCircleIcon } from "@/components/icons";
import { errorMessage } from "@/lib/api/errors";
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

/**
 * Errors explain what went wrong and how to fix it — no apologies, no vagueness.
 * `calm` (calm-core screens: money out, verification, emergency, limits, settings) swaps the 3D
 * object for a plain icon. `onHuman` adds the "Talk to a person" path.
 */
export function ErrorState({
  error,
  onRetry,
  onHuman,
  calm,
  title = "This didn't load",
}: {
  error: unknown;
  onRetry?: () => void;
  onHuman?: () => void;
  calm?: boolean;
  title?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert">
      {calm ? (
        <View style={[styles.calmIcon, { backgroundColor: c.surfaceRaised }]}>
          <WarningCircleIcon size={30} color={c.textMuted} />
        </View>
      ) : (
        <Image source={emoji3d.umbrella} style={{ width: 88, height: 88 }} contentFit="contain" />
      )}
      <Txt v="titleL" align="center">
        {title}
      </Txt>
      <Txt v="bodyM" color="textMuted" align="center">
        {errorMessage(error)}
      </Txt>
      {onRetry ? <Button label="Try again" variant="tonal" size="md" onPress={onRetry} /> : null}
      {onHuman ? <Button label="Talk to a person" variant="ghost" size="md" onPress={onHuman} /> : null}
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
  calmIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
});
