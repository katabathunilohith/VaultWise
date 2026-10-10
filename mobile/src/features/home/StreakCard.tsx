import { StyleSheet, View } from "react-native";
import { Card, Txt } from "@/components/ui";
import { useActivity } from "@/lib/api/hooks";
import type { Streak } from "@/lib/api/types";
import { radius, space, useTheme } from "@/theme";
import { paydayInWeek } from "./activity-model";
import { weekIndex } from "./format";

/**
 * Weekly saving streak that forgives (DESIGN.md §7.11): weeks are dots, a quiet week is
 * "paused", never "broken", and after a gap the card offers a fresh run instead of a loss.
 * Silent on purpose — streaks never play a haptic.
 */
export function StreakCard({ streak, now }: { streak: Streak; now: number }) {
  const { c } = useTheme();
  const activity = useActivity();
  const thisWeek = weekIndex(now);
  const weeks = streak.last12;
  const savedThisWeek = weeks.find((w) => w.week === thisWeek)?.active ?? false;
  const payday = paydayInWeek(activity.data, thisWeek);
  const active = weeks.filter((w) => w.active).length;
  const span = weeks.length > 0 ? thisWeek - weeks[0].week : 0;

  const title = streak.streak > 0 ? `${streak.streak}-week saving streak` : "Start a 4-week run";
  const body =
    streak.streak > 0
      ? savedThisWeek
        ? `This week's in.${streak.best > streak.streak ? ` Your best run is ${streak.best} weeks.` : " That's your best run yet."}`
        : payday === false
          ? "Paused — no payday this week. Any amount into a vault still keeps it going."
          : "This week's still open. Any amount into a vault counts."
      : payday === false
        ? "Paused — no payday this week. Any amount into a vault starts a new run."
        : "Any amount into a vault this week starts a new run.";

  return (
    <Card>
      <Txt v="titleM" accessibilityRole="header">
        {title}
      </Txt>
      <Txt v="bodyM" color="textMuted">
        {body}
      </Txt>
      <View style={styles.dots} accessible accessibilityLabel={`Saved in ${active} of the last ${weeks.length} weeks`}>
        {weeks.map((w) => {
          const current = w.week === thisWeek;
          return (
            <View
              key={w.week}
              style={[
                styles.dot,
                w.active
                  ? { backgroundColor: c.accentFill, borderColor: c.accentFill }
                  : { backgroundColor: "transparent", borderColor: current ? c.accent : c.borderStrong, borderStyle: current ? "dashed" : "solid" },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.legend}>
        <Txt v="micro" color="textMuted">
          {span > 0 ? `${span} weeks ago` : ""}
        </Txt>
        <Txt v="micro" color="textMuted">
          This week
        </Txt>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: space.xs },
  dot: { width: 18, height: 18, borderRadius: radius.pill, borderWidth: 2 },
  legend: { flexDirection: "row", justifyContent: "space-between" },
});
