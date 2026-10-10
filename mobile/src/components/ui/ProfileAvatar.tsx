import { StyleSheet } from "react-native";
import { router } from "expo-router";
import { UserIcon } from "@/components/icons";
import { useMe } from "@/lib/api/hooks";
import { layout, useTheme } from "@/theme";
import { Press } from "./Press";
import { Txt } from "./Txt";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

/**
 * The top-leading avatar on every tab root: the way into Profile & settings (R6). One component so
 * it looks and behaves the same on every tab.
 */
export function ProfileAvatar() {
  const { c } = useTheme();
  const me = useMe();
  const letters = me.data?.onboarded ? initials(me.data.user.name) : "";
  return (
    <Press
      accessibilityLabel="Profile and settings"
      onPress={() => router.push("/settings")}
      hitSlop={6}
      style={[styles.avatar, { backgroundColor: c.accentSoft, borderColor: c.border }]}
    >
      {letters ? (
        <Txt v="labelM" color="text" maxFontSizeMultiplier={1.2} accessible={false}>
          {letters}
        </Txt>
      ) : (
        <UserIcon size={22} color={c.text} />
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: layout.hit,
    height: layout.hit,
    borderRadius: layout.hit / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
