import { StyleSheet, View } from "react-native";
import { ArrowsClockwiseIcon, CoinsIcon } from "@/components/icons";
import { MoneyText, StatusPill, Txt } from "@/components/ui";
import { money } from "@/lib/money";
import { radius, useTheme } from "@/theme";
import { dateParts, whenAhead } from "./format";
import { PercentIcon } from "./icons";
import type { UpcomingMove } from "./schedule";

/** "Sat 11 Oct, 11:30 pm" / "Next payday" — the spoken and written "when" of a move. */
export function moveWhen(m: UpcomingMove, now: number) {
  return m.at !== null ? whenAhead(m.at, now) : (m.whenNote ?? "");
}

/** Screen-reader sentence for a move: when, what, from → to, how much. */
export function moveLabel(m: UpcomingMove, currency: string, now: number, state?: "skipped" | "paused") {
  const amount = m.amount !== null ? `${m.estimate ? "about " : ""}${money(m.amount, currency)}` : m.amountNote;
  return [moveWhen(m, now), m.title, `from ${m.from} to ${m.to}`, amount, state === "skipped" ? "Skipped" : state === "paused" ? "Paused" : null]
    .filter(Boolean)
    .join(". ");
}

/** Calendar tile for dated moves; an icon tile for "on payday" and "weekly" moves. */
export function DateTile({ move }: { move: UpcomingMove }) {
  const { c } = useTheme();
  if (move.at === null) {
    const Icon = move.kind === "percent" ? PercentIcon : move.kind === "roundup" ? CoinsIcon : ArrowsClockwiseIcon;
    return (
      <View style={[styles.tile, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
        <Icon size={20} color={c.text} />
      </View>
    );
  }
  const p = dateParts(move.at);
  return (
    <View style={[styles.tile, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
      <Txt v="micro" color="textMuted" maxFontSizeMultiplier={1.2}>
        {p.weekday}
      </Txt>
      <Txt v="numL" maxFontSizeMultiplier={1.2} style={{ lineHeight: 22 }}>
        {p.day}
      </Txt>
      <Txt v="micro" color="textMuted" maxFontSizeMultiplier={1.2}>
        {p.month}
      </Txt>
    </View>
  );
}

/** Amount column: exact, estimated ("About"), or a short note when there's no number yet. */
export function MoveAmount({ move, currency, dim }: { move: UpcomingMove; currency: string; dim?: boolean }) {
  const { c } = useTheme();
  if (move.amount === null)
    return (
      <Txt v="caption" color="textMuted" align="right" style={styles.note} numberOfLines={2}>
        {move.amountNote}
      </Txt>
    );
  return (
    <View style={styles.amount}>
      {move.estimate ? (
        <Txt v="micro" color="textMuted">
          About
        </Txt>
      ) : null}
      <MoneyText
        value={move.amount}
        currency={currency}
        color={dim ? c.textMuted : c.text}
        style={dim ? { textDecorationLine: "line-through" } : undefined}
      />
    </View>
  );
}

/** Compact line for Home's "Coming up" card. */
export function MoveLine({ move, currency, now, state }: { move: UpcomingMove; currency: string; now: number; state?: "skipped" | "paused" }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={moveLabel(move, currency, now, state)}>
      <DateTile move={move} />
      <View style={styles.text}>
        <Txt v="labelM" numberOfLines={1}>
          {move.to}
        </Txt>
        <Txt v="caption" color="textMuted" numberOfLines={1}>
          {move.at !== null ? `${move.title} · ${moveWhen(move, now)}` : move.title}
        </Txt>
        {state ? <StatusPill tone="neutral" label={state === "skipped" ? "Skipped" : "Paused"} /> : null}
      </View>
      <MoveAmount move={move} currency={currency} dim={!!state} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 52,
    minHeight: 56,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  line: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 6 },
  text: { flex: 1, gap: 2 },
  amount: { alignItems: "flex-end" },
  note: { maxWidth: 120 },
});
