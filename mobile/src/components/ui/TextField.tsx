import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { fonts, radius, space, useTheme } from "@/theme";
import { Txt } from "./Txt";

/** A labelled single-line text input with an optional hint underneath. */
export function TextField({ label, hint, ...rest }: TextInputProps & { label: string; hint?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Txt v="labelM" color="textMuted">
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={c.textMuted}
        selectionColor={c.accent}
        maxFontSizeMultiplier={1.6}
        {...rest}
        style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
      />
      {hint ? (
        <Txt v="caption" color="textMuted">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: space.md,
    fontFamily: fonts.body,
    fontSize: 17,
  },
});
