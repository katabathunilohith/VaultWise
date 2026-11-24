import { useRef, useState, type Ref } from "react";
import { ActivityIndicator, StyleSheet, TextInput, View, type TextInputInstance } from "react-native";
import { router, type Href } from "expo-router";
import { InfoIcon, WarningCircleIcon } from "@/components/icons";
import { Banner, Button, Row, Stack, Txt } from "@/components/ui";
import { formatWait } from "@/features/account/PinLayout";
import { StepScreen } from "@/features/account/layout";
import { errorMessage } from "@/lib/api/errors";
import { usePracticeMode } from "@/lib/api/practice";
import { fonts, layout, radius, space, useTheme } from "@/theme";
import { OTP_LENGTH, VERIFY_PHONE_ROUTE } from "./config";
import type { OtpController } from "./useOtp";

/**
 * Type the 6-digit code (calm core): where it went, a test-mode note with the code when the server
 * (or Practice) hands it back, the code field (it fills itself from the text on phones that offer
 * it), what went wrong in words, and "Send a new code" after a short wait. Six digits check
 * themselves; Continue does the same.
 */
export function OtpCodeScreen({
  otp,
  title,
  close,
  back,
  step,
  busy = false,
  onVerified,
}: {
  otp: OtpController;
  title: string;
  close?: () => void;
  back?: () => void;
  step?: { n: number; of: number };
  /** The flow is using the token (e.g. saving the number): the button spins meanwhile. */
  busy?: boolean;
  onVerified: (verificationToken: string) => void;
}) {
  const [code, setCode] = useState("");
  const input = useRef<TextInputInstance>(null);
  const practice = usePracticeMode();

  const submit = async (typed = code) => {
    if (typed.length !== OTP_LENGTH || otp.checking || busy) return;
    const token = await otp.verify(typed);
    // A refused code clears the field for the next try.
    if (token) onVerified(token);
    else setCode("");
  };
  const onChange = (t: string) => {
    const digits = t.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setCode(digits);
    if (digits.length === OTP_LENGTH) void submit(digits);
  };
  const resend = () => {
    setCode("");
    void otp.send().then((ok) => ok && input.current?.focus());
  };

  const where = otp.sent?.sentTo ?? "your phone";
  const intro = otp.sent
    ? `We sent a 6-digit code to ${where}. It works for 5 minutes.`
    : otp.sending
      ? "Sending a code to your phone."
      : "We'll text a 6-digit code to your phone.";
  const canType = !!otp.sent && !otp.needsNewCode;

  return (
    <StepScreen
      close={close}
      back={back}
      step={step}
      keyboard
      footer={
        <Button
          label="Continue"
          armOnMount
          loading={otp.checking || busy}
          disabled={!canType || code.length !== OTP_LENGTH}
          onPress={() => void submit()}
        />
      }
    >
      <Stack gap={space.xs}>
        <Txt v="headline" accessibilityRole="header">
          {title}
        </Txt>
        <Txt v="bodyL" color="textMuted">
          {intro}
        </Txt>
      </Stack>

      {otp.sent?.testCode ? (
        <Banner
          tone="info"
          title={`Test mode code: ${otp.sent.testCode}`}
          body={
            practice
              ? "Practice doesn't send texts. Type this code to carry on."
              : "This server is in test mode, so no text is sent. Type this code to carry on."
          }
          action={canType ? { label: "Use this code", onPress: () => onChange(otp.sent?.testCode ?? "") } : undefined}
        />
      ) : null}

      <CodeField ref={input} value={code} onChangeText={onChange} editable={canType && !otp.checking && !busy} />

      <Status otp={otp} busy={busy} />

      {otp.problem?.kind === "phone_required" ? (
        <Button label="Add your phone number" variant="tonal" size="md" onPress={() => router.push(VERIFY_PHONE_ROUTE as Href)} />
      ) : (
        <Row>
          <Button
            label={otp.secondsToResend > 0 ? `Send a new code in ${formatWait(otp.secondsToResend)}` : otp.sent ? "Send a new code" : "Send the code"}
            variant="ghost"
            size="sm"
            haptic="select.tick"
            disabled={otp.secondsToResend > 0 || otp.sending}
            loading={otp.sending && !!otp.sent}
            onPress={resend}
          />
        </Row>
      )}
    </StepScreen>
  );
}

/** One field for the 6 digits, in mono so they don't jump. SMS autofill on iOS and Android. */
function CodeField({
  ref,
  value,
  onChangeText,
  editable,
}: {
  ref: Ref<TextInputInstance>;
  value: string;
  onChangeText: (t: string) => void;
  editable: boolean;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Txt v="labelM" nativeID="otp-code-label">
        6-digit code
      </Txt>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        autoFocus
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH}
        accessibilityLabel="6-digit code"
        accessibilityLabelledBy="otp-code-label"
        placeholder="••••••"
        placeholderTextColor={c.textMuted}
        selectionColor={c.accent}
        cursorColor={c.accent}
        maxFontSizeMultiplier={1.4}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.field, { color: c.text, backgroundColor: c.surface, borderColor: focused ? c.accent : c.border, opacity: editable ? 1 : 0.6 }]}
      />
    </View>
  );
}

/** Checking, or what went wrong: words and an icon, never colour alone. */
function Status({ otp, busy }: { otp: OtpController; busy: boolean }) {
  const { c } = useTheme();
  let content = null;
  if (otp.checking || busy)
    content = (
      <Row gap={space.xs}>
        <ActivityIndicator color={c.textMuted} />
        <Txt v="bodyM" color="textMuted">
          {busy ? "One moment" : "Checking the code"}
        </Txt>
      </Row>
    );
  else if (otp.problem || otp.failure)
    content = (
      <Row gap={space.xs} style={styles.top}>
        <WarningCircleIcon size={20} color={c.danger} weight="fill" />
        <Txt v="labelM" color="danger" style={styles.flex}>
          {otp.problem?.message ?? errorMessage(otp.failure)}
        </Txt>
      </Row>
    );
  else if (otp.sent && !otp.sent.testCode)
    content = (
      <Row gap={space.xs} style={styles.top}>
        <InfoIcon size={20} color={c.textMuted} />
        <Txt v="bodyM" color="textMuted" style={styles.flex}>
          No text yet? It can take a minute. Check the number ends the way it should.
        </Txt>
      </Row>
    );
  return (
    <View style={styles.status} accessibilityLiveRegion="polite">
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: { gap: 6 },
  field: {
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 16,
    fontFamily: fonts.monoMedium,
    fontSize: 28,
    letterSpacing: 10,
    textAlign: "center",
  },
  status: { minHeight: layout.hit, justifyContent: "center" },
  top: { alignItems: "flex-start" },
  flex: { flexShrink: 1 },
});
