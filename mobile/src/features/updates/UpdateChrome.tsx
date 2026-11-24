import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSegments } from "expo-router";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { UPDATES_ACTIVE } from "./config";
import { UpdateBanner } from "./UpdateBanner";
import { useUpdatePrompt } from "./useUpdatePrompt";

/**
 * Wraps the app once (src/app/_layout.tsx). The banner shows on the main tabs only, never over a
 * flow, PIN pad, sheet or sign-in screen, so a restart can't cut something off half done. Like the
 * recovery bar, it sits above the app, which then measures its top inset from below the banner.
 */
function ActiveUpdateChrome({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const onTabs = (useSegments() as readonly string[])[0] === "(tabs)";
  const { ready, restarting, failed, restart } = useUpdatePrompt();
  const [dismissed, setDismissed] = useState(false);
  const show = ready && onTabs && !dismissed;
  return (
    <View style={styles.fill}>
      {show ? <UpdateBanner top={insets.top} restarting={restarting} failed={failed} onRestart={restart} onDismiss={() => setDismissed(true)} /> : null}
      <SafeAreaInsetsContext.Provider value={show ? { ...insets, top: 0 } : insets}>{children}</SafeAreaInsetsContext.Provider>
    </View>
  );
}

function Passthrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** In Expo Go, development builds, on the web or with the switch off, this renders the app untouched. */
export const UpdateChrome = UPDATES_ACTIVE ? ActiveUpdateChrome : Passthrough;

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
