import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ChatCircleDotsIcon } from "@/components/icons";
import { Press, ProfileAvatar, Txt } from "@/components/ui";
import { layout, radius, useTheme } from "@/theme";

/**
 * Tab-root header (R6): the avatar top-leading opens Profile & settings; "Ask" top-trailing opens
 * the assistant. Its in-content twin is the Ask quick action.
 */
export function HomeHeader() {
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      <ProfileAvatar />
      <Press
        accessibilityLabel="Ask the assistant"
        onPress={() => router.push("/assistant")}
        hitSlop={8}
        style={[styles.ask, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}
      >
        <ChatCircleDotsIcon size={20} color={c.text} />
        <Txt v="labelM" maxFontSizeMultiplier={1.3}>
          Ask
        </Txt>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.hit, marginTop: 4 },
  avatar: {
    width: layout.hit,
    height: layout.hit,
    borderRadius: layout.hit / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  ask: {
    minHeight: layout.hit,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
