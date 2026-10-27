import { Stack } from "expo-router";
import { useTheme } from "@/theme";

/** identity: the signed-out screens (sign in, create a login, forgot password, find my account, recover with an ID). */
export default function Layout() {
  const { c } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />;
}
