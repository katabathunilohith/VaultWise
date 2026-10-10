import { useEffect } from "react";
import { View } from "react-native";
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider as NavThemeProvider } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initConnection } from "@/lib/api/connection";
import { queryClient, useConnection, useMe } from "@/lib/api/hooks";
import { initHaptics } from "@/lib/haptics";
import { setMoneyLocale } from "@/lib/money";
import { takePendingCheckout, usePendingCheckout } from "@/lib/pending-checkout";
import { initSession, useSession, watchAppLock } from "@/lib/session";
import { ThemeProvider, useTheme } from "@/theme";
import { fontMap } from "@/theme/fonts";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap);
  useEffect(() => {
    void initConnection();
    void initHaptics();
    void initSession();
  }, []);
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <Shell />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell() {
  const { c, scheme } = useTheme();
  const conn = useConnection();
  const session = useSession();
  const me = useMe();

  const ready = conn.checked && session.ready && (me.isSuccess || me.isError);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useEffect(() => {
    if (me.data?.onboarded) setMoneyLocale(me.data.rules.locale);
  }, [me.data]);
  // Lock again when the app goes to the background (if app lock is on), but not for the photo
  // picker, camera or permission prompts the app opened itself.
  useEffect(() => watchAppLock(), []);

  const needsOnboarding = me.data ? !me.data.onboarded : false;
  const locked = !needsOnboarding && session.lockEnabled && !session.unlocked;
  const inApp = ready && !needsOnboarding && !locked;

  // A merchant link (vaultwise://pay/<id>, kept by +native-intent) opens its checkout once the
  // person is in the app: straight away, or after unlocking or onboarding.
  const pendingCheckout = usePendingCheckout();
  useEffect(() => {
    if (!inApp || !pendingCheckout) return;
    const intentId = takePendingCheckout();
    if (intentId) router.push({ pathname: "/checkout/[intentId]", params: { intentId } });
  }, [inApp, pendingCheckout]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const nav = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = { ...nav, colors: { ...nav.colors, background: c.bg, card: c.surface, text: c.text, border: c.border, primary: c.accent } };
  const modal = { presentation: "fullScreenModal" as const, headerShown: false, gestureEnabled: false };
  const sheet = { presentation: "formSheet" as const, headerShown: false, sheetGrabberVisible: true, sheetAllowedDetents: [0.55, 1] };

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={needsOnboarding}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={locked}>
          <Stack.Screen name="unlock" options={{ animation: "fade" }} />
        </Stack.Protected>
        <Stack.Protected guard={inApp}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="withdraw/[vaultId]" options={modal} />
          <Stack.Screen name="add-money/[vaultId]" options={modal} />
          <Stack.Screen name="new-vault" options={modal} />
          <Stack.Screen name="emergency-request" options={modal} />
          <Stack.Screen name="checkout/[intentId]" options={modal} />
          <Stack.Screen name="pay/[intentId]" options={{ animation: "none" }} />
          <Stack.Screen name="assistant" options={modal} />
          <Stack.Screen name="proof/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="track" options={sheet} />
          <Stack.Screen name="upcoming" options={{ headerShown: false }} />
          <Stack.Screen name="activity" options={{ headerShown: false }} />
          <Stack.Screen name="support" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </NavThemeProvider>
  );
}
