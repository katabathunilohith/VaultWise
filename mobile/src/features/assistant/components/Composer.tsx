import { useState } from "react";
import { Platform, StyleSheet, TextInput, useWindowDimensions, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from "react-native";
import { PaperPlaneRightIcon } from "@/components/icons";
import { Press } from "@/components/ui";
import { layout, type, useTheme } from "@/theme";

const LINE = type.bodyL.lineHeight;
const PAD_V = 10;
const MIN_H = layout.hit;
const MAX_SCALE = 1.6;
export const MESSAGE_LIMIT = 1000;

/**
 * Full-width composer, at least 48 pt, growing to five lines, with a 44 pt Send button trailing.
 * On the web, Enter sends and Shift+Enter adds a line.
 */
export function Composer({
  value,
  onChange,
  onSend,
  busy,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  busy: boolean;
}) {
  const { c } = useTheme();
  const { fontScale } = useWindowDimensions();
  /** Grows to five lines (at the current text size), then scrolls inside. */
  const maxH = Math.ceil(LINE * Math.min(MAX_SCALE, Math.max(1, fontScale)) * 5 + PAD_V * 2);
  const [height, setHeight] = useState<number>(MIN_H);
  const canSend = !busy && value.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    onSend();
    setHeight(MIN_H);
  };

  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (Platform.OS !== "web") return;
    const ev = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean; isComposing?: boolean };
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: c.surface, borderColor: c.border }]}>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline
        maxLength={MESSAGE_LIMIT}
        placeholder="Ask about your vaults"
        placeholderTextColor={c.textMuted}
        accessibilityLabel="Message Vaultwise AI"
        maxFontSizeMultiplier={MAX_SCALE}
        cursorColor={c.accent}
        selectionColor={c.accent}
        onKeyPress={onKeyPress}
        onContentSizeChange={(e) => setHeight(Math.min(maxH, Math.max(MIN_H, Math.ceil(e.nativeEvent.contentSize.height))))}
        scrollEnabled={height >= maxH}
        style={[
          styles.input,
          {
            color: c.text,
            fontFamily: type.bodyL.fontFamily,
            fontSize: type.bodyL.fontSize,
            lineHeight: LINE,
            height,
          },
        ]}
      />
      <Press
        accessibilityLabel="Send"
        accessibilityState={{ disabled: !canSend, busy }}
        disabled={!canSend}
        hapticOnPressIn={canSend ? "tap.primary" : null}
        onPress={send}
        style={[styles.send, { backgroundColor: canSend ? c.primary : c.surfaceRaised }]}
      >
        <PaperPlaneRightIcon size={22} color={canSend ? c.onPrimary : c.textMuted} weight="fill" />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    minHeight: 52,
    paddingStart: 14,
    paddingEnd: 4,
    paddingVertical: 3,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  input: { flex: 1, paddingTop: PAD_V, paddingBottom: PAD_V, paddingHorizontal: 0, textAlignVertical: "top" },
  send: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
});
