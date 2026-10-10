import { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Banner, Button, Chip, ModalScreen, PracticeBadge, Stack, Txt } from "@/components/ui";
import { EMERGENCY_REASONS } from "@/lib/api/types";
import { radius, space, type, useTheme } from "@/theme";
import { NOTE_MAX, NOTE_MIN, REASON_ICONS } from "../copy";

const REASONS = Object.entries(EMERGENCY_REASONS);
/** Two per row, so the grid stays two columns at any width. */
const ROWS: [string, string][][] = [];
for (let i = 0; i < REASONS.length; i += 2) ROWS.push(REASONS.slice(i, i + 2));

export function ReasonStep({
  reason,
  onReason,
  note,
  onNote,
  noteRequired,
  notice,
  onBack,
  onContinue,
}: {
  reason: string | null;
  onReason: (code: string) => void;
  note: string;
  onNote: (t: string) => void;
  noteRequired: boolean;
  /** Shown when the server asked for something we didn't have (e.g. a longer note). */
  notice: string | null;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { c } = useTheme();
  const noteOk = !noteRequired || note.trim().length >= NOTE_MIN;
  const short = Math.max(0, NOTE_MIN - note.trim().length);
  const scroll = useRef<ScrollView>(null);
  const keyboard = useKeyboardShown();
  return (
    <ModalScreen
      title="Emergency money"
      back={onBack}
      headerRight={<PracticeBadge compact />}
      scroll={false}
      // While typing the note the keyboard covers the bottom slot; Continue returns when it closes.
      footer={keyboard ? undefined : <Button label="Continue" armOnMount disabled={!reason || !noteOk} onPress={onContinue} />}
    >
      <ScrollView
        ref={scroll}
        style={styles.fill}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <Stack gap={space.xs}>
          <Txt v="headline" accessibilityRole="header">
            What&apos;s it for?
          </Txt>
          <Txt v="bodyM" color="textMuted">
            Pick the closest one. It helps a person help you faster if you ever need one.
          </Txt>
        </Stack>

        {notice ? <Banner tone="warning" title={notice} /> : null}

        <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Reason">
          {ROWS.map((row) => (
            <View key={row.map(([code]) => code).join("-")} style={styles.row}>
              {row.map(([code, label]) => (
                <View key={code} style={styles.cell}>
                  <Chip tall label={label} icon={REASON_ICONS[code]} selected={reason === code} onPress={() => onReason(code)} />
                </View>
              ))}
              {row.length === 1 ? <View style={styles.cell} /> : null}
            </View>
          ))}
        </View>

        <Stack gap={space.xs}>
          <Txt v="labelM" nativeID="emergency-note-label">
            {noteRequired ? "Add a short note" : "Add a note (optional)"}
          </Txt>
          {noteRequired ? (
            <Txt v="bodyM" color="textMuted">
              You&apos;ve used emergency money this month, so add a few words about what happened.
            </Txt>
          ) : null}
          <TextInput
            value={note}
            onChangeText={onNote}
            multiline
            maxLength={NOTE_MAX}
            placeholder="For example: urgent care visit for a fever"
            placeholderTextColor={c.textMuted}
            accessibilityLabel={noteRequired ? "Note, required" : "Note, optional"}
            accessibilityLabelledBy="emergency-note-label"
            onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300)}
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            maxFontSizeMultiplier={1.6}
            style={[
              styles.input,
              {
                color: c.text,
                backgroundColor: c.surface,
                borderColor: noteRequired && !noteOk && note.length > 0 ? c.warning : c.border,
                fontFamily: type.bodyL.fontFamily,
                fontSize: type.bodyL.fontSize,
                lineHeight: type.bodyL.lineHeight,
              },
            ]}
          />
          <Txt v="caption" color="textMuted" accessibilityLiveRegion="polite">
            {noteRequired && short > 0 ? `${short} more ${short === 1 ? "character" : "characters"} needed` : `${note.length} of ${NOTE_MAX}`}
          </Txt>
        </Stack>
      </ScrollView>
    </ModalScreen>
  );
}

function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const a = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", () => setShown(true));
    const b = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setShown(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return shown;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: space.lg, paddingBottom: space.md },
  grid: { gap: space.xs },
  row: { flexDirection: "row", gap: space.xs },
  cell: { flex: 1 },
  input: {
    minHeight: 96,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: "top",
  },
});
