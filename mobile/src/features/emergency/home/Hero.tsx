import { StyleSheet, View } from "react-native";
import { Amount, Stack, Txt } from "@/components/ui";
import type { EmergencyOverview } from "@/lib/api/types";
import { space } from "@/theme";
import { nextRequestText } from "../copy";
import { fmt } from "../format";

/** "Need money now?" and what's ready — the first thing on the tab (0.08–0.35H). */
export function Hero({ o }: { o: EmergencyOverview }) {
  const fromHealth = o.tier1Available > 0;
  const value = fromHealth ? o.tier1Available : o.tier2Available;
  const sub = fromHealth
    ? "ready from Health, straight away"
    : o.tier2Available > 0
      ? "ready from your other vaults, after a short safety pause"
      : "Add money to a vault to use emergency access";
  return (
    <Stack gap={space.xs}>
      <Txt v="displayM" accessibilityRole="header">
        Need money now?
      </Txt>
      <Amount value={value} currency={o.currency} size="xl" hideDecimals={value % 100 === 0} />
      <Txt v="bodyL" color="textMuted">
        {sub}
      </Txt>
    </Stack>
  );
}

/** Plain safety-limit rows: what's left, how often, and what the next request looks like. */
export function SafetyLimits({ o }: { o: EmergencyOverview }) {
  const cur = o.currency;
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Left this month", value: `${fmt(o.remainingCap, cur)} of ${fmt(o.cap, cur)}`, mono: true },
    { label: "Requests this week", value: `${o.requestsLast7d} of ${o.rules.maxRequestsPer7d}`, mono: true },
    { label: "Next request", value: nextRequestText(o) },
  ];
  return (
    <View accessibilityRole="summary" accessibilityLabel="Your safety limits">
      {rows.map((r, i) => (
        <View
          key={r.label}
          accessible
          accessibilityLabel={`${r.label}: ${r.value}`}
          style={[styles.row, i > 0 && styles.rowGap]}
        >
          <Txt v="bodyM" color="textMuted" style={styles.label}>
            {r.label}
          </Txt>
          <Txt v={r.mono ? "numM" : "labelM"} align="right" style={styles.value}>
            {r.value}
          </Txt>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, minHeight: 28 },
  rowGap: { marginTop: space.xxs },
  label: { flexShrink: 0 },
  value: { flexShrink: 1 },
});
