import { Stack } from "expo-router";
import { useTheme } from "@/theme";

/** Settings screens are pushed; changing or setting the PIN is a full-screen modal (R7: PIN entry). */
export default function Layout() {
  const { c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="security" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
      {/* devices: flows with a code or the MPIN are full-screen modals too */}
      <Stack.Screen name="trust-device" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
      <Stack.Screen name="reset-mpin" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
      <Stack.Screen name="verify-phone" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
    </Stack>
  );
}
