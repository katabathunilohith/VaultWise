import { I18nManager, ScrollView, StyleSheet, View } from "react-native";
import { CaretRightIcon, HeadsetIcon, ShieldCheckIcon } from "@/components/icons";
import { Button, Press, Txt } from "@/components/ui";
import { layout, radius, space, useTheme } from "@/theme";

export const SUGGESTIONS = [
  "Am I on track for Health?",
  "How does emergency money work?",
  "Why might a proof get declined?",
  "What's coming out this week?",
];

/** Suggested prompts directly above the composer; one tap sends. Horizontal row with 16 pt insets. */
export function SuggestionChips({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  const { c } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.chips}
      accessibilityLabel="Suggested questions"
    >
      {SUGGESTIONS.map((s) => (
        <Press
          key={s}
          accessibilityLabel={s}
          accessibilityHint="Sends this question"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onPick(s)}
          style={[styles.chip, { backgroundColor: c.surface, borderColor: c.border, opacity: disabled ? 0.5 : 1 }]}
        >
          <Txt v="labelM" numberOfLines={1}>
            {s}
          </Txt>
        </Press>
      ))}
    </ScrollView>
  );
}

/** A person is always reachable: shown after two replies, or straight away when it sounds urgent. */
export function TalkToPersonLink({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Press
      accessibilityRole="link"
      accessibilityLabel="Talk to a person"
      accessibilityHint="Opens support, with your question filled in"
      onPress={onPress}
      scaleTo={0.99}
      style={[styles.person, { borderColor: c.border }]}
    >
      <HeadsetIcon size={20} color={c.accent} />
      <Txt v="labelM" color="accent" style={styles.flex}>
        Talk to a person
      </Txt>
      <CaretRightIcon size={16} color={c.textMuted} mirrored={I18nManager.isRTL} />
    </Press>
  );
}

/** Consent before the first question: names the provider and what's sent (Apple 5.1.2(i), EU AI Act Art. 50). */
export function ConsentCard({ onAgree, onDecline, demo }: { onAgree: () => void; onDecline: () => void; demo: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.consent, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.consentHead}>
        <ShieldCheckIcon size={22} color={c.text} />
        <Txt v="titleM" accessibilityRole="header" style={styles.flex}>
          Before you ask
        </Txt>
      </View>
      <Txt v="bodyM">
        Your question and a summary of your vault balances go to Groq, an AI provider, to write a reply. Answers can be wrong — check anything
        important.
      </Txt>
      <Txt v="caption" color="textMuted">
        {demo ? "Right now the app is in demo mode, so answers come from sample data on this phone. " : ""}
        You can change this later in Settings.
      </Txt>
      <Button label="Not now" variant="tonal" size="md" onPress={onDecline} />
      <Button label="Agree and continue" armOnMount onPress={onAgree} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { paddingHorizontal: layout.gutter, gap: space.xs },
  chip: {
    minHeight: layout.hit,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: layout.hit,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  consent: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  consentHead: { flexDirection: "row", alignItems: "center", gap: 10 },
});
