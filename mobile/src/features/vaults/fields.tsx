import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Text, TextInput, View, StyleSheet, type TextInputProps } from "react-native";
import { AmountKeypad, Button, Chip, Txt } from "@/components/ui";
import { money, moneyParts, parseAmount } from "@/lib/money";
import { fonts, radius, space, type, useTheme } from "@/theme";

/**
 * The bottom slot for keypad steps (R8): the amount keypad sits in the lower middle, directly
 * above the main button (R1). ModalScreen measures this footer, keypad included, and pads its
 * scroll content to clear it, so the step needs no spacer of its own.
 */
export function KeypadFooter({
  value,
  onChange,
  label,
  onPress,
  disabled,
  loading,
  stepKey,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Changes per step so the main button re-arms (ignores taps for 400 ms). */
  stepKey: string | number;
}) {
  return (
    <>
      <AmountKeypad value={value} onChange={onChange} />
      <Button key={stepKey} label={label} onPress={onPress} disabled={disabled} loading={loading} armOnMount />
    </>
  );
}

/** Shows what's being typed on the amount keypad: symbol at 55%, grouped digits, decimals as typed. */
export function TypedAmount({ value, currency, caption }: { value: string; currency: string; caption?: string }) {
  const { c } = useTheme();
  const [whole, dec] = value.split(".");
  const parts = moneyParts(Number(whole || "0") * 100, currency);
  const t = type.displayL;
  const empty = !value;
  const minor = parseAmount(value);
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${caption ? `${caption}: ` : ""}${minor ? money(minor, currency) : "no amount entered"}`}
      style={styles.typed}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        adjustsFontSizeToFit
        numberOfLines={1}
        style={{
          fontFamily: t.fontFamily,
          fontSize: t.fontSize,
          lineHeight: t.lineHeight,
          letterSpacing: t.letterSpacing,
          color: empty ? c.textMuted : c.text,
        }}
      >
        <Text style={{ fontSize: Math.round(t.fontSize * 0.55) }}>{parts.symbol}</Text>
        {empty ? "0" : parts.whole}
        {value.includes(".") ? <Text style={{ fontSize: Math.round(t.fontSize * 0.55) }}>.{dec}</Text> : null}
      </Text>
    </View>
  );
}

/** Single-line text field in the Vaultwise style (56 pt, labelled). */
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

/** Keeps a modal's bottom slot above the iOS keyboard on steps with text fields. */
export function KeyboardSafe({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {children}
    </KeyboardAvoidingView>
  );
}

/** A row of equal-width choice chips (dates, frequencies, percentages). */
export function ChoiceRow<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.choiceRow}>
      {options.map((o) => (
        <View key={String(o.value)} style={styles.choice}>
          <Chip label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  typed: { alignItems: "center", justifyContent: "center", minHeight: 56 },
  input: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: space.md,
    fontFamily: fonts.body,
    fontSize: 17,
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  choice: { flexGrow: 1, flexBasis: "22%" },
});
