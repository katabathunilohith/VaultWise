import { StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { BellIcon } from "@/components/icons";
import { Press, Txt } from "@/components/ui";
import { layout, radius, useTheme } from "@/theme";
import { ALERTS_ENABLED, ALERTS_ROUTE } from "./config";
import { useAlerts } from "./hooks";
import { badgeText, bellLabel } from "./model";
import { usePushRegistration } from "./push";

/**
 * The bell on Home's header (R6: a trailing item; its in-content twin is Settings → Alerts): the
 * unread count, and the way into the inbox. It also starts push registration on live data.
 */
export function AlertsBell() {
  usePushRegistration();
  const { c } = useTheme();
  const alerts = useAlerts({ enabled: ALERTS_ENABLED });
  if (!ALERTS_ENABLED) return null;
  const unread = alerts.data?.unread ?? 0;
  return (
    <Press
      accessibilityLabel={bellLabel(unread)}
      accessibilityHint="Opens your alerts"
      onPress={() => router.push(ALERTS_ROUTE as Href)}
      hitSlop={8}
      style={[styles.bell, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}
    >
      <BellIcon size={20} color={c.text} weight={unread > 0 ? "fill" : "regular"} />
      {unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: c.accentFill, borderColor: c.bg }]} importantForAccessibility="no-hide-descendants">
          <Txt v="micro" color="onAccentFill" maxFontSizeMultiplier={1.2}>
            {badgeText(unread)}
          </Txt>
        </View>
      ) : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: layout.hit,
    height: layout.hit,
    borderRadius: layout.hit / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
