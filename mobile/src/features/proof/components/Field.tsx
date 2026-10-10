import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Txt } from "@/components/ui";
import { fonts, radius, useTheme } from "@/theme";

/** Labelled text input, 56 pt tall (taller when multiline), with an optional hint below. */
export const Field = forwardRef<TextInput, TextInputProps & { label: string; hint?: string | null; error?: boolean }>(function Field(
  { label, hint, error, multiline, style, onFocus, onBlur, ...rest },
  ref,
) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Txt v="labelM" color="textMuted">
        {label}
      </Txt>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={c.textMuted}
        selectionColor={c.accent}
        multiline={multiline}
        maxFontSizeMultiplier={1.6}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            color: c.text,
            backgroundColor: c.surface,
            borderColor: error ? c.danger : focused ? c.accent : c.border,
            // The focus colour is the border above; the browser's own outline is turned off.
            outlineWidth: 0,
            minHeight: multiline ? 96 : 56,
            textAlignVertical: multiline ? "top" : "center",
            paddingTop: multiline ? 14 : undefined,
          },
          style,
        ]}
      />
      {hint ? (
        <Txt v="caption" color={error ? "danger" : "textMuted"}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  input: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.md, paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 17 },
});
