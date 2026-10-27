import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Button, MoneyText, ProgressBar, Txt } from "@/components/ui";
import { radius, space, useTheme } from "@/theme";
import { WALLET_ENABLED } from "./config";
import { useWallet } from "./hooks";
import { amountText, limitLeft, walletActionHref } from "./model";

/**
 * The wallet's daily spending limit on Your limits, beside the vault limits. Its own rules (lower
 * or turn on any time, raise or turn off once every 30 days) live on the limit screen it opens.
 * Hidden when the wallet is off here or on the server, or the server has none.
 */
export function WalletLimitCard() {
  const { c } = useTheme();
  const q = useWallet();
  const w = q.data;
  if (!WALLET_ENABLED || !w || !w.enabled) return null;
  const cur = w.currency;
  const limit = w.dailyLimit;
  const left = limitLeft(w);
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Txt v="titleM" accessibilityRole="header">
            Daily spending limit
          </Txt>
          <Txt v="bodyM" color="textMuted">
            The most that can leave your wallet in a day, in payments and cash outs.
          </Txt>
        </View>
        {limit !== null ? (
          <MoneyText value={limit} currency={cur} v="numL" whole />
        ) : (
          <Txt v="labelL" color="textMuted">
            Off
          </Txt>
        )}
      </View>
      {limit !== null && left !== null ? (
        <View style={styles.usage}>
          <ProgressBar
            value={limit > 0 ? Math.min(1, w.spentToday / limit) : 0}
            color={c.textMuted}
            ticks={false}
            label={`${amountText(w.spentToday, cur)} of ${amountText(limit, cur)} used today`}
          />
          <Txt v="caption" color="textMuted">
            {`${amountText(w.spentToday, cur)} used today · ${amountText(left, cur)} left`}
          </Txt>
        </View>
      ) : null}
      <Txt v="caption" color="textMuted">
        Lower it or turn it on any time. Raise it or turn it off once every 30 days.
      </Txt>
      <Button
        label={limit === null ? "Set a limit" : "Change"}
        variant="tonal"
        size="md"
        onPress={() => router.push(walletActionHref("limit"))}
        accessibilityHint="Opens the wallet's daily limit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  head: { flexDirection: "row", gap: space.sm, alignItems: "flex-start", flexWrap: "wrap" },
  flex: { flex: 1, gap: 2 },
  usage: { gap: 6 },
});
