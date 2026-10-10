import { StyleSheet, View } from "react-native";
import { Card, Txt } from "@/components/ui";
import type { InvestCore } from "@/lib/api/types";
import { radius, space, useTheme, type Palette, type Scheme } from "@/theme";
import { fmtWeight } from "../format";

type Band = NonNullable<InvestCore["band"]>;

/** Plain words for the band's typical yearly swings (annual volatility). */
function swings(vol: number) {
  if (vol <= 0.05) return "small";
  if (vol <= 0.08) return "modest";
  if (vol <= 0.11) return "noticeable";
  if (vol <= 0.14) return "big";
  return "very big";
}

export function bandSentence(band: Band) {
  const pct = Math.round(band.expReturn * 1000) / 10;
  return `Aims for about ${pct}% a year on average, with ${swings(band.vol)} ups and downs along the way. A model, not a promise.`;
}

/**
 * Neutral greys plus the one accent — never vault category colours, which mean "a vault".
 * The largest slot takes the accent; the rest step down in lightness.
 */
const GREYS: Record<Scheme, string[]> = {
  dark: ["#E3DCE6", "#A39AA6", "#6E6672", "#4E4752"],
  light: ["#3D3540", "#7A727E", "#ABA4AE", "#CFC9D1"],
};

function slotColors(c: Palette, scheme: Scheme, n: number) {
  const greys = GREYS[scheme];
  return Array.from({ length: n }, (_, i) => (i === 0 ? c.accentFill : greys[(i - 1) % greys.length]));
}

interface Slot {
  key: string;
  label: string;
  target: number;
  actual: number;
  color: string;
}

function buildSlots(core: InvestCore, c: Palette, scheme: Scheme): Slot[] {
  const allocs = [...core.allocations].sort((a, b) => b.weight - a.weight);
  const held = core.holdings.holdings;
  const known = new Set(allocs.map((a) => a.symbol));
  const other = held.filter((h) => !known.has(h.symbol)).reduce((s, h) => s + h.weight, 0);
  const colors = slotColors(c, scheme, allocs.length + (other > 0 ? 1 : 0));
  const slots: Slot[] = allocs.map((a, i) => ({
    key: a.symbol,
    label: a.label,
    target: a.weight,
    actual: held.find((h) => h.symbol === a.symbol)?.weight ?? 0,
    color: colors[i],
  }));
  if (other > 0) slots.push({ key: "other", label: "Other", target: 0, actual: other, color: colors[allocs.length] });
  return slots;
}

/** Band name, what it aims for in plain words, and the mix: one stacked bar plus a legend. */
export function ModelPortfolio({ core }: { core: InvestCore & { band: Band } }) {
  const { c, scheme } = useTheme();
  const slots = buildSlots(core, c, scheme);
  const holdsAnything = slots.some((s) => s.actual > 0);
  return (
    <Card>
      <Txt v="titleM">{core.band.name}</Txt>
      <Txt v="bodyM" color="textMuted">
        {bandSentence(core.band)}
      </Txt>
      <Txt v="caption" color="textMuted">
        Picked from your answers to the risk quiz.
      </Txt>
      <View style={{ marginTop: space.xs }}>
        <AllocationBar slots={slots} fromHoldings={holdsAnything} />
      </View>
      <View style={{ gap: space.xxs }}>
        {slots.map((s) => (
          <LegendRow key={s.key} slot={s} showActual={holdsAnything} />
        ))}
      </View>
      <Txt v="caption" color="textMuted">
        {holdsAnything ? "The bar shows what you hold now. The marks show the target mix." : "Nothing bought yet, so the bar shows the target mix."}
      </Txt>
    </Card>
  );
}

function AllocationBar({ slots, fromHoldings }: { slots: Slot[]; fromHoldings: boolean }) {
  const { c } = useTheme();
  const targets = slots.filter((s) => s.target > 0).map((s) => s.target);
  // Boundaries between target slots (cumulative weights), drawn as marks over the actual mix.
  const marks = fromHoldings ? targets.slice(0, -1).map((_, i) => targets.slice(0, i + 1).reduce((a, b) => a + b, 0)) : [];
  const summary = slots.map((s) => `${s.label} ${fmtWeight(fromHoldings ? s.actual : s.target)}`).join(", ");
  return (
    <View style={styles.barWrap} accessible accessibilityRole="image" accessibilityLabel={`Mix: ${summary}`}>
      <View style={[styles.bar, { backgroundColor: c.border }]}>
        {slots.map((s) => {
          const w = fromHoldings ? s.actual : s.target;
          return w > 0 ? <View key={s.key} style={{ flexGrow: w, flexBasis: 0, backgroundColor: s.color }} /> : null;
        })}
      </View>
      {marks.map((m, i) => (
        <View key={i} style={[styles.mark, { left: `${m * 100}%`, backgroundColor: c.text }]} />
      ))}
    </View>
  );
}

function LegendRow({ slot, showActual }: { slot: Slot; showActual: boolean }) {
  const detail = showActual
    ? slot.target > 0
      ? `${fmtWeight(slot.actual)} now · target ${fmtWeight(slot.target)}`
      : `${fmtWeight(slot.actual)} now · not in the target mix`
    : `target ${fmtWeight(slot.target)}`;
  return (
    <View style={styles.legendRow} accessible accessibilityLabel={`${slot.label}: ${detail.replace("·", ",")}`}>
      <View style={[styles.swatch, { backgroundColor: slot.color }]} />
      <Txt v="bodyM" style={styles.legendLabel}>
        {slot.label}
      </Txt>
      <Txt v="numS" color="textMuted" style={styles.legendDetail}>
        {detail}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  barWrap: { height: 20, justifyContent: "center" },
  bar: { height: 12, flexDirection: "row", gap: 2, borderRadius: radius.pill, overflow: "hidden" },
  mark: { position: "absolute", top: 0, bottom: 0, width: 2, marginLeft: -1, borderRadius: 1 },
  // Wraps at large text sizes: the detail drops under the label instead of squeezing it.
  legendRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.xs, rowGap: 2, minHeight: 32 },
  legendLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 120 },
  legendDetail: { flexShrink: 0 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
});
