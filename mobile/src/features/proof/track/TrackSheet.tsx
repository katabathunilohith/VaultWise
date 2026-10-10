import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XIcon } from "@/components/icons";
import { EmptyState, PracticeBadge, Press, Txt } from "@/components/ui";
import { layout, space, useTheme } from "@/theme";
import { EmergencyTrack } from "./EmergencyTrack";
import { ProofTrack } from "./ProofTrack";

export type TrackKind = "proof" | "emergency";

const TITLE: Record<TrackKind, string> = { proof: "Where it is now", emergency: "Emergency payout" };

/**
 * The compact tracker sheet other areas open with `/track?kind=proof|emergency&id=…`.
 * Plain copy and exact times; a person is always one tap away.
 */
export function TrackSheet({ kind, id }: { kind?: string; id?: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const known = kind === "proof" || kind === "emergency";
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 6 }}>
          <PracticeBadge />
          <Txt v="titleL" accessibilityRole="header">
            {known ? TITLE[kind] : "Tracker"}
          </Txt>
        </View>
        <Press
          accessibilityLabel="Close"
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={[styles.close, { backgroundColor: c.surfaceRaised }]}
        >
          <XIcon size={20} color={c.text} weight="bold" />
        </Press>
      </View>
      {known && id ? (
        kind === "proof" ? (
          <ProofTrack key={id} id={id} />
        ) : (
          <EmergencyTrack key={id} id={id} />
        )
      ) : (
        <EmptyState title="Nothing to track" body="Open a withdrawal or an emergency payout to see where it is." />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: space.xl, gap: space.lg, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  close: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
});
