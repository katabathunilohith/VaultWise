import { StyleSheet, View } from "react-native";
import { HourglassIcon, WarningCircleIcon } from "@/components/icons";
import { Button, Txt } from "@/components/ui";
import { errorMessage, isRecoveryHold, ON_HOLD } from "@/lib/api/errors"; // identity: ON_HOLD
import { space, useTheme } from "@/theme";

/** A card-sized error: what didn't load, why, and a retry. For secondary cards on a screen that otherwise loaded. */
export function InlineError({ what, error, onRetry }: { what: string; error: unknown; onRetry: () => void }) {
  const { c } = useTheme();
  // identity: a recovery request is waiting for a person; this card opens after.
  if (isRecoveryHold(error))
    return (
      <View style={styles.row} accessible accessibilityLabel={`${what}. ${ON_HOLD.title}.`}>
        <HourglassIcon size={20} color={c.textMuted} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="labelM">{what}</Txt>
          <Txt v="caption" color="textMuted">
            {ON_HOLD.title}
          </Txt>
        </View>
      </View>
    );
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
