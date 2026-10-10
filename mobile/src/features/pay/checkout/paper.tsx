import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Txt } from "@/components/ui";
import { palettes, radius, space, useTheme } from "@/theme";

/** Documents and receipts sit on light paper in both themes, so they use the light palette's greys. */
export const PAPER_MUTED = palettes.light.textMuted;
const PAPER_LINE = palettes.light.border;

export function Paper({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <View style={[styles.paper, { backgroundColor: c.paper }]}>{children}</View>;
}

export function PaperLine() {
  return <View style={styles.line} />;
}

/** Label on the left, value on the right; long labels wrap rather than push the value off. */
export function PaperRow({ label, value, strong, inkLabel }: { label: string; value: ReactNode; strong?: boolean; inkLabel?: boolean }) {
  return (
    <View style={styles.row}>
      <Txt v={strong ? "labelL" : "bodyM"} color={strong || inkLabel ? "ink" : PAPER_MUTED} style={styles.label}>
        {label}
      </Txt>
      {typeof value === "string" ? (
        <Txt v="labelM" color="ink" align="right" style={styles.value}>
          {value}
        </Txt>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: PAPER_LINE, padding: space.md, gap: space.sm },
  line: { height: StyleSheet.hairlineWidth * 2, backgroundColor: PAPER_LINE },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.sm },
  label: { flex: 1 },
  value: { flexShrink: 1, maxWidth: "60%" },
});
