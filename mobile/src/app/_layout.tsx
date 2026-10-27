import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider as NavThemeProvider } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { initConnection } from "@/lib/api/connection";
import { initQueryFocus, queryClient, useConnection, useMe } from "@/lib/api/hooks";
import { initHaptics } from "@/lib/haptics";
import { setMoneyLocale } from "@/lib/money";
import { takePendingCheckout, usePendingCheckout } from "@/lib/pending-checkout";
import { initSession } from "@/lib/session";
import { useSession } from "@/lib/auth/session-state";
import { watchAppLock } from "@/lib/auth/app-lock";
import { ThemeProvider, useTheme } from "@/theme";
import { fontMap } from "@/theme/fonts";
import { startAuth, useServerSignOut, useSignInGate } from "@/features/auth"; // identity
import { isRecoveryAccess, RecoveryChrome } from "@/features/recovery"; // identity

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap);
  useEffect(() => {
    // identity: first, so the connection check knows whether a 401 means "sign in" or "no server".
    const stopAuth = startAuth();
    void initConnection();
    void initHaptics();
    void initSession();
    return stopAuth;
  }, []);
  useEffect(() => initQueryFocus(), []);
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
  // identity: live with sign-in on, nobody signed in means the sign-in screens, whatever /me says.
  const gate = useSignInGate();
  const signedOut = gate.signedOut;
  useServerSignOut(gate, me);

  const ready = conn.checked && session.ready && gate.ready && (signedOut || me.isSuccess || me.isError);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useEffect(() => {
    if (me.data?.onboarded) setMoneyLocale(me.data.rules.locale);
  }, [me.data]);
  // Lock again when the app goes to the background (if app lock is on), but not for the photo
  // picker, camera or permission prompts the app opened itself.
  useEffect(() => watchAppLock(), []);

  const needsOnboarding = !signedOut && (me.data ? !me.data.onboarded : false);
  const locked = !signedOut && !needsOnboarding && session.lockEnabled && !session.unlocked;
  const inApp = ready && !signedOut && !needsOnboarding && !locked;
  // identity: Practice can preview the sign-in and recovery screens from Settings.
  const practice = conn.mode === "demo";
  const authOpen = signedOut || (inApp && practice);
  const claimOpen = (needsOnboarding && gate.required) || (inApp && practice);
  // A request whose automatic checks didn't pass waits with no access, so its status opens before set-up too.
  const statusOpen = inApp || (needsOnboarding && gate.required);
  const readOnly = inApp && isRecoveryAccess(me.data);

  // A merchant link (vaultwise://pay/<id>, kept by +native-intent) opens its checkout once the
  // person is in the app: straight away, or after unlocking or onboarding.
  const pendingCheckout = usePendingCheckout();
  useEffect(() => {
    if (!inApp || !pendingCheckout) return;
    const intentId = takePendingCheckout();
    if (intentId) router.push({ pathname: "/checkout/[intentId]", params: { intentId } });
  }, [inApp, pendingCheckout]);

  if (!ready)
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        {/* identity: after signing in or out the splash is gone, so say it's loading */}
        {gate.required ? <ActivityIndicator color={c.accent} accessibilityLabel="Loading" /> : null}
      </View>
    );

  const nav = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = { ...nav, colors: { ...nav.colors, background: c.bg, card: c.surface, text: c.text, border: c.border, primary: c.accent } };
  const modal = { presentation: "fullScreenModal" as const, headerShown: false, gestureEnabled: false };
  const sheet = { presentation: "formSheet" as const, headerShown: false, sheetGrabberVisible: true, sheetAllowedDetents: [0.55, 1] };

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {/* identity: the read-only bar while a recovery request waits for a person */}
      <RecoveryChrome active={readOnly}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Protected guard={needsOnboarding}>
            {/* identity: signed in with no account yet: set one up, or recover an old one */}
            <Stack.Protected guard={gate.required}>
              <Stack.Screen name="setup" />
            </Stack.Protected>
            <Stack.Protected guard={!gate.required}>
              <Stack.Screen name="welcome" />
            </Stack.Protected>
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
            <Stack.Screen name="rules/[category]" options={sheet} />
            {/* wallet */}
            <Stack.Screen name="wallet/index" options={{ headerShown: false }} />
            <Stack.Screen name="wallet/[action]" options={modal} />
            <Stack.Screen name="upcoming" options={{ headerShown: false }} />
            <Stack.Screen name="activity" options={{ headerShown: false }} />
            <Stack.Screen name="support" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            {/* identity */}
            <Stack.Screen name="verify-id" options={modal} />
          </Stack.Protected>
          {/* identity: signed out, or a preview from Settings in Practice */}
          <Stack.Protected guard={authOpen}>
            <Stack.Screen name="auth" options={signedOut ? { animation: "fade" } : modal} />
          </Stack.Protected>
          <Stack.Protected guard={claimOpen}>
            <Stack.Screen name="recovery/claim" options={modal} />
          </Stack.Protected>
          <Stack.Protected guard={statusOpen}>
            <Stack.Screen name="recovery/status" options={{ headerShown: false }} />
          </Stack.Protected>
          {/* ai-consent: "Can an AI read what you send?", asked before the first bill or ID goes out, from any screen */}
          <Stack.Screen name="ai-consent" options={{ ...sheet, sheetAllowedDetents: [0.8, 1] }} />
        </Stack>
      </RecoveryChrome>
    </NavThemeProvider>
  );
}
