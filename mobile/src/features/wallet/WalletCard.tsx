import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CaretRightIcon, WalletIcon } from "@/components/icons";
import { MoneyText, Press, Skeleton, Txt } from "@/components/ui";
import { money } from "@/lib/money";
import { radius, space, useTheme } from "@/theme";
import { WALLET_ENABLED } from "./config";
import { useWallet, walletMissing } from "./hooks";
import { amountText, WALLET_HREF, walletRestricted } from "./model";

/**
 * Home's wallet card: what's in the wallet and what's safe to spend today. The whole card opens
 * the Wallet screen. Hidden when the wallet is switched off here, when the server has none, and
 * while the account is on hold for a recovery check.
 */
export function WalletCard() {
  const { c } = useTheme();
  const q = useWallet();
  if (!WALLET_ENABLED) return null;
  if (q.isPending) return <Skeleton height={88} r={radius.lg} />;
  // Keep showing the last good numbers if a refresh fails.
  if (q.isError && !q.data) {
    // No wallet on this server, or the account is on hold while a person checks a recovery.
    if (walletMissing(q.error) || walletRestricted(q.error)) return null;
    return (
      <Press
        accessibilityLabel="Your wallet didn't load. Tap to try again."
        onPress={() => void q.refetch()}
        style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
      >
        <Glyph />
        <Txt v="bodyM" color="textMuted" style={styles.flex}>
          Your wallet didn&apos;t load. Tap to try again.
        </Txt>
      </Press>
    );
  }
  const w = q.data;
  // Switched off on the server: only shown while there's money to cash out.
  if (!w || (!w.enabled && w.balance <= 0)) return null;
  const cur = w.currency;
  const days = w.daysToPayday;
  const sub = w.enabled
    ? `Safe to spend today ${amountText(w.safeToSpendToday, cur)} · Payday in ${days} ${days === 1 ? "day" : "days"}`
    : "The wallet is off. You can move this to your bank.";
  return (
    <Press
      accessibilityLabel={`Wallet, ${money(w.balance, cur)}. ${sub.replace(" · ", ". ")}.`}
      accessibilityHint="Opens your wallet"
      onPress={() => router.push(WALLET_HREF)}
      scaleTo={0.98}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      <Glyph />
      <View style={styles.flex}>
        <Txt v="labelM" color="textMuted">
          Wallet
        </Txt>
        <MoneyText value={w.balance} currency={cur} v="numL" />
        <Txt v="caption" color="textMuted">
          {sub}
        </Txt>
      </View>
      <CaretRightIcon size={18} color={c.textMuted} />
    </Press>
  );
}

function Glyph() {
  const { c } = useTheme();
  return (
    <View style={[styles.glyph, { backgroundColor: c.surfaceRaised }]}>
      <WalletIcon size={24} color={c.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 72,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  glyph: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, gap: 2 },
});
