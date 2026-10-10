import { StyleSheet, View } from "react-native";
import { Card, Divider, MoneyText, Txt } from "@/components/ui";
import type { Holding, InvestCore } from "@/lib/api/types";
import { money } from "@/lib/money";
import { layout, space } from "@/theme";
import { fmtUnits } from "../format";
import { Pnl } from "../Pnl";

/** Holdings in the order of the model portfolio (largest target first), then anything else. */
function ordered(core: InvestCore) {
  const rank = new Map([...core.allocations].sort((a, b) => b.weight - a.weight).map((a, i) => [a.symbol, i]));
  return [...core.holdings.holdings].sort((a, b) => (rank.get(a.symbol) ?? 99) - (rank.get(b.symbol) ?? 99));
}

export function Holdings({ core }: { core: InvestCore }) {
  const rows = ordered(core);
  if (!rows.length)
    return (
      <Card>
        <Txt v="labelL">Nothing bought yet</Txt>
        <Txt v="bodyM" color="textMuted">
          Start a plan or add a lump sum, and each fund you own shows up here with its value.
        </Txt>
      </Card>
    );
  return (
    <Card>
      {rows.map((h, i) => (
        <View key={h.symbol}>
          {i > 0 ? <Divider /> : null}
          <HoldingRow h={h} currency={core.currency} />
        </View>
      ))}
    </Card>
  );
}

function HoldingRow({ h, currency }: { h: Holding; currency: string }) {
  const change = h.pnl > 0 ? `up ${money(h.pnl, currency)}` : h.pnl < 0 ? `down ${money(-h.pnl, currency)}` : "no change";
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${h.label}, ${h.name}. ${fmtUnits(h.units)}, worth ${money(h.value, currency)}, ${change} since you started.`}
    >
      <View style={styles.left}>
        <Txt v="labelL">{h.label}</Txt>
        <Txt v="bodyM" color="textMuted">
          {h.name}
        </Txt>
        <Txt v="numS" color="textMuted">
          {fmtUnits(h.units)}
        </Txt>
      </View>
      <View style={styles.right}>
        <MoneyText value={h.value} currency={currency} />
        <Pnl value={h.pnl} currency={currency} base={h.cost} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, minHeight: layout.rowMin, paddingVertical: space.sm },
  left: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end", gap: 4, maxWidth: "50%" },
});
