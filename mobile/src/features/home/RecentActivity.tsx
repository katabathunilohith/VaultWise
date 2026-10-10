import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Card, Divider, Skeleton, Txt } from "@/components/ui";
import { useActivity } from "@/lib/api/hooks";
import type { Dashboard } from "@/lib/api/types";
import { space } from "@/theme";
import { recentMoney } from "./activity-model";
import { ActivityRow } from "./ActivityRow";
import { SeeAllHeader } from "./SeeAllHeader";

/**
 * The last five money moves, from the full activity feed (it names the vault). If that feed
 * can't load, the dashboard's own recent list is used instead, so this never goes blank.
 */
export function RecentActivity({ dashboard, now }: { dashboard: Dashboard; now: number }) {
  const q = useActivity();
  const currency = q.data?.currency ?? dashboard.currency;
  const items = q.isPending ? [] : recentMoney(q.data, dashboard.recent);
  return (
    <View style={styles.wrap}>
      <SeeAllHeader title="Recent activity" label="See all activity" onPress={() => router.push("/activity")} />
      <Card>
        {q.isPending ? (
          <View style={{ gap: space.sm }} accessibilityLabel="Loading recent activity">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={44} />
            ))}
          </View>
        ) : items.length === 0 ? (
          <View style={{ gap: 2 }}>
            <Txt v="labelL">Nothing yet</Txt>
            <Txt v="bodyM" color="textMuted">
              Money you add to a vault shows up here.
            </Txt>
          </View>
        ) : (
          items.map((it, i) => (
            <View key={it.id}>
              {i > 0 ? <Divider /> : null}
              <ActivityRow item={it} currency={currency} now={now} />
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
});
