import { StyleSheet, View } from "react-native";
import { Segmented, Txt } from "@/components/ui";
import { layout, space } from "@/theme";
import { TONES, type Tone } from "../tone";

/** Straight (default) · Hype · Roast, with a one-line note on what the chosen voice does. */
export function ToneDial({ value, onChange }: { value: Tone; onChange: (t: Tone) => void }) {
  const hint = TONES.find((t) => t.value === value)?.hint ?? "";
  return (
    <View style={styles.wrap}>
      <Segmented value={value} options={TONES.map(({ value: v, label }) => ({ value: v, label }))} onChange={onChange} />
      <Txt v="caption" color="textMuted" accessibilityLiveRegion="polite">
        {hint}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.gutter, gap: 6, paddingBottom: space.xs, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
});
