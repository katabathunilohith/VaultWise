import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, Easing } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { radius, useTheme } from "@/theme";
import { useReduceMotion } from "./hooks";

const ACircle = Animated.createAnimatedComponent(Circle);

/**
 * Goal-gradient progress bar with 25/50/75% ticks (Kivetz et al. 2006: people speed up near
 * goals; seeing progress alone helps). Fill animates on change.
 */
export function ProgressBar({
  value,
  color,
  height = 8,
  ticks = true,
  label,
  trackColor,
}: {
  value: number;
  color: string;
  height?: number;
  ticks?: boolean;
  label?: string;
  /** Override the track (e.g. a translucent ink track on a vivid category fill). */
  trackColor?: string;
}) {
  const { c } = useTheme();
  const reduce = useReduceMotion();
  const w = useSharedValue(0);
  const v = Math.max(0, Math.min(1, value));
  useEffect(() => {
    w.value = reduce ? v : withTiming(v, { duration: 600, easing: Easing.bezier(0.05, 0.7, 0.1, 1) });
  }, [v, reduce, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={[styles.track, { height, backgroundColor: trackColor ?? c.border, borderRadius: radius.pill }]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: color, borderRadius: radius.pill }, fill]} />
      {ticks
        ? [0.25, 0.5, 0.75].map((t) => (
            <View key={t} style={[styles.tick, { left: `${t * 100}%`, backgroundColor: v >= t ? c.ink : c.bg, opacity: v >= t ? 0.35 : 0.6 }]} />
          ))
        : null}
    </View>
  );
}

/** Ring progress (vault detail hero, milestones). */
export function ProgressRing({ value, size = 120, stroke = 12, color, children }: { value: number; size?: number; stroke?: number; color: string; children?: React.ReactNode }) {
  const { c } = useTheme();
  const reduce = useReduceMotion();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = useSharedValue(0);
  const v = Math.max(0, Math.min(1, value));
  useEffect(() => {
    p.value = reduce ? v : withTiming(v, { duration: 800, easing: Easing.bezier(0.05, 0.7, 0.1, 1) });
  }, [v, reduce, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - p.value) }));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.border} strokeWidth={stroke} fill="none" />
        <ACircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          animatedProps={props}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: "100%", overflow: "hidden", position: "relative" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  tick: { position: "absolute", top: 0, bottom: 0, width: 2, marginLeft: -1 },
});
