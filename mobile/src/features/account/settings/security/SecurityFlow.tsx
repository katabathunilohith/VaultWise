import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { CheckCircleIcon } from "@/components/icons";
import { Button, PinPad, Txt, useHardwareBack } from "@/components/ui";
import { changeMpin, checkNewMpin, LEGACY_PIN_LENGTH, MPIN_LENGTH, readMpinError, turnOnMpinShortcut, useMpinStatus } from "@/features/mpin"; // mpin
import { errorMessage } from "@/lib/api/errors";
import { isPracticeMode, PRACTICE_PIN, usePracticeMode } from "@/lib/api/practice";
import { haptic } from "@/lib/haptics";
import { setBiometricUnlock, setLockEnabled } from "@/lib/auth/app-lock"; // protection: setBiometricUnlock
import { authenticateBiometric } from "@/lib/auth/biometrics";
import { checkDevicePin, setDevicePin } from "@/lib/auth/device-pin";
import { useSession } from "@/lib/auth/session-state";
import { space, useTheme } from "@/theme";
import { goBack, StepScreen } from "../../layout";
import { biometricName, pinWord, resetPinAttempts, useBiometricKind, useDevicePinLength, usePinGuard } from "../../pin-guard";
import { GuardedPinPad, PinLayout, PinStatus } from "../../PinLayout";

/**
 * One PIN: the MPIN approves money moves and unlocks the app.
 *
 * change: the current MPIN (never Face ID alone), a new one twice; the server changes it (POST
 *         /mpin, or the Practice simulator), then this phone's unlock PIN follows.
 * lock:   turn app lock on. With a PIN on this phone, confirm it (Face ID is fine: it only makes
 *         things stricter). Without one, type the MPIN twice to keep a copy for unlocking offline.
 * off:    turn app lock off: the MPIN only, never Face ID alone.
 * bio:    use Face ID / fingerprint for payments: the MPIN, then the phone's biometric check saves it.
 */
export type SecurityIntent = "change" | "lock" | "off" | "bio";
type Phase = "current" | "new" | "confirm" | "done";

const INTENTS: SecurityIntent[] = ["change", "lock", "off", "bio"];

export function SecurityFlow() {
  const params = useLocalSearchParams<{ intent?: string }>();
  const intent: SecurityIntent = INTENTS.includes(params.intent as SecurityIntent) ? (params.intent as SecurityIntent) : "change";
  const session = useSession();
  const deviceLength = useDevicePinLength();
  // Read once: whether this phone had a PIN when the flow opened.
  const [hadPin] = useState(session.hasDevicePin);
  if (deviceLength === undefined) return <StepScreen close={goBack} scroll={false}>{null}</StepScreen>;
  if (intent === "change") return <ChangeMpin deviceLength={deviceLength} />;
  if (intent === "lock" && !hadPin) return <KeepUnlockCopy />;
  return <ConfirmThenAct intent={intent} deviceLength={deviceLength} />;
}

/* ---------- lock (with a PIN), off, bio: confirm the PIN on this phone, then act ---------- */

function ConfirmThenAct({ intent, deviceLength }: { intent: "lock" | "off" | "bio"; deviceLength: number | null }) {
  const session = useSession();
  const kind = useBiometricKind();
  const guard = usePinGuard();
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // App lock can't be on without a PIN, but if it somehow is, turning it off needs no check.
  useEffect(() => {
    if (intent === "off" && !session.hasDevicePin) void setLockEnabled(false).then(goBack);
  }, [intent, session.hasDevicePin]);

  const act = async (pin: string | null) => {
    setFailed(null);
    if (intent === "off") {
      await setLockEnabled(false);
      goBack();
    } else if (intent === "lock") {
      await setLockEnabled(true);
      // protection: confirmed with Face ID / fingerprint, so it may unlock the app again.
      if (pin === null) await setBiometricUnlock(true);
      setDone(true);
    } else if (pin && (await turnOnMpinShortcut(pin, `Use ${biometricName(kind) ?? "Face ID"} for payments`))) setDone(true);
    else {
      haptic("error");
      const bio = biometricName(kind) === "Face ID" ? "Face ID" : "Fingerprint";
      // mpin: the shortcut holds the live MPIN, so Practice never saves it.
      setFailed(isPracticeMode() ? `${bio} for payments is for live use only, not Practice.` : `${bio} wasn't turned on for payments. Try again.`);
    }
  };

  // Face ID / fingerprint only turns app lock ON. It never replaces the MPIN for turning the lock
  // off or for saving the MPIN for payments.
  const bioAllowed = intent === "lock";
  const tryBiometric = async () => {
    if (bioAllowed && kind && (await authenticateBiometric("Turn on app lock"))) void act(null);
  };

  if (done) return <Done intent={intent} />;
  const bio = bioAllowed ? biometricName(kind) : null;
  const word = pinWord(deviceLength);
  return (
    <StepScreen close={goBack} scroll={false}>
      <PinLayout
        bottomInset={false}
        title={intent === "off" ? "Turn off app lock" : intent === "lock" ? "Turn on app lock" : `Use ${biometricName(kind) ?? "Face ID"} for payments`}
        body={
          intent === "bio"
            ? `Enter your ${word}. After that, ${biometricName(kind) ?? "Face ID"} can approve money moves; Vaultwise still checks the MPIN.`
            : bio
              ? `Use ${bio} or your ${word} to confirm it's you.`
              : `Enter your ${word} to confirm it's you.`
        }
        status={failed ?? <PinStatus guard={guard} word={word} />}
        pad={
          <GuardedPinPad
            guard={guard}
            length={deviceLength ?? MPIN_LENGTH}
            verify={checkDevicePin}
            onSuccess={(pin) => void act(pin)}
            biometric={bioAllowed ? (kind ?? null) : null}
            onBiometric={() => void tryBiometric()}
          />
        }
      />
    </StepScreen>
  );
}

