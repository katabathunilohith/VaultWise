import { StyleSheet, View } from "react-native";
import { MoneyText, Txt } from "@/components/ui";
import { money } from "@/lib/money";
import { layout, radius, useTheme } from "@/theme";
import type { ActivityItem } from "./activity-model";
import { relativeWhen, timeLabel } from "./format";

/**
 * One activity row (≥56 pt). Amounts carry a sign and a colour: + in the gain colour for money
 * arriving, − in the loss colour for money leaving, plain for moves between your own pots.
 */
export function ActivityRow({ item, currency, now, timeOnly }: { item: ActivityItem; currency: string; now: number; timeOnly?: boolean }) {
  const { c, gain, loss } = useTheme();
  const Icon = item.icon;
  const when = timeOnly ? timeLabel(item.at) : relativeWhen(item.at, now);
  const signed = item.amount === null ? null : item.dir === "out" ? -item.amount : item.amount;
  const amountColor = item.dir === "in" ? gain : item.dir === "out" ? loss : c.text;
  const spoken =
    signed === null
      ? ""
      : item.dir === "in"
        ? `plus ${money(Math.abs(signed), currency)}`
        : item.dir === "out"
          ? `minus ${money(Math.abs(signed), currency)}`
          : money(Math.abs(signed), currency);
  return (
    <View style={styles.row} accessible accessibilityLabel={[item.title, item.detail, spoken, when].filter(Boolean).join(". ")}>
      <View style={[styles.icon, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
        <Icon size={20} color={c.text} />
      </View>
      <View style={styles.text}>
        <Txt v="labelM" numberOfLines={1}>
          {item.title}
        </Txt>
        <Txt v="caption" color="textMuted" numberOfLines={2}>
          {item.detail ? `${item.detail} · ${when}` : when}
        </Txt>
      </View>
      {signed !== null ? <MoneyText value={signed} currency={currency} signed={item.dir === "in"} color={amountColor} v="numM" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: layout.rowMin, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, gap: 2 },
});
