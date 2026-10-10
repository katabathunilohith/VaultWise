import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Card, Divider, MoneyText, Txt } from "@/components/ui";
import type { PaymentIntent } from "@/lib/api/pay-types";
import { moneyWhole } from "@/lib/money";
import { space } from "@/theme";
import type { PayVault } from "./vaults";

/**
 * Everything before confirming — amount, fee, what's left — so nothing appears later. A dry run
 * (live session, checkout not live yet) leaves the vault as it is, so it shows no "left" line.
 */
export function Breakdown({ intent, vault }: { intent: PaymentIntent; vault: PayVault }) {
  const left = intent.dryRun ? -1 : vault.available - intent.amount;
  return (
    <Card>
      <Line label="Amount" value={<MoneyText value={intent.amount} currency={intent.currency} />} />
      <Line
        label="Fee"
        value={
          <Txt v="bodyM" align="right">
            {moneyWhole(0, intent.currency)} · no fees in Practice
          </Txt>
        }
      />
      <Divider />
      <Line strong label="You pay" value={<MoneyText v="numL" value={intent.amount} currency={intent.currency} />} />
      {left >= 0 ? <Line label={`Left in ${vault.name} after this`} value={<MoneyText value={left} currency={intent.currency} />} /> : null}
    </Card>
  );
}

function Line({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Txt v={strong ? "labelL" : "bodyM"} color={strong ? "text" : "textMuted"} style={styles.label}>
        {label}
      </Txt>
      <View style={styles.value}>{value}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, minHeight: 28 },
  label: { flex: 1 },
  value: { flexShrink: 1, alignItems: "flex-end" },
});
