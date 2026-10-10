import { StyleSheet, View } from "react-native";
import { Txt } from "@/components/ui";
import { useTheme } from "@/theme";
import { initials } from "./format";

/** Merchant initials in a neutral circle (calm core: no logos we can't verify, no colour coding). */
export function MerchantAvatar({ name, size = 48 }: { name: string; size?: number }) {
  const { c } = useTheme();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.surfaceRaised, borderColor: c.border }]}
    >
      <Txt v={size >= 56 ? "titleL" : "labelL"} maxFontSizeMultiplier={1.15}>
        {initials(name)}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth * 2 },
});
