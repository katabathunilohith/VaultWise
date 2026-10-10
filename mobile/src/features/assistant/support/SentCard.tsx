import { StyleSheet, Text, View } from "react-native";
import { CheckCircleIcon } from "@/components/icons";
import { Timeline, Txt } from "@/components/ui";
import { fonts, radius, space, useTheme } from "@/theme";
import { caseStatus, type SupportCase } from "./cases";
import { caseSteps } from "./caseSteps";
import { clockTime, ordinal } from "./time";

/** Outcome first, then the numbers: "Sent. Case VW-48213", place in line, exact reply time. */
export function SentCard({ item, now }: { item: SupportCase; now: number }) {
  const { c } = useTheme();
  const { stage, position } = caseStatus(item, now);
  const line = stage === "queued" ? `You're ${ordinal(position)} in line. ` : "";
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLiveRegion="polite">
      <View style={styles.head}>
        <CheckCircleIcon size={24} color={c.success} weight="fill" />
        <Txt v="titleM" accessibilityRole="header" style={styles.flex}>
          Sent. Case <Text style={styles.mono}>{item.id}</Text>
        </Txt>
      </View>
      <Txt v="bodyM">
        {line}Expected reply by {clockTime(item.replyBy, now)}.
      </Txt>
      <Timeline steps={caseSteps(item, now)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  flex: { flex: 1 },
  mono: { fontFamily: fonts.monoMedium },
});
