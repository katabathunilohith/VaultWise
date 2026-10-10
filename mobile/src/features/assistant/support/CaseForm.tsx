import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Banner, Button, Chip, ToggleRow, Txt } from "@/components/ui";
import { useActivity } from "@/lib/api/hooks";
import { radius, space, type, useTheme } from "@/theme";
import { addCase, MAX_OPEN_CASES, MESSAGE_MAX, type ActivityAttachment, type SupportCase } from "./cases";
import { TOPICS, type SupportTopic } from "./topics";

/** How many recent money moves go with a case when the person allows it. */
const ACTIVITY_ITEMS = 5;

/**
 * New case: topic, message, "include my recent activity" (on by default, so nobody has to repeat
 * themselves), Send. Primary action inline (pushed screen), never pinned.
 */
export function CaseForm({
  initialTopic,
  reference,
  initialMessage,
  fromChat,
  openCount,
  onSent,
}: {
  initialTopic?: SupportTopic;
  reference?: string;
  initialMessage: string;
  fromChat: boolean;
  openCount: number;
  onSent: (c: SupportCase) => void;
}) {
  const { c } = useTheme();
  const activity = useActivity();
  const [topic, setTopic] = useState<SupportTopic | undefined>(initialTopic);
  const [message, setMessage] = useState(initialMessage);
  const [includeActivity, setIncludeActivity] = useState(true);
  const [sending, setSending] = useState(false);

  const full = openCount >= MAX_OPEN_CASES;
  const ready = !!topic && message.trim().length > 0 && !full;
  const recentCount = Math.min(ACTIVITY_ITEMS, activity.data?.journals.length ?? 0);

  const activityNote = !includeActivity
    ? "Only your message will be sent."
    : activity.isPending
      ? "Getting your recent activity…"
      : activity.isError
        ? "Your recent activity didn't load, so only your message will be sent."
        : recentCount === 0
          ? "You have no recent money moves to add."
          : `Adds your last ${recentCount === 1 ? "money move" : `${recentCount} money moves`}.`;

  const send = async () => {
    if (!ready || !topic) return;
    setSending(true);
    const attached: ActivityAttachment = !includeActivity ? "off" : activity.data ? recentCount : "unavailable";
    try {
      const created = await addCase({ topic, ref: reference, message, attached });
      setMessage("");
      setTopic(undefined);
      onSent(created);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.group}>
        <Txt v="titleM" accessibilityRole="header">
          What&apos;s it about?
        </Txt>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {TOPICS.map((t) => (
            <Chip key={t.key} label={t.label} selected={topic === t.key} onPress={() => setTopic(t.key)} />
          ))}
        </View>
        {reference ? (
          <View style={styles.ref} accessible accessibilityLabel={`Reference ${reference}`}>
            <Txt v="caption" color="textMuted">
              Reference
            </Txt>
            <Txt v="numS">{reference}</Txt>
          </View>
        ) : null}
      </View>

      <View style={styles.group}>
        <Txt v="labelL" importantForAccessibility="no" accessibilityElementsHidden>
          Your message
        </Txt>
        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={MESSAGE_MAX}
          placeholder="Tell us what happened. Amounts and dates help."
          placeholderTextColor={c.textMuted}
          accessibilityLabel="Your message"
          maxFontSizeMultiplier={1.6}
          cursorColor={c.accent}
          selectionColor={c.accent}
          textAlignVertical="top"
          style={[
            styles.input,
            {
              color: c.text,
              backgroundColor: c.surface,
              borderColor: c.border,
              fontFamily: type.bodyL.fontFamily,
              fontSize: type.bodyL.fontSize,
              lineHeight: type.bodyL.lineHeight,
            },
          ]}
        />
        <View style={styles.meta}>
          <Txt v="caption" color="textMuted" style={styles.flex}>
            {fromChat ? "We added your question from the chat. Edit it if you like." : ""}
          </Txt>
          <Txt v="numS" color="textMuted" accessibilityLabel={`${message.length} of ${MESSAGE_MAX} characters`}>
            {message.length}/{MESSAGE_MAX}
          </Txt>
        </View>
      </View>

      <ToggleRow
        title="Include my recent activity so you don't have to repeat yourself"
        subtitle={activityNote}
        value={includeActivity}
        onChange={setIncludeActivity}
      />

      {full ? (
        <Banner tone="warning" title={`You have ${MAX_OPEN_CASES} open cases`} body="Close one below to start another." />
      ) : null}
      <Button label="Send" disabled={!ready} loading={sending} onPress={() => void send()} />
      {!ready && !full ? (
        <Txt v="caption" color="textMuted" align="center">
          Pick a topic and write a few words.
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  group: { gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  ref: { flexDirection: "row", alignItems: "center", gap: space.xs },
  input: { minHeight: 132, maxHeight: 240, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.md, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 },
  meta: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
  flex: { flex: 1 },
});
