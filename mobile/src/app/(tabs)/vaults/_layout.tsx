import { Stack } from "expo-router";
import { useTheme } from "@/theme";

/** A deep link straight to a vault still has the list beneath it. */
export const unstable_settings = { initialRouteName: "index" };

export default function Layout() {
  const { c } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />;
}
