import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Txt } from "@/components/ui";
import { palettes, radius, space, useTheme } from "@/theme";

/** Text on paper is always dark: paper is light in both themes (DESIGN.md §2). */
export const PAPER_INK = palettes.light.text;
export const PAPER_MUTED = palettes.light.textMuted;
const PAPER_BORDER = palettes.light.border;

/** A light "paper" card for documents and receipts. */
export function PaperCard({ children, style, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const { c } = useTheme();
  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.card, { backgroundColor: c.paper, borderColor: PAPER_BORDER }, style]}>
      {children}
    </View>
  );
}

/** Label on the left, value on the right; values may be mono (amounts, references). */
export function PaperRow({ label, value, mono }: { label: string; value: string; mono?: "m" | "s" }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Txt v="bodyM" color={PAPER_MUTED} style={styles.label}>
        {label}
      </Txt>
      <Txt v={mono === "s" ? "numS" : mono === "m" ? "numM" : "labelM"} color={PAPER_INK} align="right" style={styles.value} selectable={!!mono}>
        {value}
      </Txt>
    </View>
  );
}

export function PaperRule() {
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: PAPER_BORDER }} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, minHeight: 24 },
  label: { flexShrink: 0, maxWidth: "45%" },
  value: { flex: 1 },
});
