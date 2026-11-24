import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { InfoIcon, LockKeyIcon, ShieldWarningIcon, WarningCircleIcon } from "@/components/icons"; // devices: ShieldWarningIcon
import { Button, PinPad, Row, Stack, Txt } from "@/components/ui";
import { biometricName } from "@/features/account/pin-guard";
import { formatWait } from "@/features/account/PinLayout";
import { PRACTICE_PIN, usePracticeMode } from "@/lib/api/practice";
import { space, useTheme } from "@/theme";
import type { MpinRun } from "./ask";
import { useMpinEntry, type MpinEntry } from "./useMpinEntry";

/**
 * The MPIN prompt (calm core): what's being approved, the status line, then the 6-digit pad at the
 * bottom edge (R9), with the Face ID / fingerprint key when the shortcut is on. Used by the sheet
 * (./MpinSheet.tsx) and embedded by flows that live inside a React Native Modal.
 *
 * `padLift` lifts the pad's bottom edge: the default suits a ModalScreen (which leaves the home
 * indicator + 24 pt), so the pad sits about 48 pt above the home indicator.
 */
export function MpinPanel({
  reason,
  run,
  onDone,
  onError,
  onBusy,
  padLift = space.xl,
  onTrustPhone,
  onResetMpin,
}: {
  reason: string;
  run: MpinRun | null;
  onDone: (pin: string, value: unknown) => void;
  onError: (e: unknown) => void;
  /** Told while the MPIN is with the server, so the screen can hide Close meanwhile. */
  onBusy?: (busy: boolean) => void;
  padLift?: number;
  /** devices: opens Trust this phone (the sheet leaves first). Embedded panels leave it out and say where it is. */
  onTrustPhone?: () => void;
  /** devices: opens Forgot your MPIN (the sheet leaves first). Embedded panels leave it out and say where it is. */
  onResetMpin?: () => void;
}) {
  const entry = useMpinEntry({ reason, run, onDone, onError });
  const [help, setHelp] = useState(false);
  const { checking } = entry;
  useEffect(() => onBusy?.(checking), [checking, onBusy]);

  return (
    <View style={styles.fill}>
      <Heading entry={entry} reason={reason} />
      <View style={styles.spacer} />
      <Status entry={entry} onTrustPhone={onTrustPhone} />
      {entry.untrusted ? null : entry.step === "upgrade-current" ? (
        <Row style={styles.links}>
          <Button label="My PIN has 6 digits" variant="ghost" size="sm" haptic="select.tick" disabled={checking} onPress={entry.skipUpgrade} />
        </Row>
      ) : entry.upgrading ? null : (
        <Row style={styles.links}>
          <Button
            label="Forgot your MPIN?"
            variant="ghost"
            size="sm"
            haptic="select.tick"
            // Off while the MPIN is with the server: leaving now would lose the move's answer.
            disabled={checking}
            onPress={() => setHelp((h) => !h)}
            accessibilityHint={help ? "Hides the help" : "Shows what to do"}
          />
        </Row>
      )}
      {help && !entry.upgrading && !entry.untrusted ? <ForgotHelp onReset={onResetMpin} disabled={checking} /> : null}
      <View style={[styles.pad, { marginBottom: padLift }]}>
        <PinPad
          key={entry.padKey}
          length={entry.length}
          error={entry.errorTick}
          disabled={entry.checking || entry.locked || !!entry.untrusted}
          biometric={entry.biometric}
          onBiometric={() => void entry.tryBiometric()}
          onComplete={entry.onPin}
        />
      </View>
    </View>
  );
}

function Heading({ entry, reason }: { entry: MpinEntry; reason: string }) {
  const bio = biometricName(entry.biometric);
  const [title, body] =
    entry.step === "upgrade-current"
      ? ["Choose a 6-digit MPIN", "Vaultwise now uses a 6-digit MPIN for money moves. First, enter your current 4-digit PIN."]
      : entry.step === "upgrade-new"
        ? ["Choose a 6-digit MPIN", "It approves money moves and unlocks Vaultwise. Avoid your birthday and easy runs like 123456."]
        : entry.step === "upgrade-confirm"
          ? ["Type it again", "So we know it's the one you meant."]
          : [reason, bio ? `Enter your MPIN, or use ${bio}.` : "Enter your 6-digit MPIN to approve this."];
  return (
    <Stack gap={space.xs}>
      <Txt v="headline" accessibilityRole="header">
        {title}
      </Txt>
      <Txt v="bodyL" color="textMuted">
        {body}
      </Txt>
      {entry.upgrading ? (
        <Txt v="caption" color="textMuted">
          {`Then: ${reason}`}
        </Txt>
      ) : null}
      {entry.practiceHint && !entry.upgrading ? (
        <Txt v="caption" color="textMuted">
          {`Practice MPIN: ${PRACTICE_PIN}`}
        </Txt>
      ) : null}
    </Stack>
  );
}

