import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CheckCircleIcon, ClockIcon, ShieldWarningIcon } from "@/components/icons";
import { Button, PinPad, Txt, useHardwareBack } from "@/components/ui";
import { biometricName, useBiometricKind } from "@/features/account/pin-guard";
import { PinLayout } from "@/features/account/PinLayout";
import { goBack, StepScreen } from "@/features/account/layout";
import { OtpCodeScreen, PhoneNeededScreen, readOtpError, useOtp } from "@/features/phone-verify";
import { errorMessage } from "@/lib/api/errors";
import { useMe } from "@/lib/api/hooks";
import { usePracticeMode } from "@/lib/api/practice";
import { haptic } from "@/lib/haptics";
import { space, useTheme } from "@/theme";
import { phoneTrust, readDeviceError, readMpinError, UNRECOGNISED_TEXT, untrustedText } from "./errors";
import { checkNewMpin, MPIN_LENGTH } from "./policy";
import { resetMpin } from "./sync";

type Step = "code" | "new" | "confirm" | "done";

/**
 * devices (plan 06): Forgot your MPIN. A code to the verified phone (purpose `mpin_reset`), then a
 * new MPIN twice, then POST /mpin/reset, which also ends any lock. The unlock PIN and the Face ID /
 * fingerprint copy follow, as for Change MPIN. It needs a verified number and a trusted phone; the
 * screen says so before any code is sent. For 72 hours after the number was added or changed it can't
 * reset the MPIN (403 `phone_recently_changed` with `allowedAt`, from the code or the reset): the
 * screen says when it can.
 */
export function ResetMpinScreen() {
  const me = useMe();
  const onboarded = me.data?.onboarded ? me.data : null;
  const otp = useOtp("mpin_reset");
  const [step, setStep] = useState<Step>("code");
  const token = useRef("");
  const first = useRef("");
  const [newError, setNewError] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shortcutKept, setShortcutKept] = useState(true);
  /** otp: the number is too new to reset the MPIN (the reset said so; the code step's answer counts too, below). */
  const [held, setHeld] = useState<{ allowedAt: number | null; message: string } | null>(null);
  const kind = useBiometricKind();
  const practice = usePracticeMode();

  // Undefined from a server without plan 06: then the server's answer decides.
  const phoneMissing = onboarded?.phone ? !onboarded.phone.verified : false;
  const untrusted = onboarded?.device && !onboarded.device.trusted ? onboarded.device : null;
  const ready = !!me.data && !phoneMissing && !untrusted;

  // Send the code once, as soon as there's somewhere for it to go.
  const sentOnce = useRef(false);
  const { send } = otp;
  useEffect(() => {
    if (!ready || sentOnce.current) return;
    sentOnce.current = true;
    void send();
  }, [ready, send]);

  const toNew = (message: string | null, shake = true) => {
    if (shake) {
      haptic("pin.wrong");
      setNewError((n) => n + 1);
    }
    setHint(message);
    setStep("new");
  };
  const onNew = (pin: string) => {
    const check = checkNewMpin(pin);
    if (!check.ok) return toNew(check.message);
    first.current = pin;
    setHint(null);
    setStep("confirm");
  };
  const onConfirm = async (pin: string) => {
    if (pin !== first.current) return toNew("Those didn't match. Choose your new MPIN again.");
    setSaving(true);
    try {
      const r = await resetMpin(token.current, pin, `Use ${biometricName(kind) ?? "Face ID"} with your new MPIN`);
      setShortcutKept(r.shortcutKept);
      setStep("done");
    } catch (e) {
      const weak = readMpinError(e);
      const device = readDeviceError(e);
      const otpProblem = readOtpError(e);
      if (weak?.kind === "weak") toNew(weak.message);
      else if (device) toNew(`${device.title}, so it can't reset your MPIN. ${device.message}`, false);
      else if (otpProblem?.kind === "recently_changed") setHeld({ allowedAt: otpProblem.allowedAt, message: otpProblem.message });
      else if (otpProblem?.kind === "spent") {
        // The code's token ran out (10 minutes) or was used: a new code, then the MPIN again.
        otp.tokenRefused(e);
        setStep("code");
      } else {
        haptic("error");
        toNew(`Your MPIN wasn't reset. ${errorMessage(e)}`, false);
      }
    } finally {
      setSaving(false);
    }
  };

  const back = step === "confirm" ? () => setStep("new") : step === "new" ? () => setStep("code") : undefined;
  useHardwareBack(saving ? "block" : (back ?? null));

  if (!me.data) return <StepScreen close={goBack}>{null}</StepScreen>;
  if (phoneMissing || otp.problem?.kind === "phone_required")
    return (
      <PhoneNeededScreen
        title="Add your phone number first"
        body="A forgotten MPIN is reset with a code sent to your verified phone number. Add one, then come back here."
        close={goBack}
      />
    );
  if (untrusted) return <UntrustedPhone trustableAt={untrusted.trustableAt} unrecognised={phoneTrust(untrusted) === "unrecognised"} />;
  const hold = held ?? (otp.problem?.kind === "recently_changed" ? { allowedAt: otp.problem.allowedAt, message: otp.problem.message } : null);
  if (hold) return <ResetOnHold message={hold.message} />;
  if (step === "done") return <Done shortcutKept={shortcutKept} />;
  if (step === "code")
    return (
      <OtpCodeScreen
        otp={otp}
        title="Reset your MPIN"
        close={goBack}
        step={{ n: 1, of: 2 }}
        onVerified={(t) => {
          token.current = t;
          setHint(null);
          setStep("new");
        }}
      />
    );
  return (
    <StepScreen back={saving ? undefined : back} step={{ n: 2, of: 2 }} scroll={false}>
      <PinLayout
        bottomInset={false}
        title={step === "new" ? "Choose a new MPIN" : "Type it again"}
        body={
          step === "new"
            ? `6 digits. It approves money moves and unlocks Vaultwise. Avoid your birthday and easy runs like 123456.${practice ? " This is Practice, so don't use a PIN you use anywhere else." : ""}`
            : "So we know it's the one you meant."
        }
        status={saving ? "Saving your new MPIN" : hint}
        pad={
          <PinPad
            key={step}
            length={MPIN_LENGTH}
            error={step === "new" ? newError : 0}
            disabled={saving}
            onComplete={(p) => (step === "new" ? onNew(p) : void onConfirm(p))}
          />
        }
      />
    </StepScreen>
  );
}

