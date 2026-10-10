import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { CheckCircleIcon } from "@/components/icons";
import { Button, PinPad, Txt } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { authenticateBiometric, checkDevicePin, setDevicePin, setLockEnabled, useSession } from "@/lib/session";
import { space, useTheme } from "@/theme";
import { goBack, StepScreen, useHardwareBack } from "../../layout";
import { biometricName, GuardedPinPad, isWeakPin, PinLayout, PinStatus, resetPinAttempts, useBiometricKind, usePinGuard } from "../../pin";

/**
 * change: confirm the current PIN (or Face ID), choose a new one, type it again.
 * lock:   no PIN yet; choose one, then app lock turns on.
 * off:    confirm it's you, then app lock turns off.
 */
export type SecurityIntent = "change" | "lock" | "off";
type Phase = "current" | "new" | "confirm" | "done";

export function SecurityFlow() {
  const params = useLocalSearchParams<{ intent?: string }>();
  const intent: SecurityIntent = params.intent === "lock" || params.intent === "off" ? params.intent : "change";
  const session = useSession();
  const kind = useBiometricKind();
  const guard = usePinGuard();
  // Anything that touches an existing PIN starts by confirming it.
  const [phase, setPhase] = useState<Phase>(session.hasDevicePin ? "current" : "new");
  const [newError, setNewError] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const first = useRef("");
  // Whether a PIN existed when the flow opened ("PIN changed" vs "PIN set" at the end).
  const [hadPin] = useState(session.hasDevicePin);

  // App lock can't be on without a PIN, but if it somehow is, turning it off needs no check.
  useEffect(() => {
    if (intent === "off" && !session.hasDevicePin) void setLockEnabled(false).then(goBack);
  }, [intent, session.hasDevicePin]);

  const verified = async () => {
    if (intent === "off") {
      await setLockEnabled(false);
      goBack();
    } else if (intent === "lock") {
      await setLockEnabled(true);
      setPhase("done");
    } else setPhase("new");
  };

  const tryBiometric = async () => {
    if (kind && (await authenticateBiometric(intent === "off" ? "Turn off app lock" : intent === "lock" ? "Turn on app lock" : "Change your PIN")))
      void verified();
  };

  const reject = (message: string) => {
    haptic("pin.wrong");
    setHint(message);
    setNewError((n) => n + 1);
    setPhase("new");
  };

  const onNew = (pin: string) => {
    if (isWeakPin(pin)) return reject("That PIN is easy to guess. Try a less obvious one.");
    first.current = pin;
    setHint(null);
    setSaveFailed(false);
    setPhase("confirm");
  };

  const onConfirm = async (pin: string) => {
    if (pin !== first.current) return reject("Those PINs didn't match. Choose a new PIN again.");
    setSaving(true);
    setSaveFailed(false);
    try {
      await setDevicePin(pin);
      await resetPinAttempts();
      if (intent === "lock") await setLockEnabled(true);
      setPhase("done");
    } catch {
      haptic("error");
      setSaveFailed(true);
      setHint(null);
      setPhase("new");
    } finally {
      setSaving(false);
    }
  };

  const back = phase === "confirm" ? () => setPhase("new") : undefined;
  useHardwareBack(back ?? null);

  if (phase === "done") return <Done intent={intent} hadPin={hadPin} />;

  const bio = biometricName(kind);
  return (
    <StepScreen close={back ? undefined : goBack} back={back} scroll={false}>
      {phase === "current" ? (
        <PinLayout
          bottomInset={false}
          title={intent === "off" ? "Turn off app lock" : intent === "lock" ? "Turn on app lock" : "Enter your current PIN"}
          body={bio ? `Use ${bio} or your PIN to confirm it's you.` : "To confirm it's you."}
          status={<PinStatus guard={guard} />}
          pad={
            <GuardedPinPad
              guard={guard}
              verify={checkDevicePin}
              onSuccess={() => void verified()}
              biometric={kind ?? null}
              onBiometric={() => void tryBiometric()}
            />
          }
        />
      ) : (
        <PinLayout
          bottomInset={false}
          title={phase === "new" ? (session.hasDevicePin && intent === "change" ? "Choose a new PIN" : "Choose a PIN") : "Type it again"}
          body={phase === "new" ? "4 digits. It unlocks Vaultwise on this phone." : "So we know it's the one you meant."}
          status={saveFailed && phase === "new" ? "Your PIN wasn't saved on this phone. Choose it again." : hint}
          pad={
            <PinPad
              key={phase}
              error={phase === "new" ? newError : 0}
              disabled={saving}
              onComplete={(p) => (phase === "new" ? onNew(p) : void onConfirm(p))}
            />
          }
        />
      )}
    </StepScreen>
  );
}

function Done({ intent, hadPin }: { intent: SecurityIntent; hadPin: boolean }) {
  const { c } = useTheme();
  return (
    <StepScreen footer={<Button label="Done" armOnMount onPress={goBack} />}>
      <View style={styles.done}>
        <CheckCircleIcon size={56} color={c.success} weight="fill" />
        <Txt v="headline" align="center" accessibilityRole="header">
          {intent === "lock" ? "App lock is on" : hadPin ? "PIN changed" : "PIN set"}
        </Txt>
        <Txt v="bodyL" color="textMuted" align="center">
          {intent === "lock"
            ? "Vaultwise asks for your PIN each time you open it."
            : hadPin
              ? "Use your new PIN next time you unlock Vaultwise."
              : "Turn on app lock to ask for it each time you open Vaultwise."}
        </Txt>
        <Txt v="bodyM" color="textMuted" align="center">
          This PIN is for this phone. The PIN that approves payments and emergency payouts doesn’t change here.
        </Txt>
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  done: { alignItems: "center", gap: space.sm, paddingTop: space.xxxl },
});
