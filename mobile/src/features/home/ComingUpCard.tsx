import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { PauseIcon } from "@/components/icons";
import { Card, Divider, Skeleton, Txt } from "@/components/ui";
import type { Dashboard } from "@/lib/api/types";
import { space, useTheme } from "@/theme";
import { MoveLine } from "./MoveLine";
import { useHomePrefs } from "./prefs";
import { SeeAllHeader } from "./SeeAllHeader";
import { useUpcoming } from "./useUpcoming";

/**
 * The next automatic moves, before they happen (DESIGN.md §7.4: no surprise money movement).
 * "See all" opens the full 30-day list with skip and pause controls.
 */
export function ComingUpCard({ dashboard, now }: { dashboard: Dashboard; now: number }) {
  const { c } = useTheme();
  const prefs = useHomePrefs();
  const { moves, sipPending } = useUpcoming(dashboard, now);
  const next = moves.slice(0, 3);
  const more = moves.length - next.length;
  return (
    <View style={styles.wrap}>
      <SeeAllHeader title="Coming up" label="See all coming up" onPress={() => router.push("/upcoming")} />
      <Card>
        {prefs.paused ? (
          <View style={styles.paused} accessible accessibilityLabel="Auto-saves are paused on this phone. Open See all to turn them back on.">
            <PauseIcon size={22} color={c.text} weight="fill" />
            <View style={styles.fill}>
              <Txt v="labelL">Auto-saves are paused</Txt>
              <Txt v="bodyM" color="textMuted">
                Paused on this phone. Open See all to turn them back on.
              </Txt>
            </View>
          </View>
        ) : next.length === 0 && sipPending ? (
          <View style={styles.loading} accessibilityLabel="Loading what's coming up">
            <Skeleton height={56} />
          </View>
        ) : next.length === 0 ? (
          <View style={styles.empty}>
            <Txt v="labelL">Nothing scheduled</Txt>
            <Txt v="bodyM" color="textMuted">
              Set a rule on any vault and it shows here before it runs.
            </Txt>
          </View>
        ) : (
          <>
            {next.map((m, i) => (
              <View key={m.key}>
                {i > 0 ? <Divider /> : null}
                <MoveLine move={m} currency={dashboard.currency} now={now} state={prefs.skipped[m.key] ? "skipped" : undefined} />
              </View>
            ))}
            {more > 0 ? (
              <Txt v="caption" color="textMuted">
                {`${more} more in the next 30 days`}
              </Txt>
            ) : null}
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  paused: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  fill: { flex: 1, gap: 2 },
  empty: { gap: 2 },
  loading: { gap: space.xs },
});
