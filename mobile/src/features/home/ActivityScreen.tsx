import { useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, Divider, EmptyState, ErrorState, PracticeBadge, ScreenSkeleton, Txt, useNow } from "@/components/ui";
import { useActivity } from "@/lib/api/hooks";
import { haptic } from "@/lib/haptics";
import { layout, space, useTheme } from "@/theme";
import { buildActivity, FILTERS, groupByDay, matchesFilter, type ActivityFilter } from "./activity-model";
import { ActivityRow } from "./ActivityRow";
import { PushedHeader } from "./PushedHeader";

const EMPTY: Record<ActivityFilter, { title: string; body: string }> = {
  all: { title: "Nothing here yet", body: "Money you add, move or spend shows up here, newest first." },
  in: { title: "No money in yet", body: "Paydays, auto-saves, round-ups and money you add show up here." },
  out: { title: "No money out yet", body: "Card payments, verified withdrawals and shop payments show up here." },
  proofs: { title: "No proofs yet", body: "When you send a bill to release money, each step shows up here." },
  emergency: { title: "No emergency requests", body: "If you ever use emergency access, it's recorded here." },
};

/** Activity (pushed): every money move and proof event in plain words, grouped by day, with filters. */
export function ActivityScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const q = useActivity();
  const now = useNow(60_000);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const data = q.data;
  const all = useMemo(() => (data ? buildActivity(data) : []), [data]);
  const sections = useMemo(() => groupByDay(all.filter((i) => matchesFilter(i, filter)), now), [all, filter, now]);

  const onRefresh = async () => {
    haptic("pull.threshold");
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const contentPad = { paddingBottom: layout.tabRootBottomPad + insets.bottom };

  return (
    <View style={[styles.fill, { backgroundColor: c.bg }]}>
      <PushedHeader title="Activity" />
      {/* Keep the last good list if a refresh fails; the error screen is only for a cold start. */}
      {data ? (
        <SectionList
          sections={sections}
          keyExtractor={(i) => i.id}
          stickySectionHeadersEnabled
          contentContainerStyle={[styles.content, contentPad]}
          refreshControl={
            <RefreshControl tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.surface} refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <View style={styles.head}>
              <PracticeBadge />
              <Txt v="bodyM" color="textMuted">
                Your latest money moves and proof updates, newest first.
              </Txt>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Show">
                {FILTERS.map((f) => (
                  <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
                ))}
              </View>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHead, { backgroundColor: c.bg }]}>
              <Txt v="labelM" color="textMuted" accessibilityRole="header">
                {section.title}
              </Txt>
            </View>
          )}
          renderItem={({ item }) => <ActivityRow item={item} currency={data.currency} now={now} timeOnly />}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={<EmptyState title={EMPTY[filter].title} body={EMPTY[filter].body} />}
        />
      ) : q.isError ? (
        <View style={[styles.content, contentPad]}>
          <ErrorState title="Activity didn't load" error={q.error} onRetry={() => void q.refetch()} />
        </View>
      ) : (
        <View style={[styles.content, contentPad]}>
          <ScreenSkeleton />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  head: { gap: space.sm, paddingTop: space.md, paddingBottom: space.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  sectionHead: { paddingTop: space.md, paddingBottom: space.xxs },
});
