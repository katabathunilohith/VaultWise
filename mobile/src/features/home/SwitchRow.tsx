import { StyleSheet, Switch, View } from "react-native";
import type { Icon } from "@/components/icons";
import { Press, Txt } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { layout, useTheme } from "@/theme";

/**
 * A switch row where the whole row is the control (≥56 pt), exposed to screen readers as a
 * switch with its on/off state. Used instead of the kit's ToggleRow, whose Switch sits inside an
 * `accessible` View with no action, so VoiceOver and TalkBack can focus the row but can't flip it.
 * The visual Switch ignores touches so a tap never toggles twice.
 */
export function SwitchRow({
  title,
  subtitle,
  value,
  onChange,
  icon: IconCmp,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: Icon;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const flip = () => {
    const next = !value;
    haptic(next ? "toggle.on" : "toggle.off");
    onChange(next);
  };
  return (
    <Press
      onPress={flip}
      scaleTo={0.99}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={subtitle}
      style={styles.row}
    >
      {IconCmp ? <IconCmp size={24} color={c.text} /> : null}
      <View style={styles.text}>
        <Txt v="labelL">{title}</Txt>
        {subtitle ? (
          <Txt v="bodyM" color="textMuted">
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <View style={styles.switch} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch value={value} trackColor={{ false: c.border, true: c.accentFill }} thumbColor="#FFFFFF" ios_backgroundColor={c.border} />
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: layout.rowMin, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },
  text: { flex: 1, gap: 2 },
  switch: { pointerEvents: "none" },
});
