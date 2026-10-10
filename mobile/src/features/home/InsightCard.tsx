import { StyleSheet, View } from "react-native";
import { SparkleIcon } from "@/components/icons";
import { Card, SectionHeader, Skeleton, StatusPill, Txt } from "@/components/ui";
import { useInsight } from "@/lib/api/hooks";
import { space, useTheme } from "@/theme";
import { LightbulbIcon } from "./icons";
import { InlineError } from "./InlineError";

/** "Your week": one plain-language read of recent saving, labelled "AI" when a model wrote it. */
export function InsightCard() {
  const { c } = useTheme();
  const q = useInsight();
  return (
    <View style={styles.wrap}>
      <SectionHeader title="Your week" />
      <Card>
        {q.isPending ? (
          <View style={{ gap: space.xs }} accessibilityLabel="Loading your week">
            <Skeleton height={20} width="60%" />
            <Skeleton height={16} />
            <Skeleton height={16} width="80%" />
          </View>
        ) : q.isError ? (
          <InlineError what="Your week" error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <View style={styles.head}>
              <Txt v="titleM" style={{ flex: 1 }}>
                {q.data.headline}
              </Txt>
              {q.data.source === "ai" ? <StatusPill tone="accent" label="AI" icon={SparkleIcon} /> : null}
            </View>
            <Txt v="bodyM">{q.data.body}</Txt>
            {q.data.tip ? (
              <View style={styles.tip}>
                <LightbulbIcon size={18} color={c.textMuted} />
                <Txt v="bodyM" color="textMuted" style={{ flex: 1 }}>
                  {q.data.tip}
                </Txt>
              </View>
            ) : null}
            <Txt v="caption" color="textMuted">
              {q.data.source === "ai" ? "Written by AI from your activity. It can get things wrong." : "Worked out from your activity."}
            </Txt>
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  tip: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
});
