import { I18nManager, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeftIcon } from "@/components/icons";
import { Press } from "@/components/ui";
import { layout, space, useTheme } from "@/theme";

/** Pushed-screen header: Back, top-leading (44 pt). The title sits in the content below. */
export function SupportHeader() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <Press accessibilityLabel="Back" onPress={back} hitSlop={8} style={[styles.btn, { backgroundColor: c.surfaceRaised }]}>
        <ArrowLeftIcon size={22} color={c.text} weight="bold" mirrored={I18nManager.isRTL} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: layout.gutter, paddingBottom: space.xs },
  btn: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
});
