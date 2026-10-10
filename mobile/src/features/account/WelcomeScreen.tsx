import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { LifebuoyIcon, LockKeyIcon, ReceiptIcon, SealCheckIcon, type Icon } from "@/components/icons";
import { Button, Txt } from "@/components/ui";
import { emoji3d } from "@/lib/categories";
import { layout, motion, palettes, radius, space } from "@/theme";

/** The welcome moment is always on the near-black base, whatever the system appearance. */
const D = palettes.dark;

const VALUES: { icon: Icon; text: string }[] = [
  { icon: LockKeyIcon, text: "Vaults locked to what they're for." },
  { icon: ReceiptIcon, text: "Show the bill and they unlock in seconds." },
  { icon: LifebuoyIcon, text: "Emergency money that never waits." },
];

/** Welcome (expressive shell): brand, promise, price, then Get started. */
export function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const [footerH, setFooterH] = useState(160);
  // Light status bar only while Welcome is on top; onboarding (pushed over it) follows the theme.
  const focused = useIsFocused();
  return (
    <View style={[styles.fill, { backgroundColor: D.bg }]}>
      {focused ? <StatusBar style="light" /> : null}
      <ScrollView
        style={styles.fill}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: footerH + space.md }]}
      >
        <Txt v="labelL" color={D.text} accessibilityRole="text">
          Vaultwise
        </Txt>
        <Hero />
        <Animated.View entering={FadeInDown.duration(motion.screen)} style={{ gap: space.lg }}>
          <Txt v="displayL" color={D.text} accessibilityRole="header">
            Savings that keep their promise.
          </Txt>
          <View style={{ gap: space.sm }}>
            {VALUES.map((v) => (
              <ValueLine key={v.text} icon={v.icon} text={v.text} />
            ))}
          </View>
          <View style={[styles.free, { borderColor: D.border, backgroundColor: D.surface }]}>
            <SealCheckIcon size={22} color={D.accent} weight="fill" />
            <Txt v="labelL" color={D.text} style={styles.flex}>
              Free. No fees on vaults.
            </Txt>
          </View>
        </Animated.View>
      </ScrollView>

      <View
        pointerEvents="box-none"
        onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
        style={[styles.footer, { paddingBottom: insets.bottom + layout.ctaBottomGap }]}
      >
        <LinearGradient pointerEvents="none" colors={[`${D.bg}00`, D.bg]} locations={[0, 0.3]} style={StyleSheet.absoluteFill} />
        <View style={styles.footerInner}>
          <View style={styles.notes}>
            <Txt v="caption" color={D.textMuted} align="center">
              Practice mode — no real money.
            </Txt>
            <Txt v="caption" color={D.textMuted} align="center">
              For ages 18 and over.
            </Txt>
          </View>
          <Button label="Get started" variant="accent" armOnMount onPress={() => router.push("/onboarding")} />
        </View>
      </View>
    </View>
  );
}

/** The locked padlock and money bag, with a soft fuchsia glow behind them. */
function Hero() {
  return (
    <Animated.View entering={FadeIn.duration(motion.screen)} style={styles.hero} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={300} height={260} style={StyleSheet.absoluteFill} viewBox="0 0 300 260">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={D.accent} stopOpacity={0.42} />
            <Stop offset="0.55" stopColor={D.accent} stopOpacity={0.12} />
            <Stop offset="1" stopColor={D.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={150} cy={130} r={130} fill="url(#glow)" />
      </Svg>
      <Image source={emoji3d.locked} style={styles.lock} contentFit="contain" accessible={false} />
      <Image source={emoji3d.moneyBag} style={styles.bag} contentFit="contain" accessible={false} />
    </Animated.View>
  );
}

function ValueLine({ icon: IconCmp, text }: { icon: Icon; text: string }) {
  return (
    <View style={styles.value}>
      <View style={[styles.valueIcon, { backgroundColor: D.accentSoft }]}>
        <IconCmp size={20} color={D.accent} weight="bold" />
      </View>
      <Txt v="bodyL" color={D.text} style={styles.flex}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, gap: space.lg, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  hero: { height: 260, width: 300, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  lock: { width: 168, height: 168, position: "absolute", left: 40, top: 34 },
  bag: { width: 116, height: 116, position: "absolute", right: 28, bottom: 26 },
  value: { flexDirection: "row", alignItems: "center", gap: 14 },
  valueIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  free: { flexDirection: "row", alignItems: "center", gap: 12, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 28 },
  footerInner: { paddingHorizontal: layout.gutter, gap: space.sm, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  notes: { gap: 2 },
});
