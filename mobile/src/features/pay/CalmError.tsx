import { StyleSheet, View } from "react-native";
import { WarningCircleIcon } from "@/components/icons";
import { Button, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { space, useTheme } from "@/theme";

/**
 * Error state for calm-core screens. Same job as the kit's ErrorState (what went wrong, how to
 * retry) but with a plain icon instead of a 3D object, which calm-core screens don't use.
 */
export function CalmError({ title, error, onRetry }: { title: string; error: unknown; onRetry?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <WarningCircleIcon size={32} color={c.textMuted} />
      <Txt v="titleM" align="center">
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
  wrap: { alignItems: "center", gap: space.xs, paddingVertical: space.xl, paddingHorizontal: space.md },
});
