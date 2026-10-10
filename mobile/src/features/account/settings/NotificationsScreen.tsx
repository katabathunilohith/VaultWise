import { StyleSheet, View } from "react-native";
import { BellIcon, CoinsIcon, GiftIcon, LockIcon, MoonIcon, ShieldCheckIcon, type Icon } from "@/components/icons";
import { Banner, Chip, ListRow, StatusPill, ToggleRow } from "@/components/ui";
import { space } from "@/theme";
import { Group } from "../controls";
import { Page } from "../layout";
import { QUIET_WINDOWS, setNotificationPrefs, useNotificationPrefs } from "./notificationPrefs";

/** What Vaultwise may notify about. Money moves and security are always on. */
export function NotificationsScreen() {
  const prefs = useNotificationPrefs();
  return (
    <Page title="Notifications">
      <Banner
        tone="info"
        title="Not sent in Practice mode yet"
        body="Push notifications aren't switched on in this build. Your choices are saved on this phone and used once they are."
      />

      <Group title="Always on" note="So you always know when money moves or someone tries to get in.">
        <AlwaysOn icon={CoinsIcon} title="Money moves" subtitle="Money in or out of a vault, payments and refunds." />
        <AlwaysOn icon={ShieldCheckIcon} title="Security" subtitle="PIN and app lock changes, and limit changes." />
      </Group>

      <Group title="Your choice">
        <ToggleRow
          icon={BellIcon}
          title="Reminders before auto-saves"
          subtitle="A heads-up the day before money moves on a schedule, so you can skip it."
          value={prefs.reminders}
          onChange={(v) => setNotificationPrefs({ reminders: v })}
        />
        <ToggleRow
          icon={GiftIcon}
          title="Tips & offers"
          subtitle="Ideas for saving and news about Vaultwise. Off unless you turn it on."
          value={prefs.tips}
          onChange={(v) => setNotificationPrefs({ tips: v })}
        />
      </Group>

      <Group title="Quiet hours" note={prefs.quiet ? "Security alerts still come through, any time." : undefined}>
        <ToggleRow
          icon={MoonIcon}
          title="Quiet hours"
          subtitle="Hold everything but security alerts overnight."
          value={prefs.quiet}
          onChange={(v) => setNotificationPrefs({ quiet: v })}
        />
        {prefs.quiet ? (
          <View style={styles.windows} accessibilityRole="radiogroup" accessibilityLabel="Quiet hours window">
            {QUIET_WINDOWS.map((w) => (
              <Chip key={w.value} label={w.label} selected={prefs.quietWindow === w.value} onPress={() => setNotificationPrefs({ quietWindow: w.value })} />
            ))}
          </View>
        ) : null}
      </Group>
    </Page>
  );
}

function AlwaysOn({ icon, title, subtitle }: { icon: Icon; title: string; subtitle: string }) {
  return (
    <ListRow
      icon={icon}
      title={title}
      subtitle={subtitle}
      accessibilityLabel={`${title}: always on. ${subtitle}`}
      trailing={<StatusPill tone="neutral" label="Always on" icon={LockIcon} />}
    />
  );
}

const styles = StyleSheet.create({
  windows: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, paddingBottom: space.md, paddingTop: space.xxs },
});
