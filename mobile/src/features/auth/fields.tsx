import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { CheckCircleIcon, EyeIcon, EyeSlashIcon } from "@/components/icons";
import { Press, Txt } from "@/components/ui";
import { FieldError } from "@/features/account/controls";
import { TextField } from "@/features/account/onboarding/TextField";
import { fonts, layout, radius, useTheme } from "@/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (v: string) => EMAIL.test(v.trim());

/** Email for signing in: no capitals, no autocorrect, the email keyboard. */
export const EmailField = forwardRef<TextInput, Omit<TextInputProps, "style"> & { label?: string; hint?: string; error?: string | null }>(function EmailField(
  { label = "Email", ...rest },
  ref,
) {
  return (
    <TextField
      ref={ref}
      label={label}
      placeholder="you@example.com"
      keyboardType="email-address"
      autoComplete="email"
      textContentType="emailAddress"
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      {...rest}
    />
  );
});

/** The rules a new password must meet, shown as a checklist that ticks as you type. */
export const PASSWORD_RULES: { key: string; label: string; test: (p: string) => boolean }[] = [
  { key: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "letter", label: "At least one letter", test: (p) => /[A-Za-z]/.test(p) },
  { key: "number", label: "At least one number", test: (p) => /\d/.test(p) },
];

export const passwordOk = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

interface PasswordProps extends Omit<TextInputProps, "style" | "secureTextEntry"> {
  label?: string;
  error?: string | null;
  /** "new" for creating a login: the system can suggest a strong password. */
  purpose: "current" | "new";
}

/** Password with a Show/Hide control (44 pt), so people can check what they typed. */
export const PasswordField = forwardRef<TextInput, PasswordProps>(function PasswordField(
  { label = "Password", error, purpose, onFocus, onBlur, ...rest },
  ref,
) {
  const { c } = useTheme();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const Eye = visible ? EyeSlashIcon : EyeIcon;
  return (
    <View style={styles.wrap}>
      <Txt v="labelM" nativeID={`${label}-label`}>
        {label}
      </Txt>
      <View style={[styles.box, { backgroundColor: c.surface, borderColor: error ? c.danger : focused ? c.accent : c.border }]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityLabelledBy={`${label}-label`}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete={purpose === "new" ? "new-password" : "current-password"}
          textContentType={purpose === "new" ? "newPassword" : "password"}
          passwordRules={purpose === "new" ? "minlength: 8; required: lower, upper; required: digit;" : undefined}
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
          style={[styles.input, { color: c.text }]}
          {...rest}
        />
        <Press
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          accessibilityState={{ checked: visible }}
          hitSlop={4}
          scaleTo={0.94}
          onPress={() => setVisible((v) => !v)}
          style={styles.eye}
        >
          <Eye size={22} color={c.textMuted} />
        </Press>
      </View>
      {error ? <FieldError text={error} /> : null}
    </View>
  );
});

/** The new-password checklist: each rule with a tick once it's met (icon and words, not colour alone). */
export function PasswordRules({ password }: { password: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.rules} accessibilityRole="list">
      {PASSWORD_RULES.map((r) => {
        const met = r.test(password);
        return (
          <View key={r.key} style={styles.rule} accessible accessibilityLabel={`${r.label}. ${met ? "Done" : "Not yet"}`}>
            <CheckCircleIcon size={18} color={met ? c.success : c.textMuted} weight={met ? "fill" : "regular"} />
            <Txt v="caption" color={met ? "text" : "textMuted"}>
              {r.label}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: { flexDirection: "row", alignItems: "center", minHeight: layout.rowMin, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth * 2 },
  input: { flex: 1, alignSelf: "stretch", paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 17 },
  eye: { width: layout.hit, height: layout.hit, alignItems: "center", justifyContent: "center", marginRight: 6 },
  rules: { gap: 6 },
  rule: { flexDirection: "row", alignItems: "center", gap: 8 },
});