/** Checking, a refusal, a lock with when it ends, or a note. Words and an icon, never colour alone. */
function Status({ entry, onTrustPhone }: { entry: MpinEntry; onTrustPhone?: () => void }) {
  const { c } = useTheme();
  let content = null;
  // devices: the MPIN was right, but this phone can't move this much yet.
  if (entry.untrusted)
    content = (
      <View style={styles.lock}>
        <Row gap={space.xs} style={styles.top}>
          <ShieldWarningIcon size={20} color={c.text} />
          <View style={styles.flex}>
            <Txt v="labelM">{entry.untrusted.title}</Txt>
            <Txt v="bodyM" color="textMuted">
              {entry.untrusted.message}
            </Txt>
          </View>
        </Row>
        {entry.untrusted.unrecognised ? null : onTrustPhone ? (
          <Button
            label={entry.untrusted.trustableAt === null ? "Trust with a code" : "Trust this phone"}
            variant="tonal"
            size="md"
            onPress={onTrustPhone}
            style={styles.trust}
          />
        ) : (
          <Txt v="caption" color="textMuted">
            Close this, then trust it in Profile & settings, under Your devices.
          </Txt>
        )}
      </View>
    );
  else if (entry.checking)
    content = (
      <Row gap={space.xs}>
        <ActivityIndicator color={c.textMuted} />
        <Txt v="bodyM" color="textMuted">
          Checking your MPIN
        </Txt>
      </Row>
    );
  else if (entry.locked && entry.message)
    content = (
      <View style={styles.lock} accessible accessibilityLabel={entry.message}>
        <Row gap={space.xs} style={styles.top}>
          <LockKeyIcon size={20} color={c.text} />
          <Txt v="labelM" style={styles.flex}>
            {entry.message}
          </Txt>
        </Row>
        {entry.secondsLeft < 3600 ? (
          <Row gap={6}>
            <Txt v="bodyM" color="textMuted">
              Try again in
            </Txt>
            <Txt v="numM" color={c.text}>
              {formatWait(entry.secondsLeft)}
            </Txt>
          </Row>
        ) : null}
      </View>
    );
  else if (entry.message)
    content = (
      <Row gap={space.xs} style={styles.top}>
        {entry.isError ? <WarningCircleIcon size={20} color={c.danger} weight="fill" /> : <InfoIcon size={20} color={c.textMuted} />}
        <Txt v="labelM" color={entry.isError ? "danger" : "textMuted"} style={styles.flex}>
          {entry.message}
        </Txt>
      </Row>
    );
  return (
    <View style={styles.status} accessibilityLiveRegion="polite">
      {content}
    </View>
  );
}

/** devices: a forgotten MPIN is reset with a code to the verified phone (Settings → Security → Forgot your MPIN). */
function ForgotHelp({ onReset, disabled }: { onReset?: () => void; disabled?: boolean }) {
  const practice = usePracticeMode();
  return (
    <Stack gap={space.xs}>
      <Txt v="bodyM" color="textMuted">
        {practice
          ? `The Practice MPIN is ${PRACTICE_PIN} unless you changed it. You can also reset it with a code, as you would for real.`
          : onReset
            ? "Reset it with a code sent to your verified phone number, then choose a new MPIN."
            : "Close this, then go to Profile & settings, Security, and Forgot your MPIN. A code to your phone resets it."}
      </Txt>
      {onReset ? <Button label="Reset with a code" variant="tonal" size="md" disabled={disabled} onPress={onReset} /> : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flexShrink: 1 },
  top: { alignItems: "flex-start" },
  spacer: { flex: 1, minHeight: space.md },
  status: { minHeight: 44, justifyContent: "center" },
  lock: { gap: space.xxs },
  links: { minHeight: 44, alignItems: "center" },
  pad: { marginTop: space.xs },
  trust: { alignSelf: "flex-start" }, // devices
});
