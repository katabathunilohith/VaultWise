import { Stack } from "expo-router";
import { useTheme } from "@/theme";

/** Settings screens are pushed; changing or setting the PIN is a full-screen modal (R7: PIN entry). */
export default function Layout() {
  const { c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="security" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
    </Stack>
  );
}
