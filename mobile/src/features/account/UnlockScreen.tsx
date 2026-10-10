import { useCallback, useEffect, useRef } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LockKeyIcon } from "@/components/icons";
import { Txt } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { authenticateBiometric, checkDevicePin, markUnlocked } from "@/lib/session";
import { layout, space, useTheme } from "@/theme";
import { biometricName, GuardedPinPad, PinLayout, PinStatus, useBiometricKind, usePinGuard } from "./pin";

/**
 * App lock (calm core). Face ID / fingerprint is tried once each time the app comes to the
 * foreground; the PIN always works. After five wrong PINs there's a 30-second wait.
 */
export function UnlockScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const kind = useBiometricKind();
  const guard = usePinGuard();
  const tried = useRef(false);
  // Face ID and the PIN can both succeed at once; the unlock haptic plays once.
  const opened = useRef(false);
  const unlock = useCallback(() => {
    if (opened.current) return;
    opened.current = true;
    haptic("unlock.success");
    markUnlocked();
  }, []);

  const tryBiometric = async () => {
    if (!kind) return;
    if (await authenticateBiometric("Unlock Vaultwise")) unlock();
  };

  useEffect(() => {
    if (!kind) return;
    const attempt = () => {
      if (tried.current) return;
      tried.current = true;
      void authenticateBiometric("Unlock Vaultwise").then((ok) => ok && unlock());
    };
    if (AppState.currentState === "active") attempt();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") {
        tried.current = false;
        opened.current = false;
      } else if (s === "active") attempt();
    });
    return () => sub.remove();
  }, [kind, unlock]);

  const bio = biometricName(kind);
  return (
    <View style={[styles.fill, { backgroundColor: c.bg, paddingTop: insets.top + space.xl }]}>
      <View style={styles.content}>
        <View style={styles.brand} accessible accessibilityLabel="Vaultwise">
          <View style={[styles.mark, { backgroundColor: c.surfaceRaised }]}>
            <LockKeyIcon size={26} color={c.text} />
          </View>
          <Txt v="labelL" color="textMuted">
            Vaultwise
          </Txt>
        </View>
        <PinLayout
          title="Unlock Vaultwise"
          body={bio ? `Use ${bio} or enter your PIN.` : "Enter your PIN."}
          status={<PinStatus guard={guard} />}
          pad={
            <GuardedPinPad
              guard={guard}
              verify={checkDevicePin}
              onSuccess={unlock}
              biometric={kind ?? null}
              onBiometric={() => void tryBiometric()}
            />
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: layout.gutter, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  brand: { alignItems: "center", gap: space.xs },
  mark: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
