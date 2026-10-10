import { useEffect, useRef, useState, type ReactNode } from "react";
import { BackHandler, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeftIcon, XIcon } from "@/components/icons";
import { Press, Txt } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { layout, space, useTheme } from "@/theme";

/** Back one screen, or to Home when there's nothing to go back to (deep links, web refresh). */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/**
 * Android hardware Back inside a multi-step screen. Pass a function to handle it (go back a step),
 * "block" to swallow it (work in progress that can't be left), or null to let navigation handle it.
 */
export function useHardwareBack(handler: (() => void) | "block" | null) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const active = handler !== null;
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      const h = ref.current;
      if (typeof h === "function") h();
      return h !== null;
    });
    return () => sub.remove();
  }, [active]);
}

/** 44 pt round header control: Back (arrow) or Close (X). */
export function HeaderButton({ kind = "back", onPress, disabled }: { kind?: "back" | "close"; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  const Icon = kind === "back" ? ArrowLeftIcon : XIcon;
  return (
    <Press
      accessibilityLabel={kind === "back" ? "Back" : "Close"}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={12}
      style={[styles.headerBtn, { backgroundColor: c.surfaceRaised, opacity: disabled ? 0.4 : 1 }]}
    >
      <Icon size={22} color={c.text} weight="bold" />
    </Press>
  );
}

/** Header row (R6): one leading control, a centred title, at most one trailing item. */
export function Header({ title, left, right, center }: { title?: string; left?: ReactNode; right?: ReactNode; center?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <View style={styles.side}>{left}</View>
      <View style={styles.headerTitle}>
        {center ??
          (title ? (
            <Txt v="titleM" align="center" numberOfLines={1} accessibilityRole="header">
              {title}
            </Txt>
          ) : null)}
      </View>
      <View style={[styles.side, styles.sideEnd]}>{right}</View>
    </View>
  );
}

/** Bottom action area (R1): full width, 16 pt above the home indicator, content fades beneath it. */
function Footer({ children, onHeight, floating }: { children: ReactNode; onHeight?: (h: number) => void; floating: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
      style={[floating ? styles.footerFloating : null, { paddingTop: floating ? 28 : space.sm, paddingBottom: insets.bottom + layout.ctaBottomGap }]}
    >
      {floating ? <LinearGradient pointerEvents="none" colors={[`${c.bg}00`, c.bg]} locations={[0, 0.35]} style={StyleSheet.absoluteFill} /> : null}
      <View style={styles.footerInner}>{children}</View>
    </View>
  );
}

/**
 * A step in a flow (onboarding, PIN change, limit edits): header with Back or Close, an optional
 * "Step n of m", content, and the main button in the R1 slot. With `scroll={false}` the content
 * fills the space between header and footer, so keypads sit directly above the main button (R8).
 */
export function StepScreen({
  children,
  footer,
  back,
  close,
  step,
  title,
  scroll = true,
  keyboard = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  back?: () => void;
  close?: () => void;
  step?: { n: number; of: number };
  title?: string;
  scroll?: boolean;
  keyboard?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [footerH, setFooterH] = useState(layout.ctaHeight + insets.bottom + 44);
  const left = back ? <HeaderButton kind="back" onPress={back} /> : close ? <HeaderButton kind="close" onPress={close} /> : null;
  const center = step ? (
    <Txt v="caption" color="textMuted" align="center" accessibilityLabel={`Step ${step.n} of ${step.of}`}>
      {`Step ${step.n} of ${step.of}`}
    </Txt>
  ) : undefined;
  const body = scroll ? (
    <ScrollView
      style={styles.fill}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingTop: space.xs, paddingBottom: (footer ? footerH : insets.bottom) + space.lg }]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, styles.content, { paddingBottom: footer ? 0 : insets.bottom }]}>{children}</View>
  );
  const inner = (
    <View style={[styles.fill, { backgroundColor: c.bg }]}>
      <Header left={left} center={center} title={title} />
      {body}
      {footer ? (
        <Footer floating={scroll} onHeight={setFooterH}>
          {footer}
        </Footer>
      ) : null}
    </View>
  );
  if (!keyboard || Platform.OS === "web") return inner;
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {inner}
    </KeyboardAvoidingView>
  );
}

/**
 * Pushed settings page: a fixed Back + title header, then scrolling content with room to bring the
 * last item into the comfortable middle of the screen. An optional footer takes the R1 slot.
 */
export function Page({
  title,
  children,
  onRefresh,
  footer,
  onBack = goBack,
  keyboard = false,
}: {
  title: string;
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  footer?: ReactNode;
  onBack?: () => void;
  keyboard?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [footerH, setFooterH] = useState(layout.ctaHeight + insets.bottom + 44);
  const inner = (
    <View style={[styles.fill, { backgroundColor: c.bg }]}>
      <Header title={title} left={<HeaderButton kind="back" onPress={onBack} />} />
      <ScrollView
        style={styles.fill}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: space.sm, paddingBottom: (footer ? footerH : insets.bottom) + space.xxxl }]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              tintColor={c.accent}
              colors={[c.accent]}
              progressBackgroundColor={c.surface}
              refreshing={refreshing}
              onRefresh={async () => {
                haptic("pull.threshold");
                setRefreshing(true);
                try {
                  await onRefresh();
                } finally {
                  setRefreshing(false);
                }
              }}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      {footer ? (
        <Footer floating onHeight={setFooterH}>
          {footer}
        </Footer>
      ) : null}
    </View>
  );
  if (!keyboard || Platform.OS === "web") return inner;
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {inner}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: layout.gutter, paddingBottom: 8, gap: 8 },
  headerBtn: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, minHeight: layout.hit, justifyContent: "center" },
  side: { minWidth: layout.hit },
  sideEnd: { alignItems: "flex-end" },
  content: { paddingHorizontal: layout.gutter, gap: space.lg, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  footerFloating: { position: "absolute", left: 0, right: 0, bottom: 0 },
  footerInner: { paddingHorizontal: layout.gutter, gap: 12, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
});
