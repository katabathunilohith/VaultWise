import type { StyleProp, ViewStyle } from "react-native";
import { InfoIcon } from "@/components/icons";
import { useTheme } from "@/theme";
import { Press } from "./Press";

/**
 * A small "i" in a circle that opens more detail. 32 pt to look at, 44 pt to tap (hitSlop).
 * Give it a label that says what opens, e.g. "Health rules".
 */
export function InfoButton({
  label,
  onPress,
  color,
  style,
}: {
  label: string;
  onPress: () => void;
  /** Icon colour; defaults to the muted text colour. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      hapticOnPressIn="select.tick"
      onPress={onPress}
      hitSlop={6}
      scaleTo={0.9}
      style={[{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }, style]}
    >
      <InfoIcon size={24} color={color ?? c.textMuted} weight="bold" />
    </Press>
  );
}
