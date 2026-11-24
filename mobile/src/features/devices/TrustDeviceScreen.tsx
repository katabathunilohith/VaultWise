import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CheckCircleIcon, ShieldCheckIcon, ShieldWarningIcon } from "@/components/icons";
import { Banner, Button, Txt, useHardwareBack } from "@/components/ui";
import { goBack, StepScreen } from "@/features/account/layout";
import { isDeviceUnknown, MpinPanel, phoneTrust, UNRECOGNISED_TEXT, UNRECOGNISED_TITLE } from "@/features/mpin";
import { OtpCodeScreen, PhoneNeededScreen, readOtpError, useOtp } from "@/features/phone-verify";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { queryClient, useMe } from "@/lib/api/hooks";
import { invalidate } from "@/lib/api/keys";
import { space, useTheme } from "@/theme";

type Step = "code" | "mpin" | "done";

/**
 * Trust this phone (plan 06): a code to the verified number (purpose `device_trust`), then the
 * MPIN, then POST /devices/trust. Until then a new phone can move only small amounts: for 24 hours,
 * or for good when it was first used after a device was signed out of the account. The MPIN step is
 * the MPIN prompt itself, so a wrong MPIN shakes and a lock shows when it ends. A phone the account
 * couldn't add (/me `registered: false`, or `device_unknown`) can't be trusted for now: the screen
 * says why, calmly, and sends no code.
 */
export function TrustDeviceScreen() {
  const me = useMe();
  const onboarded = me.data?.onboarded ? me.data : null;
  const otp = useOtp("device_trust");
  const [step, setStep] = useState<Step>("code");
  const [failure, setFailure] = useState<unknown>(null);
  const token = useRef("");

  // A phone that's trusted already (before this flow got to the end) has nothing to do.
  const alreadyTrusted = onboarded?.device?.trusted === true && step !== "done";
  const phoneMissing = onboarded?.phone ? !onboarded.phone.verified : false;
  const unrecognised = phoneTrust(onboarded?.device) === "unrecognised" || isDeviceUnknown(otp.failure) || isDeviceUnknown(failure);
  const ready = !!me.data && !alreadyTrusted && !phoneMissing && !unrecognised;

  // Send the code once there's somewhere for it to go (also after adding a number and coming back).
  const sentOnce = useRef(false);
  const { send } = otp;
  useEffect(() => {
    if (!ready || sentOnce.current) return;
    sentOnce.current = true;
    void send();
  }, [ready, send]);

  const trust = useCallback((pin: string | undefined) => api.trustDevice(token.current, pin), []);
  const trusted = useCallback(() => {
    void invalidate(queryClient, "me", "devices", "alerts");
    setStep("done");
  }, []);
  const refused = useCallback(
    (e: unknown) => {
      // The code's token ran out (10 minutes) or was used: a new code, then the MPIN again.
      if (readOtpError(e)?.kind === "spent") {
        otp.tokenRefused(e);
        setStep("code");
        return;
      }
      setFailure(e);
    },
    [otp],
  );

  useHardwareBack(step === "mpin" ? () => setStep("code") : null);

  if (!me.data) return <StepScreen close={goBack}>{null}</StepScreen>;
  if (alreadyTrusted) return <Done already />;
  if (unrecognised) return <CannotTrust />;
  if (phoneMissing || otp.problem?.kind === "phone_required")
    return (
      <PhoneNeededScreen
        title="Add your phone number first"
        body="A new phone is trusted with a code sent to your verified phone number, then your MPIN. Add a number, then come back here."
        close={goBack}
      />
    );
  if (step === "done") return <Done />;
  if (step === "code")
    return (
      <OtpCodeScreen
        otp={otp}
        title="Trust this phone"
        close={goBack}
        step={{ n: 1, of: 2 }}
        onVerified={(t) => {
          token.current = t;
          setFailure(null);
          setStep("mpin");
        }}
      />
    );
  return (
    <StepScreen back={() => setStep("code")} step={{ n: 2, of: 2 }} scroll={false}>
      {failure ? <Banner tone="warning" title="This phone wasn't trusted" body={errorMessage(failure)} /> : null}
      <MpinPanel reason="Trust this phone" run={trust} onDone={trusted} onError={refused} padLift={space.xxxl} />
    </StepScreen>
  );
}

/** The account couldn't add this phone (too many new devices), so there's nothing to trust yet. No code is sent. */
function CannotTrust() {
  const { c } = useTheme();
  return (
    <StepScreen close={goBack} footer={<Button label="Close" armOnMount onPress={goBack} />}>
      <View style={styles.center}>
        <ShieldWarningIcon size={48} color={c.text} />
        <Txt v="headline" align="center" accessibilityRole="header">
          {UNRECOGNISED_TITLE}
        </Txt>
        <Txt v="bodyL" color="textMuted" align="center">
          {UNRECOGNISED_TEXT}
        </Txt>
      </View>
    </StepScreen>
  );
}

function Done({ already = false }: { already?: boolean }) {
  const { c } = useTheme();
  const Icon = already ? ShieldCheckIcon : CheckCircleIcon;
  return (
    <StepScreen footer={<Button label="Done" armOnMount onPress={goBack} />}>
      <View style={styles.center}>
        <Icon size={56} color={c.success} weight="fill" />
        <Txt v="headline" align="center" accessibilityRole="header">
          {already ? "This phone is trusted" : "This phone is trusted now"}
        </Txt>
        <Txt v="bodyL" color="textMuted" align="center">
          {already
            ? "It can move any amount. Nothing to do here."
            : "Large amounts can move from it now. Your other devices get an alert that it was trusted."}
        </Txt>
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: space.sm, paddingTop: space.xxl },
});
