import { StyleSheet, View } from "react-native";
import { ShieldCheckIcon } from "@/components/icons";
import { Txt } from "@/components/ui";
import { space, useTheme } from "@/theme";

/**
 * In place of the wallet while a person checks an account recovery (the server answers 403
 * recovery_restricted). Not an error: it says when the wallet comes back.
 */
export function WalletOnHold() {
  const { c } = useTheme();
  return (
    <View style={styles.wrap} accessible accessibilityRole="summary">
      <View style={[styles.disc, { backgroundColor: c.surfaceRaised }]}>
        <ShieldCheckIcon size={28} color={c.textMuted} />
      </View>
      <Txt v="titleM" align="center">
        Available once a person confirms it&apos;s you
      </Txt>
      <Txt v="bodyM" color="textMuted" align="center">
        Your account is being checked. Your wallet shows here again when that&apos;s done.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  disc: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
});
