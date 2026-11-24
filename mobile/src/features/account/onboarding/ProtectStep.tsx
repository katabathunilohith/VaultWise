import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { FingerprintIcon, LockKeyIcon, ScanSmileyIcon } from "@/components/icons";
import { Banner, Button, Stack, Txt, useHardwareBack } from "@/components/ui";
import { byName } from "@/lib/api/keys";
import type { Me } from "@/lib/api/types";
import { setBiometricUnlock, setLockEnabled } from "@/lib/auth/app-lock";
import { authenticateBiometric } from "@/lib/auth/biometrics";
import { haptic } from "@/lib/haptics";
import { radius, space, useTheme } from "@/theme";
import { IDLE_LOCK_MS, PROTECTION } from "@/features/protection"; // protection
import { StepScreen } from "../layout";
import { biometricName, useBiometricKind } from "../pin-guard";
import { clearDraft } from "./draft";

const isMe = byName("me");

/**
 * Onboarding step 3: offer app lock (Face ID / fingerprint with the PIN as fallback), then enter the app.
 * protection: Face ID / fingerprint only unlocks the app if the check here passes. If it doesn't, the
 * person can try again or lock with the MPIN only (the biometric on this phone may not be theirs).
 */
export function ProtectStep() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const kind = useBiometricKind();
  const bio = biometricName(kind);
  const [busy, setBusy] = useState<"on" | "off" | "pin" | null>(null);
  const [failed, setFailed] = useState(false);
  // protection: the Face ID / fingerprint check didn't pass.
  const [bioFailed, setBioFailed] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The account already exists, so Android Back stays here; both choices are on screen.
  useHardwareBack("block");

  const finish = async (lock: boolean, withBiometric = true) => {
    setBusy(!lock ? "off" : withBiometric ? "on" : "pin");
    setFailed(false);
    // Ask for Face ID now, so its permission prompt doesn't first appear at an unlock.
    // protection: and only let it unlock the app if the check passes.
    const bioOk = lock && withBiometric && kind ? await authenticateBiometric("Turn on app lock for Vaultwise") : false;
    if (lock && withBiometric && kind && !bioOk && PROTECTION.biometricRules) {
      if (!mounted.current) return;
      haptic("warning");
      setBioFailed(true);
      setBusy(null);
      return;
    }
    await setLockEnabled(lock);
    if (lock && kind) await setBiometricUnlock(bioOk); // protection
    clearDraft();
    // The root gate opens the app once it sees the new wallet.
    await qc.invalidateQueries({ predicate: isMe });
    const ready = qc.getQueriesData<Me>({ predicate: isMe }).some(([, d]) => d?.onboarded);
    if (!mounted.current) return;
    if (!ready) {
      setBusy(null);
      setFailed(true);
      return;
    }
    requestAnimationFrame(() => {
      if (mounted.current) router.replace("/");
    });
  };

  const Icon = kind === "face" ? ScanSmileyIcon : kind === "finger" ? FingerprintIcon : LockKeyIcon;
  const title =
    kind === "face" ? "Lock Vaultwise with Face ID?" : kind === "finger" ? "Lock Vaultwise with your fingerprint?" : "Lock Vaultwise with your MPIN?";

  return (
    <StepScreen
      step={{ n: 3, of: 3 }}
      footer={
        <>
          {bioFailed ? (
            // protection: lock with the MPIN alone, or try the biometric again.
            <Button
              label="Use my MPIN only"
              variant="tonal"
              size="md"
              disabled={!!busy}
              loading={busy === "pin"}
              onPress={() => void finish(true, false)}
            />
          ) : (
            <Button
              label="Not now"
              variant="tonal"
              size="md"
              disabled={!!busy || kind === undefined}
              loading={busy === "off"}
              onPress={() => void finish(false)}
            />
          )}
          <Button
            label={bioFailed && bio ? `Try ${bio} again` : "Turn on app lock"}
            armOnMount
            disabled={!!busy || kind === undefined}
            loading={busy === "on"}
            onPress={() => void finish(true)}
          />
        </>
      }
    >
      <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
        <Icon size={40} color={c.text} />
      </View>
      <Stack gap={space.xs}>
        <Txt v="headline" accessibilityRole="header">
          {kind === undefined ? "Protect your account" : title}
        </Txt>
        <Txt v="bodyL" color="textMuted">
          {bio
            ? `When you open Vaultwise, it asks for ${bio} first. Your MPIN always works too.`
            : "When you open Vaultwise, it asks for your MPIN, so nobody else who picks up your phone can open it."}
        </Txt>
      </Stack>
      <Stack gap={space.sm}>
        <Point
          text={PROTECTION.idleLock ? `It locks again when you leave the app, or after ${IDLE_LOCK_MS / 60_000} minutes without a tap.` : "It locks again each time you leave the app."} // protection
        />
        <Point text="You can change this any time in Settings." />
        {!bio ? <Point text="Face ID and fingerprint work when your phone has them set up." /> : null}
      </Stack>
      {bioFailed ? (
        <Banner
          tone="warning"
          title={kind === "face" ? "Face ID didn't confirm it's you" : "Your fingerprint didn't match"}
          body={`Try again, or lock with your MPIN only. Then ${bio ?? "it"} won't unlock Vaultwise.`}
        />
      ) : null}
      {failed ? (
        <Banner tone="warning" title="Your account is ready, but didn't open" body="Check your connection, then tap your choice again." />
      ) : null}
    </StepScreen>
  );
}

function Point({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.point}>
      <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
      <Txt v="bodyM" style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 72, height: 72, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", marginTop: space.md },
  point: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
});
