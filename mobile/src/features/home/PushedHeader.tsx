import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeftIcon } from "@/components/icons";
import { Press, Txt } from "@/components/ui";
import { layout, useTheme } from "@/theme";

/** Header for pushed screens in the home area: Back top-leading (44 pt), centred title. Stays put while the list scrolls. */
export function PushedHeader({ title }: { title: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: c.bg, borderBottomColor: c.border }]}>
      <Press
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        hitSlop={12}
        style={[styles.btn, { backgroundColor: c.surfaceRaised }]}
      >
        <ArrowLeftIcon size={22} color={c.text} weight="bold" />
      </Press>
      <View style={styles.title}>
        <Txt v="titleM" align="center" numberOfLines={1} accessibilityRole="header">
          {title}
        </Txt>
      </View>
      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: layout.gutter, paddingBottom: 8, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  btn: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
  title: { flex: 1 },
  side: { width: layout.hit },
});