/* ---------- lock without a PIN on this phone: keep a copy of the MPIN for unlocking ---------- */

function KeepUnlockCopy() {
  const status = useMpinStatus();
  const practice = usePracticeMode();
  const [phase, setPhase] = useState<"new" | "confirm" | "done">("new");
  const [error, setError] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const first = useRef("");
  // An account that still has a 4-digit PIN on the server unlocks with it until it's changed.
  const length = status?.upgradeDue ? LEGACY_PIN_LENGTH : MPIN_LENGTH;
  const word = pinWord(length);

  const reject = (message: string) => {
    haptic("pin.wrong");
    setHint(message);
    setError((n) => n + 1);
    setPhase("new");
  };
  const onPin = async (pin: string) => {
    if (phase === "new") {
      first.current = pin;
      setHint(null);
      setPhase("confirm");
      return;
    }
    if (pin !== first.current) return reject(`Those didn't match. Enter your ${word} again.`);
    setSaving(true);
    try {
      await setDevicePin(pin);
      await resetPinAttempts();
      await setLockEnabled(true);
      setPhase("done");
    } catch {
      haptic("error");
      reject(`Your ${word} wasn't saved on this phone. Enter it again.`);
    } finally {
      setSaving(false);
    }
  };

  const back = phase === "confirm" ? () => setPhase("new") : undefined;
  useHardwareBack(back ?? null);
  if (phase === "done") return <Done intent="lock" />;
  return (
    <StepScreen close={back ? undefined : goBack} back={back} scroll={false}>
      <PinLayout
        bottomInset={false}
        title={phase === "new" ? `Enter your ${word}` : "Type it again"}
        body={
          phase === "new"
            ? `The ${word} you approve money moves with. It will unlock Vaultwise on this phone too.${practice && status?.practiceDefault !== false ? ` Practice MPIN: ${PRACTICE_PIN}.` : ""}`
            : "So we know it's the one you meant."
        }
        status={hint}
        pad={<PinPad key={phase} length={length} error={phase === "new" ? error : 0} disabled={saving} onComplete={(p) => void onPin(p)} />}
      />
    </StepScreen>
  );
}

/* ---------- change the MPIN ---------- */

