import { useEffect, useState } from "react";
import { AppState, Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { LockKeyIcon } from "@/components/icons";
import { Txt } from "@/components/ui";
import { coverAppSwitcher } from "@/lib/screen-capture";
import { useTheme } from "@/theme";
import { APP_SWITCHER_BLUR, PROTECTION } from "./config";

const ON = PROTECTION.appSwitcherCover && Platform.OS === "ios";

/**
 * iOS: a blurred cover whenever the app isn't active (the app switcher, Control Center, a call),
 * so balances never show there. It asks expo-screen-capture to keep its native blur on all the
 * time, which also covers full-screen modals; in a build without that package it draws its own
 * cover over the app instead. Android blanks the switcher with FLAG_SECURE on the sensitive
 * routes (SensitiveRouteGuard). Mount once, above the navigator.
 */
export function PrivacyCover() {
  const { c, scheme } = useTheme();
  const [native, setNative] = useState<boolean | null>(null);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    if (!ON) return;
    let alive = true;
    void coverAppSwitcher(true, APP_SWITCHER_BLUR).then((ok) => alive && setNative(ok));
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => {
      alive = false;
      sub.remove();
      void coverAppSwitcher(false);
    };
  }, []);
  if (!ON || native !== false || active) return null;
  return (
    <BlurView intensity={90} tint={scheme === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.center} accessible accessibilityLabel="Vaultwise">
        <View style={[styles.mark, { backgroundColor: c.surfaceRaised }]}>
          <LockKeyIcon size={26} color={c.text} />
        </View>
        <Txt v="labelL" color="textMuted">
          Vaultwise
        </Txt>
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  mark: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
