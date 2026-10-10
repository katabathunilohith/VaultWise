import { useEffect, useEffectEvent, type ReactNode } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Switch, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Image, type ImageSource } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { CaretRightIcon, type Icon } from "@/components/icons";
import { haptic, type TokenName } from "@/lib/haptics";
import { celebrate, layout, motion, radius, space, useTheme } from "@/theme";
import { spoken } from "./a11y";
import { useReduceMotion } from "./hooks";
import { Press } from "./Press";
import { Txt } from "./Txt";

/** List row: ≥56 pt, whole row tappable, leading icon, trailing value or chevron. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  icon: IconCmp,
  destructive,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  icon?: Icon;
  destructive?: boolean;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const inner = (
    <>
      {leading ?? (IconCmp ? <IconCmp size={24} color={destructive ? c.danger : c.text} /> : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="labelL" color={destructive ? "danger" : "text"}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt v="bodyM" color="textMuted" numberOfLines={2}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {trailing ?? (onPress ? <CaretRightIcon size={18} color={c.textMuted} /> : null)}
    </>
  );
  if (onPress)
    return (
      // The label replaces the row's texts for screen readers, so it carries the subtitle too.
      <Press onPress={onPress} scaleTo={0.99} accessibilityLabel={accessibilityLabel ?? spoken(title, subtitle)} style={styles.row}>
        {inner}
      </Press>
    );
  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel}>
      {inner}
    </View>
  );
}

/** Selectable chip (reasons, filters). ≥56 pt in grids; plays a selection tick. */
export function Chip({ label, selected, onPress, icon: IconCmp, tall }: { label: string; selected?: boolean; onPress: () => void; icon?: Icon; tall?: boolean }) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      hapticOnPressIn="select.tick"
      onPress={onPress}
      style={[
        styles.chip,
        {
          minHeight: tall ? 56 : 44,
          backgroundColor: selected ? c.accentFill : c.surface,
          borderColor: selected ? c.accentFill : c.border,
        },
      ]}
    >
      {IconCmp ? <IconCmp size={20} color={selected ? c.onAccentFill : c.text} weight={selected ? "fill" : "regular"} /> : null}
      <Txt v="labelM" color={selected ? c.onAccentFill : "text"} numberOfLines={2}>
        {label}
      </Txt>
    </Press>
  );
}

/** Segmented control (tap only; switching views at the top is fine, it's not a frequent action). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: c.surfaceRaised }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            hapticOnPressIn={on ? null : "select.tick"}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, on && { backgroundColor: c.surface, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth }]}
          >
            <Txt v="labelM" color={on ? "text" : "textMuted"}>
              {o.label}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}

/**
 * Settings toggle row with distinct on/off haptics. The whole row (at least 56 pt) toggles (R10), and
 * it is a single "switch" element for VoiceOver/TalkBack so screen-reader users can flip it.
 */
export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  icon: IconCmp,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: Icon;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const flip = () => {
    if (disabled) return;
    haptic(!value ? "toggle.on" : "toggle.off");
    onChange(!value);
  };
  return (
    <Press
      onPress={flip}
      scaleTo={0.99}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      style={[styles.row, disabled && { opacity: 0.5 }]}
    >
      {IconCmp ? <IconCmp size={24} color={c.text} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="labelL">{title}</Txt>
        {subtitle ? (
          <Txt v="bodyM" color="textMuted" numberOfLines={3}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch value={value} trackColor={{ false: c.border, true: c.accentFill }} thumbColor="#FFFFFF" ios_backgroundColor={c.border} />
      </View>
    </Press>
  );
}

/**
 * Saving celebrations only (goal milestones, vault created, first verified payout). Never for
 * money going out or trading. Short, skippable by tap, static under Reduce Motion.
 * Haptic: goal.milestone / goal.reached by default; pass `haptic` for another saving moment
 * (e.g. "vault.locked"), or null for none.
 */
export function Celebration({
  visible,
  image,
  title,
  body,
  onDone,
  kind = "milestone",
  haptic: hapticToken,
}: {
  visible: boolean;
  image: ImageSource | number;
  title: string;
  body?: string;
  onDone: () => void;
  kind?: "milestone" | "reached";
  haptic?: TokenName | null;
}) {
  const reduce = useReduceMotion();
  const s = useSharedValue(0.6);
  const o = useSharedValue(0);
  const token = hapticToken === undefined ? (kind === "reached" ? "goal.reached" : "goal.milestone") : hapticToken;
  const message = spoken(title, body);
  // Effect events read the latest props without re-running the effect, so an inline onDone
  // never re-fires the haptic or restarts the timer.
  const finish = useEffectEvent(() => onDone());
  const begin = useEffectEvent(() => {
    if (token) haptic(token);
    o.set(withTiming(1, { duration: motion.base }));
    s.set(reduce ? 1 : withSpring(1, motion.springCelebrate));
    // accessibilityLiveRegion below is Android only.
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message);
  });
  useEffect(() => {
    if (!visible) {
      // Reset while hidden, so the next show mounts the overlay transparent and small. Resetting
      // on show would be too late: the overlay would paint one frame at full opacity first.
      o.set(0);
      s.set(0.6);
      return;
    }
    begin();
    const t = setTimeout(() => finish(), 2600);
    return () => clearTimeout(t);
  }, [visible, o, s]);
  useEffect(() => {
    if (visible && reduce) s.set(1);
  }, [visible, reduce, s]);
  const imgStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  const wrap = useAnimatedStyle(() => ({ opacity: o.get() }));
  if (!visible) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.celebrate, wrap]} accessibilityViewIsModal accessibilityLiveRegion="assertive">
      <LinearGradient colors={[...celebrate]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: 0.92 }]} />
      <Press onPress={onDone} accessibilityLabel={spoken(message, "Tap to continue")} style={styles.celebrateInner}>
        <Animated.View style={imgStyle}>
          <Image source={image} style={{ width: 160, height: 160 }} contentFit="contain" />
        </Animated.View>
        <Txt v="displayM" color="ink" align="center">
          {title}
        </Txt>
        {body ? (
          <Txt v="bodyL" color="ink" align="center">
            {body}
          </Txt>
        ) : null}
        <Txt v="caption" color="ink" align="center" style={{ opacity: 0.7, marginTop: space.md }}>
          Tap to continue
        </Txt>
      </Press>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: layout.rowMin, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth * 2 },
  seg: { flexDirection: "row", padding: 4, borderRadius: radius.md, gap: 4 },
  segItem: { flex: 1, minHeight: layout.hit, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  celebrate: { zIndex: 100, alignItems: "center", justifyContent: "center" },
  celebrateInner: { alignItems: "center", gap: 12, padding: 32 },
});
