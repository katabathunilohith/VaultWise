import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { WarningCircleIcon } from "@/components/icons";
import { Button, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { space, useTheme } from "@/theme";

/**
 * Load failure for the Invest tab. The kit's ErrorState shows a 3D object, which calm-core
 * screens never use, so this keeps to an icon, a plain reason, a retry and a person to ask.
 */
export function CalmError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <WarningCircleIcon size={40} color={c.textMuted} />
      <Txt v="titleL" align="center" accessibilityRole="header">
        This didn&apos;t load
      </Txt>
      <Txt v="bodyM" color="textMuted" align="center">
        {`${errorMessage(error)} Your investments haven't changed.`}
      </Txt>
      <View style={styles.actions}>
        <Button label="Try again" variant="tonal" size="md" onPress={onRetry} />
        <Button label="Ask a person" variant="ghost" size="sm" onPress={() => router.push("/support")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  actions: { alignItems: "center", gap: space.xs, marginTop: space.xs },
});
