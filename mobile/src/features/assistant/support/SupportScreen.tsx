import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, PracticeBadge, SectionHeader, Skeleton, Txt, useNow } from "@/components/ui";
import { layout, radius, space, useTheme } from "@/theme";
import { clearHandoff, peekHandoff } from "../handoff";
import { CaseCard } from "./CaseCard";
import { CaseForm } from "./CaseForm";
import { caseStatus, useCases, type SupportCase } from "./cases";
import { SentCard } from "./SentCard";
import { SupportHeader } from "./SupportHeader";
import { clockTime, ordinal } from "./time";
import type { SupportTopic } from "./topics";

/**
 * Talk to a person (pushed, calm). There's no support service behind Practice mode, so the
 * screen says plainly that cases are simulated — then works like the real thing: a case number,
 * a place in line, an exact reply time and a tracker.
 */
export function SupportScreen({ topic, reference }: { topic?: SupportTopic; reference?: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const cases = useCases();
  const now = useNow(30_000);
  const scroll = useRef<ScrollView>(null);
  const [sent, setSent] = useState<SupportCase | null>(null);

  // Context handed over by the assistant (read once; route params win).
  const [handoff] = useState(peekHandoff);
  useEffect(() => clearHandoff(), []);
  const question = handoff?.question?.trim().slice(0, 300);
  const initialMessage = question ? `About my chat with Vaultwise AI: "${question}"` : "";

  // The just-sent case is shown above the form; if it gets closed from the list, drop it.
  const sentCase = sent && cases?.some((x) => x.id === sent.id) ? sent : null;

  const onSent = (created: SupportCase) => {
    setSent(created);
    scroll.current?.scrollTo({ y: 0, animated: true });
    const { position } = caseStatus(created, Date.now());
    AccessibilityInfo.announceForAccessibility(
      `Sent. Case ${created.id}. You're ${ordinal(position)} in line. Expected reply by ${clockTime(created.replyBy)}.`,
    );
  };

  return (
    <View style={[styles.fill, { backgroundColor: c.bg }]}>
      <SupportHeader />
      <KeyboardAvoidingView behavior="padding" enabled={Platform.OS === "android"} style={styles.fill}>
        <ScrollView
          ref={scroll}
          style={styles.fill}
          contentContainerStyle={[styles.content, { paddingBottom: layout.tabRootBottomPad + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={styles.titleBlock}>
            <Txt v="headline" accessibilityRole="header">
              Talk to a person
            </Txt>
            <PracticeBadge />
          </View>
          <Banner
            tone="info"
            title="Practice mode"
            body="In Practice mode cases are simulated — nobody is on the other end yet."
          />

          {sentCase ? <SentCard item={sentCase} now={now} /> : null}

          <CaseForm
            // A fresh form after each send keeps the inputs simple.
            key={sentCase?.id ?? "new"}
            initialTopic={sentCase ? undefined : (topic ?? handoff?.topic)}
            reference={sentCase ? undefined : reference}
            initialMessage={sentCase ? "" : initialMessage}
            fromChat={!sentCase && !!question}
            openCount={cases?.length ?? 0}
            onSent={onSent}
          />

          <SectionHeader title="Your open cases" />
          {cases === null ? (
            <View style={styles.list} accessible accessibilityLabel="Loading your cases">
              <Skeleton height={64} r={radius.lg} />
              <Skeleton height={64} r={radius.lg} />
            </View>
          ) : cases.length === 0 ? (
            <Txt v="bodyM" color="textMuted">
              No open cases. Cases you send show up here with a reply time.
            </Txt>
          ) : (
            <View style={styles.list}>
              {cases.map((item) => (
                <CaseCard key={item.id} item={item} now={now} />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, paddingTop: space.xs, gap: space.lg, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  titleBlock: { gap: space.xs },
  list: { gap: space.sm },
});
