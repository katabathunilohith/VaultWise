import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, Txt } from "@/components/ui";
import { categoryOf } from "@/lib/categories";
import type { Vault } from "@/lib/api/types";
import { moneyWhole } from "@/lib/money";
import { space } from "@/theme";
import { monthKey } from "./format";
import { markFreshStartDone, useHomePrefs } from "./prefs";
import { freshStartSuggestion } from "./schedule";

/**
 * A one-time "fresh start" suggestion in the first three days of a month (new-month landmark).
 * One idea, framed per day, with a one-tap way in and a "Not now" that's remembered for the
 * month and never shames.
 */
export function FreshStartCard({ vaults, currency, now, large }: { vaults: Vault[]; currency: string; now: number; large: boolean }) {
  const prefs = useHomePrefs();
  const month = monthKey(now);
  const s = freshStartSuggestion(vaults, now);
  if (!s || !prefs.loaded || prefs.freshStartDone === month) return null;
  const meta = categoryOf(s.vault.category);
  const label = s.vault.category === "custom" ? s.vault.name : meta.short;
  const cur = s.vault.currency || currency;
  const target = s.vault.targetDate ? new Date(`${s.vault.targetDate}T00:00:00`) : null;
  const reach =
    target && !Number.isNaN(target.getTime()) && s.vault.monthlyNeeded && s.monthly >= s.vault.monthlyNeeded
      ? ` Enough to reach ${moneyWhole(s.vault.target, cur)} by ${target.toLocaleDateString(undefined, { month: "short", year: "numeric" })}.`
      : "";
  const body = `About ${moneyWhole(s.monthly, cur)} a month${s.currentMonthly > 0 ? `, up from ${moneyWhole(s.currentMonthly, cur)}` : ""}.${reach}`;

  const accept = () => {
    markFreshStartDone(month);
    router.push(`/vaults/${s.vault.id}`);
  };
  const later = () => markFreshStartDone(month);

  return (
    <Card>
      <Txt v="caption" color="accent">
        Fresh start
      </Txt>
      <Txt v="titleM" accessibilityRole="header">
        {`New month. Bump ${label} to ${moneyWhole(s.perDay, cur)} a day?`}
      </Txt>
      <Txt v="bodyM" color="textMuted">
        {body}
      </Txt>
      <View style={[styles.actions, large && styles.stacked]}>
        <Button label="Not now" variant="tonal" size="md" onPress={later} style={large ? undefined : styles.flex} />
        <Button label="Do it" variant="accent" size="md" onPress={accept} accessibilityHint={`Opens ${s.vault.name} to change its rule`} style={large ? undefined : styles.flex} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  stacked: { flexDirection: "column" },
  flex: { flex: 1 },
});
