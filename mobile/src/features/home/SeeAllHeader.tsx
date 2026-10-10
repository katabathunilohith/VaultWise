import { StyleSheet, View } from "react-native";
import { Press, Txt } from "@/components/ui";
import { layout, space } from "@/theme";

/**
 * Section title with a "See all" link. Same look as the kit's SectionHeader, but the link carries
 * a specific screen-reader label ("See all coming up"): Home has three "See all" links and a
 * list of identical labels tells a VoiceOver/TalkBack user nothing.
 */
export function SeeAllHeader({ title, onPress, label }: { title: string; onPress: () => void; label: string }) {
  return (
    <View style={styles.section}>
      <Txt v="titleL" accessibilityRole="header" style={styles.title}>
        {title}
      </Txt>
      <Press onPress={onPress} hitSlop={10} style={styles.action} accessibilityRole="link" accessibilityLabel={label}>
        <Txt v="labelM" color="accent">
          See all
        </Txt>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.hit, marginTop: space.xs, gap: space.sm },
  title: { flexShrink: 1 },
  action: { minHeight: layout.hit, justifyContent: "center", paddingHorizontal: 4 },
});
