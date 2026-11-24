import { useCallback, useRef, useState, type ComponentType } from "react";
import { StyleSheet, View } from "react-native";
import { CheckCircleIcon } from "@/components/icons";
import { Banner, Button, Stack, Txt, useHardwareBack } from "@/components/ui";
import { goBack, StepScreen } from "@/features/account/layout";
import { TextField } from "@/features/account/onboarding/TextField";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { queryClient, useMe } from "@/lib/api/hooks";
import { invalidate } from "@/lib/api/keys";
import { usePracticeMode } from "@/lib/api/practice";
import { haptic } from "@/lib/haptics";
import { space, useTheme } from "@/theme";
import { readOtpError } from "./errors";
import { OtpCodeScreen } from "./OtpCodeScreen";
import { cleanPhone, dialCodeFor, phoneProblem } from "./phone";
import { useOtp } from "./useOtp";

type Step = "number" | "code" | "mpin" | "done";

/**
 * mpin: the MPIN prompt (features/mpin MpinPanel), handed in by the route (app/settings/verify-phone.tsx),
 * because features/mpin already uses this module's code step for Forgot your MPIN.
 */
export type PhoneMpinPanel = ComponentType<{
  reason: string;
  run: (pin: string) => Promise<unknown>;
  onDone: (pin: string, value: unknown) => void;
  onError: (e: unknown) => void;
  onBusy?: (busy: boolean) => void;
  padLift?: number;
}>;

/**
 * Add (or change) your phone number: type it, get a 6-digit code by text, type the code, then the
 * MPIN, and the server keeps the number (POST /otp/send → /otp/verify → /me/phone with the token and
 * the MPIN). Codes for trusting a new phone and resetting the MPIN go to it from then on, so a stolen
 * sign-in alone can't put its own number on the account. The MPIN step is the MPIN prompt itself, so
 * wrong tries and a lock read as everywhere else; a wrong MPIN keeps the code's token, so the next
 * try sends the same token (no new code). A token that ran out goes back for a new code. A new number
 * can't reset the MPIN for 72 hours. The number is only ever shown masked.
 */
export function PhoneVerifyScreen({ MpinPanel }: { MpinPanel: PhoneMpinPanel }) {
  const me = useMe();
  const practice = usePracticeMode();
  const onboarded = me.data?.onboarded ? me.data : null;
  const current = onboarded?.phone?.verified ? onboarded.phone.number : null;
  const otp = useOtp("phone_verify");
  const [step, setStep] = useState<Step>("number");
  const [typed, setTyped] = useState(() => `${dialCodeFor(onboarded?.user.country?.code)} `);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const token = useRef("");

  const sendCode = async () => {
    const problem = phoneProblem(typed);
    if (problem) {
      haptic("error");
      return setFieldError(problem);
    }
    setFieldError(null);
    if (await otp.send(cleanPhone(typed))) setStep("code");
  };

  // mpin: the MPIN prompt sends the same token with each MPIN typed.
  const keep = useCallback((pin: string) => api.attachPhone(token.current, pin), []);
  const kept = useCallback(() => {
    void invalidate(queryClient, "me", "alerts");
    setStep("done");
  }, []);
  const notKept = useCallback(
    (e: unknown) => {
      haptic("error");
      // The code's token ran out (10 minutes) or was used: a new code, then the MPIN again.
      if (readOtpError(e)?.kind === "spent") {
        otp.tokenRefused(e);
        setStep("code");
        return;
      }
      setSaveError(e);
    },
    [otp],
  );

  useHardwareBack(saving ? "block" : step === "mpin" ? () => setStep("code") : step === "code" ? () => setStep("number") : null);

  if (step === "done") return <Done number={me.data?.onboarded ? (me.data.phone?.number ?? null) : null} />;
  if (step === "code")
    return (
      <OtpCodeScreen
        otp={otp}
        title="Enter the code"
        back={() => setStep("number")}
        step={{ n: 2, of: 3 }}
        onVerified={(t) => {
          token.current = t;
          setSaveError(null);
          setStep("mpin");
        }}
      />
    );
  if (step === "mpin")
    return (
      <StepScreen back={saving ? undefined : () => setStep("code")} step={{ n: 3, of: 3 }} scroll={false}>
        {saveError ? <Banner tone="warning" title="Your number wasn't saved" body={errorMessage(saveError)} /> : null}
        <MpinPanel
          reason={current ? `Change your phone number to ${otp.sent?.sentTo ?? "the new one"}` : `Add ${otp.sent?.sentTo ?? "this phone number"}`}
          run={keep}
          onDone={kept}
          onError={notKept}
          onBusy={setSaving}
          padLift={space.xxxl}
        />
      </StepScreen>
    );

  // The number step: a send failure that isn't about the number shows under the field.
  const sendFailure = otp.problem && otp.problem.kind !== "phone_invalid" ? otp.problem.message : otp.failure ? errorMessage(otp.failure) : null;
  return (
    <StepScreen
      close={goBack}
      step={{ n: 1, of: 3 }}
      keyboard
      footer={<Button label="Send code" armOnMount loading={otp.sending} onPress={() => void sendCode()} />}
    >
      <Stack gap={space.xs}>
        <Txt v="headline" accessibilityRole="header">
          {current ? "Change your phone number" : "Add your phone number"}
        </Txt>
        <Txt v="bodyL" color="textMuted">
          We text a code to it when you trust a new phone or reset your MPIN. Then your MPIN confirms it&apos;s you. Vaultwise only ever shows its last 4 digits.
        </Txt>
      </Stack>
      {current ? (
        <Banner tone="neutral" title={`Verified now: ${current}`} body="A new number replaces it once you've typed the code we send and your MPIN." />
      ) : null}
      <TextField
        label="Phone number"
        value={typed}
        onChangeText={(t) => {
          setTyped(t);
          if (fieldError) setFieldError(null);
        }}
        keyboardType="phone-pad"
        inputMode="tel"
        textContentType="telephoneNumber"
        autoComplete="tel"
        autoFocus
        returnKeyType="send"
        onSubmitEditing={() => void sendCode()}
        hint="With your country code, like +91 98765 43210."
        error={fieldError ?? (otp.problem?.kind === "phone_invalid" ? otp.problem.message : null)}
      />
      {sendFailure ? <Banner tone="warning" title="The code wasn't sent" body={sendFailure} /> : null}
      {practice ? (
        <Txt v="caption" color="textMuted">
          {"Practice doesn't text anyone, so any number works. Only its masked form is kept on this phone."}
        </Txt>
      ) : null}
    </StepScreen>
  );
}

function Done({ number }: { number: string | null }) {
  const { c } = useTheme();
  return (
    <StepScreen footer={<Button label="Done" armOnMount onPress={goBack} />}>
      <View style={styles.done}>
        <CheckCircleIcon size={56} color={c.success} weight="fill" />
        <Txt v="headline" align="center" accessibilityRole="header">
          Phone number verified
        </Txt>
        <Txt v="bodyL" color="textMuted" align="center">
          {number ? `Codes for a new phone or a forgotten MPIN go to ${number}.` : "Codes for a new phone or a forgotten MPIN go to this number."}
        </Txt>
        <Txt v="bodyM" color="textMuted" align="center">
          For your safety, a number added or changed can&apos;t be used to reset your MPIN for 72 hours. Your other devices get an alert.
        </Txt>
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  done: { alignItems: "center", gap: space.sm, paddingTop: space.xxxl },
});
