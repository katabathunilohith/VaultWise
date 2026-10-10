import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Txt } from "@/components/ui";
import { fonts, layout, radius, useTheme } from "@/theme";
import { FieldError } from "../controls";

interface Props extends Omit<TextInputProps, "style"> {
  label: string;
  hint?: string;
  error?: string | null;
}

/** Labelled text field: 56 pt tall, label above, hint or error below (error has an icon). */
export const TextField = forwardRef<TextInput, Props>(function TextField({ label, hint, error, onFocus, onBlur, ...rest }, ref) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Txt v="labelM" nativeID={`${label}-label`}>
        {label}
      </Txt>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityLabelledBy={`${label}-label`}
        placeholderTextColor={c.textMuted}
        selectionColor={c.accent}
        cursorColor={c.accent}
        maxFontSizeMultiplier={1.6}
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
          },
        ]}
        {...rest}
      />
      {error ? (
        <FieldError text={error} />
      ) : hint ? (
        <Txt v="caption" color="textMuted">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    minHeight: layout.rowMin,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 17,
  },
});
