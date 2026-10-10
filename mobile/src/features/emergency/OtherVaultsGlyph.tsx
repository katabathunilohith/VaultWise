import { StyleSheet, View } from "react-native";
import { VaultIcon } from "@/components/icons";
import { useTheme } from "@/theme";

/** Neutral tile for "your other vaults" (Tier 2) — several categories, so no single category colour. */
export function OtherVaultsGlyph({ size = 36 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <View
      accessibilityLabel="Your other vaults"
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * 0.32, backgroundColor: c.surfaceRaised, borderColor: c.border },
      ]}
    >
      <VaultIcon size={size * 0.55} color={c.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
});
