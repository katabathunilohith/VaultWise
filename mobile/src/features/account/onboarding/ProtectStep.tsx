import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { FingerprintIcon, LockKeyIcon, ScanSmileyIcon } from "@/components/icons";
import { Banner, Button, Stack, Txt } from "@/components/ui";
import type { Me } from "@/lib/api/types";
import { authenticateBiometric, setLockEnabled } from "@/lib/session";
import { radius, space, useTheme } from "@/theme";
import { StepScreen, useHardwareBack } from "../layout";
import { biometricName, useBiometricKind } from "../pin";
import { clearDraft } from "./draft";

const isMe = (q: { queryKey: readonly unknown[] }) => q.queryKey[1] === "me";

/** Onboarding step 3: offer app lock (Face ID / fingerprint with the PIN as fallback), then enter the app. */
export function ProtectStep() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const kind = useBiometricKind();
  const bio = biometricName(kind);
  const [busy, setBusy] = useState<"on" | "off" | null>(null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The account already exists, so Android Back stays here; both choices are on screen.
  useHardwareBack("block");

  const finish = async (lock: boolean) => {
    setBusy(lock ? "on" : "off");
    setFailed(false);
    // Ask for Face ID now, so its permission prompt doesn't first appear at an unlock.
    if (lock && kind) await authenticateBiometric("Turn on app lock for Vaultwise");
    await setLockEnabled(lock);
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
    kind === "face" ? "Lock Vaultwise with Face ID?" : kind === "finger" ? "Lock Vaultwise with your fingerprint?" : "Lock Vaultwise with your PIN?";

  return (
    <StepScreen
      step={{ n: 3, of: 3 }}
      footer={
        <>
          <Button
            label="Not now"
            variant="tonal"
            size="md"
            disabled={!!busy || kind === undefined}
            loading={busy === "off"}
            onPress={() => void finish(false)}
          />
          <Button
            label="Turn on app lock"
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
            ? `When you open Vaultwise, it asks for ${bio} first. Your PIN always works too.`
            : "When you open Vaultwise, it asks for your PIN, so nobody else who picks up your phone can open it."}
        </Txt>
      </Stack>
      <Stack gap={space.sm}>
        <Point text="It locks again each time you leave the app." />
        <Point text="You can change this any time in Settings." />
        {!bio ? <Point text="Face ID and fingerprint work when your phone has them set up." /> : null}
      </Stack>
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