/** otp: the verified number was added or changed in the last 72 hours, so it can't reset the MPIN yet. */
function ResetOnHold({ message }: { message: string }) {
  const { c } = useTheme();
  return (
    <StepScreen
      close={goBack}
      footer={
        <>
          <Button label="Talk to a person" variant="tonal" size="md" onPress={() => router.push("/support")} />
          <Button label="Close" armOnMount onPress={goBack} />
        </>
      }
    >
      <View style={styles.center}>
        <ClockIcon size={48} color={c.text} />
        <Txt v="headline" align="center" accessibilityRole="header">
          Resetting your MPIN is paused
        </Txt>
        <Txt v="bodyL" color="textMuted" align="center">
          {message}
        </Txt>
        <Txt v="bodyM" color="textMuted" align="center">
          This stops someone who just put their own number on your account from taking over your MPIN.
        </Txt>
      </View>
    </StepScreen>
  );
}

/** A phone that isn't trusted can't reset the MPIN (and trusting it needs the MPIN). */
function UntrustedPhone({ trustableAt, unrecognised = false }: { trustableAt: number | null; unrecognised?: boolean }) {
  const { c } = useTheme();
  return (
    <StepScreen
      close={goBack}
      footer={
        <>
          <Button label="Talk to a person" armOnMount onPress={() => router.push("/support")} />
          <Button label="Not now" variant="tonal" size="md" onPress={goBack} />
        </>
      }
    >
      <View style={styles.center}>
        <ShieldWarningIcon size={48} color={c.text} />
        <Txt v="headline" align="center" accessibilityRole="header">
          Use your trusted phone
        </Txt>
        <Txt v="bodyL" color="textMuted" align="center">
          {`This phone isn't trusted yet, so it can't reset your MPIN. Reset it on the phone you trust, or ask a person to help. ${unrecognised ? UNRECOGNISED_TEXT : untrustedText(trustableAt)}`}
        </Txt>
      </View>
    </StepScreen>
  );
}

function Done({ shortcutKept }: { shortcutKept: boolean }) {
  const { c } = useTheme();
  const kind = useBiometricKind();
  const bio = biometricName(kind);
  return (
    <StepScreen footer={<Button label="Done" armOnMount onPress={goBack} />}>
      <View style={styles.center}>
        <CheckCircleIcon size={56} color={c.success} weight="fill" />
        <Txt v="headline" align="center" accessibilityRole="header">
          MPIN reset
        </Txt>
        <Txt v="bodyL" color="textMuted" align="center">
          Use your new MPIN to approve money moves and to unlock Vaultwise. Any lock from wrong tries is over.
        </Txt>
        {!shortcutKept && bio ? (
          <Txt v="bodyM" color="textMuted" align="center">
            {`${bio === "fingerprint" ? "Fingerprint" : bio} for payments is off. Turn it on again in Settings, under Security.`}
          </Txt>
        ) : null}
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: space.sm, paddingTop: space.xxl },
});
