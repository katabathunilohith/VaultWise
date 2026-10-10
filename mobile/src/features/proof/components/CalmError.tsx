import { StyleSheet, View } from "react-native";
import { WarningCircleIcon } from "@/components/icons";
import { Button, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { space, useTheme } from "@/theme";

/**
 * Error state for calm-core screens. The kit's ErrorState shows a 3D object, which money-out and
 * verification screens must not (DESIGN.md §2). Same contract: what went wrong, and a retry.
 */
export function CalmError({ error, onRetry, title = "This didn't load" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
        <WarningCircleIcon size={32} color={c.textMuted} />
      </View>
      <Txt v="titleL" align="center">
        {title}
      </Txt>
      <Txt v="bodyM" color="textMuted" align="center">
        {errorMessage(error)}
      </Txt>
      {onRetry ? <Button label="Try again" variant="tonal" size="md" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
});
