import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { Icon } from "@/components/icons";
import type { TokenName } from "@/lib/haptics";
import { layout, radius, useTheme } from "@/theme";
import { useArmed } from "./hooks";
import { Press } from "./Press";
import { Txt } from "./Txt";

export type ButtonVariant = "primary" | "tonal" | "ghost" | "danger" | "dangerOutline" | "accent";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "lg" | "md" | "sm";
  icon?: Icon;
  disabled?: boolean;
  loading?: boolean;
  /** Ignore taps for 400 ms after mount (use on a step's main button). */
  armOnMount?: boolean;
  /** Touch-down haptic. Defaults to tap.primary for primary buttons, nothing otherwise. */
  haptic?: TokenName | null;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * Buttons. One filled primary per screen, 56 pt tall. Secondary actions are tonal or text.
 * Destructive actions are never the primary and never sit in the main-button slot of a flow.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  icon: IconCmp,
  disabled,
  loading,
  armOnMount,
  haptic: hapticToken,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { c, scheme } = useTheme();
  const armed = useArmed(armOnMount ? undefined : 0);
  const height = size === "lg" ? layout.ctaHeight : size === "md" ? layout.secondaryHeight : 40;
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.primary, fg: c.onPrimary },
    accent: { bg: c.accentFill, fg: c.onAccentFill },
    tonal: { bg: c.surfaceRaised, fg: c.text, border: c.border },
    ghost: { bg: "transparent", fg: c.accent },
    danger: { bg: c.danger, fg: scheme === "dark" ? c.ink : "#FFFFFF" },
    dangerOutline: { bg: "transparent", fg: c.danger, border: c.danger },
  };
  const p = palette[variant];
  const inactive = disabled || loading;
  const defaultHaptic: TokenName | null = variant === "primary" || variant === "accent" ? "tap.primary" : null;
  return (
    <Press
      testID={testID}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hapticOnPressIn={hapticToken === undefined ? defaultHaptic : hapticToken}
      hitSlop={size === "lg" ? { top: 8, bottom: 8 } : undefined}
      onPress={() => {
        if (!armed || inactive) return;
        onPress?.();
      }}
      style={[
        styles.base,
        {
          minHeight: size === "sm" ? 44 : height,
          paddingVertical: size === "sm" ? 6 : 8,
          paddingHorizontal: size === "sm" ? 14 : 20,
          backgroundColor: p.bg,
          borderColor: p.border ?? "transparent",
          borderWidth: p.border ? StyleSheet.hairlineWidth * 2 : 0,
          opacity: inactive && !loading ? 0.45 : 1,
          borderRadius: size === "lg" ? radius.lg : radius.md,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {IconCmp ? <IconCmp size={size === "sm" ? 18 : 22} color={p.fg} weight="bold" /> : null}
          <Txt v={size === "sm" ? "labelM" : "labelL"} color={p.fg} numberOfLines={2} align="center">
            {label}
          </Txt>
        </View>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
