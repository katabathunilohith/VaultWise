import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { CalendarBlankIcon, LightningIcon } from "@/components/icons";
import { Amount, PracticeBadge, ProgressRing, Txt, useNow } from "@/components/ui";
import { categoryOf } from "@/lib/categories";
import type { Vault } from "@/lib/api/types";
import { moneyWhole } from "@/lib/money";
import { space, useTheme } from "@/theme";
import { formatDate, framing, monthlyNeeded, parseIsoDate } from "./format";

/**
 * Vault detail hero (0.08–0.48H): the goal ring in the category tint with the 3D object inside,
 * the balance, what's left, the target date and the daily framing of what it takes.
 */
export function VaultHero({ vault }: { vault: Vault }) {
  const { c, cat } = useTheme();
  const meta = categoryOf(vault.category);
  const tint = cat(meta.key).tint;
  const pct = Math.round(vault.progress * 100);
  const toGo = Math.max(0, vault.target - vault.balance);
  const date = vault.targetDate ? parseIsoDate(vault.targetDate) : null;
  const now = useNow(60_000);
  const past = date ? date.getTime() < now : false;
  const monthly = monthlyNeeded(vault);
  const reached = vault.progress >= 1;

  return (
    <View style={styles.hero}>
      <View style={{ alignItems: "center", gap: 4 }}>
        <Txt v="caption" color="textMuted" align="center">
          {meta.label} vault{vault.isJoint ? " · Joint" : ""}
        </Txt>
        <Txt v="headline" accessibilityRole="header" align="center" numberOfLines={2}>
          {vault.name}
        </Txt>
      </View>

      <View accessible accessibilityLabel={`${pct}% of the goal`}>
        <ProgressRing value={vault.progress} size={176} stroke={14} color={tint}>
          <Image source={meta.object3d} style={styles.object} contentFit="contain" accessible={false} />
        </ProgressRing>
      </View>

      <View style={{ alignItems: "center", gap: 6 }}>
        <Amount value={vault.balance} currency={vault.currency} size="xl" align="center" />
        {reached ? (
          <Txt v="labelL" align="center">
            Goal of {moneyWhole(vault.target, vault.currency)} reached
          </Txt>
        ) : vault.progress >= 0.75 ? (
          // Past 75% the remaining amount outranks the saved amount (goal-gradient).
          <Txt v="labelL" align="center">
            {moneyWhole(toGo, vault.currency)} to go · of {moneyWhole(vault.target, vault.currency)}
          </Txt>
        ) : (
          <Txt v="bodyL" color="textMuted" align="center">
            of {moneyWhole(vault.target, vault.currency)} · {moneyWhole(toGo, vault.currency)} to go
          </Txt>
        )}
        <View style={styles.badgeRow}>
          <PracticeBadge />
        </View>
      </View>

      <View style={{ alignItems: "center", gap: 4 }}>
        {date ? (
          <View style={styles.line}>
            <CalendarBlankIcon size={16} color={c.textMuted} />
            <Txt v="bodyM" color="textMuted">
              {past && !reached ? `Target date was ${formatDate(date)}` : `Target date ${formatDate(date)}`}
            </Txt>
          </View>
        ) : null}
        {monthly && !past ? (
          <View style={styles.line}>
            <LightningIcon size={16} color={c.text} />
            <Txt v="labelM">{framing(monthly, vault.currency)}</Txt>
          </View>
        ) : !reached && (!date || past) ? (
          <Txt v="bodyM" color="textMuted" align="center">
            {past ? "Pick a new date in Edit goal to see what it takes each day." : "Add a target date to see what it takes each day."}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space.md, paddingTop: space.xs },
  object: { width: 88, height: 88 },
  line: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "center" },
  badgeRow: { flexDirection: "row", justifyContent: "center", marginTop: 2 },
});
