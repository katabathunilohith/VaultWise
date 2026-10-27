import { Fragment } from "react";
import { StyleSheet, View } from "react-native";
import { Divider, MoneyText, Txt } from "@/components/ui";
import { relativeWhen } from "@/features/home/format";
import type { WalletActivity } from "@/lib/api/wallet-types";
import { money } from "@/lib/money";
import { layout, radius, useTheme } from "@/theme";
import { describeActivity } from "./model";

/** Recent wallet movements, newest first. Signs follow the wallet: + in the gain colour for money in, − for money out. */
export function WalletActivityList({ items, currency, now }: { items: WalletActivity[]; currency: string; now: number }) {
  if (!items.length)
    return (
      <Txt v="bodyM" color="textMuted">
        Nothing yet. Money you add, move or spend shows up here.
      </Txt>
    );
  return (
    <View>
      {items.map((a, i) => (
        <Fragment key={a.id}>
          {i > 0 ? <Divider /> : null}
          <ActivityLine item={a} currency={currency} now={now} />
        </Fragment>
      ))}
    </View>
  );
}

function ActivityLine({ item, currency, now }: { item: WalletActivity; currency: string; now: number }) {
  const { c, gain } = useTheme();
  const d = describeActivity(item);
  const Icon = d.icon;
  const when = relativeWhen(item.createdAt, now);
  const signed = d.dir === "in" ? d.amount : -d.amount;
  const spoken = `${d.dir === "in" ? "plus" : "minus"} ${money(d.amount, currency)}`;
  return (
    <View style={styles.row} accessible accessibilityLabel={[d.title, d.detail, spoken, when].filter(Boolean).join(". ")}>
      <View style={[styles.icon, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
        <Icon size={20} color={c.text} />
      </View>
      <View style={styles.text}>
        <Txt v="labelM">{d.title}</Txt>
        <Txt v="caption" color="textMuted">
          {d.detail ? `${d.detail} · ${when}` : when}
        </Txt>
      </View>
      <MoneyText value={signed} currency={currency} signed={d.dir === "in"} color={d.dir === "in" ? gain : c.text} v="numM" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: layout.rowMin, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, gap: 2 },
});
