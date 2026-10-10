import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PauseIcon } from "@/components/icons";
import { Banner, Card, Divider, EmptyState, ErrorState, PracticeBadge, ScreenSkeleton, StatusPill, Txt, useNow } from "@/components/ui";
import { useDashboard } from "@/lib/api/hooks";
import { haptic } from "@/lib/haptics";
import { layout, space, useTheme } from "@/theme";
import { DAY_MS } from "./format";
import { InlineError } from "./InlineError";
import { DateTile, MoveAmount, moveLabel, moveWhen } from "./MoveLine";
import { setAutoSavesPaused, setSkipped, useHomePrefs, type HomePrefs } from "./prefs";
import { PushedHeader } from "./PushedHeader";
import { SwitchRow } from "./SwitchRow";
import type { UpcomingMove } from "./schedule";
import { useUpcoming } from "./useUpcoming";

const REFRESH = new Set(["dashboard", "invest-core", "activity"]);

/**
 * Coming up (pushed): every automatic move in the next 30 days, each with "Skip this one", and a
 * master "Pause all auto-saves". Answers the most common surprise-debit complaint: nothing
 * moves without showing up here first.
 */
export function UpcomingScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const dash = useDashboard();
  const now = useNow(60_000);
  const prefs = useHomePrefs();
  const { moves, sipPending, sipError, retrySip } = useUpcoming(dash.data, now);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    haptic("pull.threshold");
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ predicate: (q) => REFRESH.has(String(q.queryKey[1])) });
    } finally {
      setRefreshing(false);
    }
  };

  const week = moves.filter((m) => m.at !== null && m.at < now + 7 * DAY_MS);
  const later = moves.filter((m) => m.at !== null && m.at >= now + 7 * DAY_MS);
  const onEvent = moves.filter((m) => m.at === null);
  const currency = dash.data?.currency ?? "";

  return (
    <View style={[styles.fill, { backgroundColor: c.bg }]}>
      <PushedHeader title="Coming up" />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingBottom: layout.tabRootBottomPad + insets.bottom }]}
        refreshControl={<RefreshControl tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.surface} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.intro}>
          <Txt v="titleL">Nothing moves without showing up here first.</Txt>
          <Txt v="bodyM" color="textMuted">
            Every automatic move in the next 30 days. Skip one, or pause them all.
          </Txt>
          <PracticeBadge />
        </View>

        {dash.data && prefs.loaded ? (
          <>
            <Card>
              <SwitchRow
                title="Pause all auto-saves"
                subtitle="Vault rules, round-ups and your Core SIP. Saved on this phone."
                icon={PauseIcon}
                value={prefs.paused}
                onChange={setAutoSavesPaused}
              />
            </Card>
            {prefs.paused ? <Banner tone="info" icon={PauseIcon} title="Auto-saves are paused" body="Every move below shows as paused. Turn this off to bring them back." /> : null}

            {moves.length === 0 && sipPending ? (
              <ScreenSkeleton />
            ) : moves.length === 0 ? (
              <EmptyState
                title="Nothing scheduled"
                body="Set a rule on any vault, like a weekly amount or round-ups, and it shows here before it runs."
                action="Go to vaults"
                onAction={() => router.push("/vaults")}
              />
            ) : (
              <>
                <MoveGroup title="Next 7 days" moves={week} currency={currency} now={now} prefs={prefs} />
                <MoveGroup title="Later" moves={later} currency={currency} now={now} prefs={prefs} />
                <MoveGroup title="When it happens" moves={onEvent} currency={currency} now={now} prefs={prefs} />
              </>
            )}

            {sipError ? (
              <Card>
                <InlineError what="Your Core SIP" error={sipError} onRetry={retrySip} />
              </Card>
            ) : null}

            <Txt v="caption" color="textMuted">
              Skips and pauses are saved on this phone only. In Practice mode they don’t reach the simulator yet, so a move can still show up in
              Activity. No real money moves either way.
            </Txt>
          </>
        ) : dash.isError ? (
          <ErrorState title="Coming up didn't load" error={dash.error} onRetry={() => void dash.refetch()} />
        ) : (
          <ScreenSkeleton />
        )}
      </ScrollView>
    </View>
  );
}

function MoveGroup({ title, moves, currency, now, prefs }: { title: string; moves: UpcomingMove[]; currency: string; now: number; prefs: HomePrefs }) {
  if (moves.length === 0) return null;
  return (
    <View style={styles.group}>
      <Txt v="labelM" color="textMuted" accessibilityRole="header">
        {title}
      </Txt>
      {moves.map((m) => (
        <MoveCard key={m.key} move={m} currency={currency} now={now} paused={prefs.paused} skipped={!!prefs.skipped[m.key]} />
      ))}
    </View>
  );
}

function MoveCard({ move, currency, now, paused, skipped }: { move: UpcomingMove; currency: string; now: number; paused: boolean; skipped: boolean }) {
  const state = paused ? "paused" : skipped ? "skipped" : undefined;
  return (
    <Card>
      <View style={styles.moveRow} accessible accessibilityLabel={moveLabel(move, currency, now, state)}>
        <DateTile move={move} />
        <View style={styles.moveText}>
          <Txt v="caption" color="textMuted">
            {moveWhen(move, now)}
          </Txt>
          <Txt v="labelL" numberOfLines={2}>
            {move.title}
          </Txt>
          <Txt v="bodyM" color="textMuted" numberOfLines={2}>
            {`${move.from} → ${move.to}`}
          </Txt>
          {state ? <StatusPill tone="neutral" icon={PauseIcon} label={state === "paused" ? "Paused" : "Skipped"} /> : null}
        </View>
        <MoveAmount move={move} currency={currency} dim={!!state} />
      </View>
      {paused ? null : (
        <>
          <Divider />
          <SwitchRow
            title="Skip this one"
            subtitle={skipped ? "Skipped. The rule carries on after this." : undefined}
            accessibilityLabel={`Skip ${move.title} to ${move.to}, ${moveWhen(move, now)}`}
            value={skipped}
            onChange={(v) => setSkipped(move.key, v, move.skipUntil)}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, paddingTop: space.md, gap: space.lg, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  intro: { gap: space.xs },
  group: { gap: space.sm },
  moveRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  moveText: { flex: 1, gap: 2 },
});
