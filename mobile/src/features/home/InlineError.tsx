import { StyleSheet, View } from "react-native";
import { WarningCircleIcon } from "@/components/icons";
import { Button, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { space, useTheme } from "@/theme";

/** A card-sized error: what didn't load, why, and a retry. For secondary cards on a screen that otherwise loaded. */
export function InlineError({ what, error, onRetry }: { what: string; error: unknown; onRetry: () => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={styles.row}>
        <WarningCircleIcon size={20} color={c.warning} weight="fill" />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="labelM">{`${what} didn't load`}</Txt>
          <Txt v="caption" color="textMuted">
            {errorMessage(error)}
          </Txt>
        </View>
      </View>
      <Button label="Try again" variant="tonal" size="sm" onPress={onRetry} style={{ alignSelf: "flex-start" }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
});