function ChangeMpin({ deviceLength }: { deviceLength: number | null }) {
  const status = useMpinStatus();
  const practice = usePracticeMode();
  const kind = useBiometricKind();
  const guard = usePinGuard();
  const [phase, setPhase] = useState<Phase>("current");
  // The server's PIN length: 4 while it still has an older PIN (it may be 6 if chosen on the web).
  const [currentLength, setCurrentLength] = useState(status?.upgradeDue ? LEGACY_PIN_LENGTH : MPIN_LENGTH);
  // After the server said the current MPIN was wrong, it's the only judge (this phone's copy may be older).
  const [serverOnly, setServerOnly] = useState(false);
  const [newError, setNewError] = useState(0);
  const [currentError, setCurrentError] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shortcutKept, setShortcutKept] = useState(true);
  const current = useRef("");
  const first = useRef("");

  const checkLocally = !serverOnly && deviceLength === currentLength;

  const toCurrent = (message: string | null, shake: boolean) => {
    if (shake) {
      haptic("pin.wrong");
      setCurrentError((n) => n + 1);
    }
    setHint(message);
    setPhase("current");
  };
  const toNew = (message: string | null, shake = true) => {
    if (shake) {
      haptic("pin.wrong");
      setNewError((n) => n + 1);
    }
    setHint(message);
    setPhase("new");
  };

  const onCurrent = (pin: string) => {
    current.current = pin;
    setHint(null);
    setPhase("new");
  };
  const onNew = (pin: string) => {
    const check = checkNewMpin(pin);
    if (!check.ok) return toNew(check.message);
    if (pin === current.current) return toNew("That's your current MPIN. Choose a different one.");
    first.current = pin;
    setHint(null);
    setPhase("confirm");
  };
  const onConfirm = async (pin: string) => {
    if (pin !== first.current) return toNew("Those didn't match. Choose your new MPIN again.");
    setSaving(true);
    try {
      const r = await changeMpin(current.current, pin, `Use ${biometricName(kind) ?? "Face ID"} with your new MPIN`);
      setShortcutKept(r.shortcutKept);
      setPhase("done");
    } catch (e) {
      const p = readMpinError(e);
      if (p?.kind === "weak") toNew(p.message);
      else if (p?.kind === "wrong") {
        setServerOnly(true);
        toCurrent(`${p.message} Enter the MPIN you approve money moves with.`, true);
      } else if (p) toCurrent(p.message, p.kind === "locked");
      else {
        haptic("error");
        toNew(`Your MPIN wasn't changed. ${errorMessage(e)}`, false);
      }
    } finally {
      setSaving(false);
    }
  };

  const back = phase === "confirm" ? () => setPhase("new") : phase === "new" ? () => setPhase("current") : undefined;
  useHardwareBack(saving ? "block" : (back ?? null));

  if (phase === "done") return <Done intent="change" shortcutKept={shortcutKept} />;

  const word = pinWord(currentLength);
  return (
    <StepScreen close={back ? undefined : goBack} back={saving ? undefined : back} scroll={false}>
      {phase === "current" ? (
        <PinLayout
          bottomInset={false}
          title={`Enter your current ${word}`}
          body="To confirm it's you. Face ID or fingerprint can't change it."
          status={checkLocally ? <PinStatus guard={guard} word={word} hint={hint} /> : hint}
          pad={
            checkLocally ? (
              <GuardedPinPad guard={guard} length={currentLength} verify={checkDevicePin} onSuccess={onCurrent} />
            ) : (
              <PinPad key={`${currentLength}-${serverOnly}`} length={currentLength} error={currentError} onComplete={onCurrent} />
            )
          }
          below={
            currentLength === MPIN_LENGTH && !status?.upgradeDue ? null : (
              <Button
                label={currentLength === LEGACY_PIN_LENGTH ? "My PIN has 6 digits" : "My PIN has 4 digits"}
                variant="ghost"
                size="sm"
                haptic="select.tick"
                onPress={() => setCurrentLength((n) => (n === LEGACY_PIN_LENGTH ? MPIN_LENGTH : LEGACY_PIN_LENGTH))}
              />
            )
          }
        />
      ) : (
        <PinLayout
          bottomInset={false}
          title={phase === "new" ? "Choose a new MPIN" : "Type it again"}
          body={
            phase === "new"
              ? `6 digits. It approves money moves and unlocks Vaultwise. Avoid your birthday and easy runs like 123456.${practice ? " This is Practice, so don't use a PIN you use anywhere else." : ""}`
              : "So we know it's the one you meant."
          }
          status={saving ? "Saving your new MPIN" : hint}
          pad={
            <PinPad
              key={phase}
              length={MPIN_LENGTH}
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

/* ---------- done ---------- */

function Done({ intent, shortcutKept = true }: { intent: SecurityIntent; shortcutKept?: boolean }) {
  const { c } = useTheme();
  const kind = useBiometricKind();
  const bio = biometricName(kind) ?? "Face ID";
  const [title, body] =
    intent === "lock"
      ? ["App lock is on", "Vaultwise asks for your MPIN each time you open it."]
      : intent === "bio"
        ? [`${bio === "fingerprint" ? "Fingerprint" : bio} approves payments`, `Money moves ask for ${bio} first. Your MPIN always works too.`]
        : ["MPIN changed", "Use your new MPIN to approve money moves and to unlock Vaultwise."];
  return (
    <StepScreen footer={<Button label="Done" armOnMount onPress={goBack} />}>
      <View style={styles.done}>
        <CheckCircleIcon size={56} color={c.success} weight="fill" />
        <Txt v="headline" align="center" accessibilityRole="header">
          {title}
        </Txt>
        <Txt v="bodyL" color="textMuted" align="center">
          {body}
        </Txt>
        {intent === "change" && !shortcutKept ? (
          <Txt v="bodyM" color="textMuted" align="center">
            {`${bio === "fingerprint" ? "Fingerprint" : bio} for payments is off. Turn it on again in Settings, under Security.`}
          </Txt>
        ) : null}
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  done: { alignItems: "center", gap: space.sm, paddingTop: space.xxxl },
});
