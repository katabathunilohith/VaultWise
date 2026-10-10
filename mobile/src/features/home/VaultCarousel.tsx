import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CheckCircleIcon, PlusIcon } from "@/components/icons";
import { Amount, Press, Txt, VaultGlyph } from "@/components/ui";
import { categoryOf } from "@/lib/categories";
import type { Vault } from "@/lib/api/types";
import { money, moneyCompact, moneyWhole } from "@/lib/money";
import { layout, radius, space, useTheme } from "@/theme";
import { SeeAllHeader } from "./SeeAllHeader";

const CARD_W = 172;
const CARD_H = 208;
const GAP = 12;

/**
 * Vaults as category-filled cards (expressive shell): 3D object, name, balance and goal
 * progress. Past 75% the remaining amount gets the emphasis (goal gradient). Horizontal
 * scrolling is allowed here because Home is a tab root (R12), with 16 pt insets and snapping.
 */
export function VaultCarousel({ vaults, currency }: { vaults: Vault[]; currency: string }) {
  return (
    <View style={styles.wrap}>
      <SeeAllHeader title="Your vaults" label="See all vaults" onPress={() => router.push("/vaults")} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        style={styles.scroller}
        contentContainerStyle={styles.track}
      >
        {vaults
          .filter((v) => v.status !== "closed")
          .map((v) => (
            <VaultCard key={v.id} vault={v} currency={v.currency || currency} />
          ))}
        <NewVaultCard />
      </ScrollView>
    </View>
  );
}

function VaultCard({ vault: v, currency }: { vault: Vault; currency: string }) {
  const { c, cat } = useTheme();
  const meta = categoryOf(v.category);
  const fill = cat(meta.key).fill;
  const pct = Math.round(Math.min(1, v.progress) * 100);
  const left = Math.max(0, v.target - v.balance);
  const hasGoal = v.target > 0;
  const reached = hasGoal && v.progress >= 1;
  const close = hasGoal && v.progress >= 0.75;
  const status = reached ? "Goal reached" : close ? `${moneyWhole(left, currency)} to go` : hasGoal ? `${pct}% of ${moneyCompact(v.target, currency)}` : "No goal set";
  const goalSpoken = reached ? "Goal reached" : close ? `${money(left, currency)} to go` : hasGoal ? `${pct} percent of ${money(v.target, currency)}` : "No goal set";
  const spoken = `${v.name}, ${meta.label} vault. ${money(v.balance, currency)} saved. ${goalSpoken}.`;
  return (
    <Press onPress={() => router.push(`/vaults/${v.id}`)} scaleTo={0.98} accessibilityLabel={spoken} accessibilityHint="Opens this vault" style={[styles.card, { backgroundColor: fill }]}>
      <View style={styles.top}>
        <VaultGlyph category={v.category} variant="object" size={52} />
        <View style={styles.catTag}>
          <meta.Icon size={14} color={c.ink} weight="duotone" />
          <Txt v="micro" color="ink" maxFontSizeMultiplier={1.2}>
            {meta.short}
          </Txt>
        </View>
      </View>
      <View style={styles.bottom}>
        <Txt v="labelM" color="ink" numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {v.name}
        </Txt>
        <Amount value={v.balance} currency={currency} size="m" color={c.ink} hideDecimals />
        <InkProgress value={v.progress} />
        <View style={styles.status}>
          {reached ? <CheckCircleIcon size={14} color={c.ink} weight="fill" /> : null}
          <Txt v="caption" color="ink" numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {status}
          </Txt>
        </View>
      </View>
    </Press>
  );
}

/**
 * Progress drawn on a category fill: ink on a translucent-ink track, with 25/50/75% ticks.
 * (The kit's ProgressBar draws its track in the theme border colour, which disappears against
 * vivid fills in dark mode.)
 */
function InkProgress({ value }: { value: number }) {
  const { c } = useTheme();
  const v = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={[styles.inkTrack, { backgroundColor: `${c.ink}2E` }]}
    >
      <View style={[styles.inkFill, { width: `${v * 100}%`, backgroundColor: c.ink }]} />
      {[0.25, 0.5, 0.75].map((t) => (
        <View key={t} style={[styles.inkTick, { left: `${t * 100}%`, backgroundColor: v >= t ? c.paper : c.ink, opacity: v >= t ? 0.5 : 0.35 }]} />
      ))}
    </View>
  );
}

function NewVaultCard() {
  const { c } = useTheme();
  return (
    <Press
      onPress={() => router.push("/new-vault")}
      scaleTo={0.98}
      accessibilityLabel="New vault"
      style={[styles.card, styles.newCard, { borderColor: c.borderStrong, backgroundColor: c.surface }]}
    >
      <View style={[styles.plus, { backgroundColor: c.accentSoft }]}>
        <PlusIcon size={26} color={c.accent} weight="bold" />
      </View>
      <Txt v="labelL" align="center">
        New vault
      </Txt>
      <Txt v="caption" color="textMuted" align="center">
        Pick a purpose. The money locks to it.
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  scroller: { marginHorizontal: -layout.gutter },
  track: { paddingHorizontal: layout.gutter, gap: GAP },
  card: { width: CARD_W, minHeight: CARD_H, borderRadius: radius.lg, padding: space.md, justifyContent: "space-between", gap: space.sm },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  catTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 2 },
  bottom: { gap: 6 },
  status: { flexDirection: "row", alignItems: "center", gap: 4 },
  inkTrack: { height: 8, borderRadius: radius.pill, overflow: "hidden", position: "relative" },
  inkFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  inkTick: { position: "absolute", top: 0, bottom: 0, width: 2, marginLeft: -1 },
  newCard: { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderStyle: "dashed" },
  plus: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
});
