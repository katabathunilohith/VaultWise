import { Stack } from "expo-router";
import { useTheme } from "@/theme";

/** Onboarding steps. Once the PIN step has created the account there's no going back to it. */
export default function Layout() {
  const { c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="protect" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
