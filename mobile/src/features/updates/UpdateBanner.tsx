import { StyleSheet, View } from "react-native";
import { ArrowsClockwiseIcon, XIcon } from "@/components/icons";
import { Button, Press, Txt } from "@/components/ui";
import { layout, space, useTheme } from "@/theme";

interface Props {
  /** The status-bar inset: the banner is the top of the window. */
  top: number;
  restarting: boolean;
  failed: boolean;
  onRestart: () => void;
  onDismiss: () => void;
}

/** "A new version is ready", with Restart, across the top of the main tabs. */
export function UpdateBanner({ top, restarting, failed, onRestart, onDismiss }: Props) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="summary" style={[styles.bar, { paddingTop: top + space.xs, backgroundColor: c.accentSoft, borderBottomColor: c.border }]}>
      <ArrowsClockwiseIcon size={20} color={c.accent} weight="bold" />
      <View style={styles.text}>
        <Txt v="labelM" numberOfLines={1}>
          A new version is ready
        </Txt>
        <Txt v="caption" color="textMuted" numberOfLines={2}>
          {failed ? "Couldn't restart. Close and reopen the app to update." : "Restart now, or it applies next time you open the app."}
        </Txt>
      </View>
      <Button label="Restart" size="sm" onPress={onRestart} loading={restarting} accessibilityHint="Closes and reopens Vaultwise on the new version" />
      <Press onPress={onDismiss} accessibilityLabel="Not now" accessibilityHint="Hides this until the app restarts" style={styles.close}>
        <XIcon size={18} color={c.textMuted} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: layout.gutter,
    paddingRight: space.xxs,
    paddingBottom: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 1 },
  close: { width: layout.hit, height: layout.hit, alignItems: "center", justifyContent: "center", marginLeft: -space.xxs },
});
