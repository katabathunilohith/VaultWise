import { useId, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, Path, Pattern, Rect } from "react-native-svg";
import { Txt } from "@/components/ui";
import { radius, space, useTheme } from "@/theme";

const MINOR = 16;
const MAJOR = MINOR * 5;

/**
 * The Practice surface: a drafting-paper grid of thin lines, so paper trading never looks like
 * the real-money screens. Purely decorative (hidden from screen readers, ignores touches).
 */
export function Blueprint({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  // Pattern ids are global in the web DOM, so make them unique and url-safe.
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern id={`minor${id}`} width={MINOR} height={MINOR} patternUnits="userSpaceOnUse">
              <Path d={`M${MINOR} 0H0V${MINOR}`} fill="none" stroke={c.borderStrong} strokeOpacity={0.14} strokeWidth={0.5} />
            </Pattern>
            <Pattern id={`major${id}`} width={MAJOR} height={MAJOR} patternUnits="userSpaceOnUse">
              <Path d={`M${MAJOR} 0H0V${MAJOR}`} fill="none" stroke={c.borderStrong} strokeOpacity={0.3} strokeWidth={1} />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#minor${id})`} />
          <Rect width="100%" height="100%" fill={`url(#major${id})`} />
        </Svg>
      </View>
      {children}
    </View>
  );
}

/** Persistent label on the Practice surface. Neutral, never the accent. */
export function PracticeChip() {
  const { c } = useTheme();
  return (
    <View style={[styles.chip, { borderColor: c.borderStrong, backgroundColor: c.practice }]} accessible accessibilityLabel="Practice, virtual money">
      <View style={[styles.dot, { borderColor: c.onPractice }]} />
      <Txt v="micro" color={c.onPractice}>
        PRACTICE · VIRTUAL MONEY
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.lg, overflow: "hidden" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: "dashed",
  },
  dot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
});
