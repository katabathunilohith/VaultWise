import { StyleSheet, View } from "react-native";
import { PracticeBadge, ProfileAvatar, Segmented, Stack, Txt } from "@/components/ui";
import { layout, space } from "@/theme";

export type InvestView = "core" | "practice";

const VIEWS: { value: InvestView; label: string }[] = [
  { value: "core", label: "Core" },
  { value: "practice", label: "Practice" },
];

/** Tab-root header: avatar (top-leading, opens settings), large title, Practice badge, view switch. */
export function InvestHeader({ view, onView }: { view: InvestView; onView: (v: InvestView) => void }) {
  return (
    <Stack gap={space.sm}>
      <View style={styles.topRow}>
        <ProfileAvatar />
      </View>
      <Txt v="displayM" accessibilityRole="header">
        Invest
      </Txt>
      <PracticeBadge />
      <View style={{ marginTop: space.xs }}>
        <Segmented value={view} options={VIEWS} onChange={onView} />
      </View>
    </Stack>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", minHeight: layout.hit },
});
