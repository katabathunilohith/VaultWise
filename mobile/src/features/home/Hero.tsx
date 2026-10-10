import { StyleSheet, useWindowDimensions, View } from "react-native";
import { ArrowDownLeftIcon, LockIcon } from "@/components/icons";
import { Amount, PracticeBadge, Skeleton, Txt } from "@/components/ui";
import { useActivity } from "@/lib/api/hooks";
import { moneyWhole } from "@/lib/money";
import { radius, space, useTheme } from "@/theme";
import { addedToVaults } from "./activity-model";
import { shortDate } from "./format";

/**
 * The viewing area (heatmap §5.1): what's safe, what came in lately, and the lock promise.
 * Nothing here is tappable. At accessibility text sizes it collapses so the quick actions stay
 * in the comfortable lower-middle of the screen.
 */
export function Hero({ saved, currency, now, large }: { saved: number; currency: string; now: number; large: boolean }) {
  const { c } = useTheme();
  const { height } = useWindowDimensions();
  if (large)
    return (
      <View style={styles.compact}>
        <Txt v="labelM" color="textMuted" accessibilityRole="header">
          Safe in vaults
        </Txt>
        <Amount value={saved} currency={currency} size="m" />
        <PracticeBadge compact />
      </View>
    );
  return (
    <View style={[styles.hero, { minHeight: Math.round(height * 0.27) }]}>
      <Txt v="labelM" color="textMuted" align="center" accessibilityRole="header">
        Safe in vaults
      </Txt>
      <View style={styles.amount}>
        <Amount value={saved} currency={currency} size="xl" align="center" />
      </View>
      <AddedChip currency={currency} now={now} />
      <PracticeBadge />
      <View style={styles.lock}>
        <LockIcon size={14} color={c.textMuted} weight="bold" />
        <Txt v="caption" color="textMuted" align="center" style={styles.shrink}>
          Locked by default. Released against verified proof.
        </Txt>
      </View>
    </View>
  );
}

/** Money that landed in vaults lately. Says exactly which window it covers. */
function AddedChip({ currency, now }: { currency: string; now: number }) {
  const { c, gain } = useTheme();
  const activity = useActivity();
  if (activity.isPending) return <Skeleton height={28} width={200} r={radius.pill} />;
  if (activity.isError || !activity.data) return null;
  const { amount, since, partial } = addedToVaults(activity.data, now);
  const window = partial ? `since ${shortDate(since, now)}` : "in the last 30 days";
  const label = amount > 0 ? `+${moneyWhole(amount, currency)} added ${window}` : `Nothing added ${window}`;
  return (
    <View style={[styles.chip, { backgroundColor: c.surfaceRaised, borderColor: c.border }]} accessible accessibilityLabel={label}>
      {amount > 0 ? <ArrowDownLeftIcon size={14} color={gain} weight="bold" /> : null}
      <Txt v="caption" style={styles.shrink}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: space.lg },
  amount: { alignSelf: "stretch" },
  compact: { gap: space.xs, paddingVertical: space.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  shrink: { flexShrink: 1 },
  lock: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.md },
});
