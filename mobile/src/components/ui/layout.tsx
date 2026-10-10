import { useState, type ReactNode } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeftIcon, XIcon } from "@/components/icons";
import { haptic } from "@/lib/haptics";
import { layout, radius, space, useTheme } from "@/theme";
import { Press } from "./Press";
import { Txt } from "./Txt";

/**
 * Tab-root and pushed screens: a scroll view on the app background with 96 pt of extra bottom
 * padding (so the last item can be scrolled into the comfortable middle of the screen) and
 * pull-to-refresh with a threshold haptic. Primary actions live inline, never pinned above the
 * tab bar (its height can't be measured with native tabs).
 */
export function Screen({
  children,
  onRefresh,
  contentStyle,
  header,
  scroll = true,
}: {
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  contentStyle?: StyleProp<ViewStyle>;
  header?: ReactNode;
  scroll?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const pad = { paddingTop: Platform.OS === "ios" ? 0 : insets.top + space.xs, paddingBottom: layout.tabRootBottomPad + insets.bottom };
  if (!scroll)
    return (
      <View style={[styles.fill, { backgroundColor: c.bg }]}>
        {header}
        <View style={[styles.content, pad, contentStyle]}>{children}</View>
      </View>
    );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, pad, contentStyle]}
      keyboardShouldPersistTaps="handled"
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
      {header}
      {children}
    </ScrollView>
  );
}

/**
 * Full-screen modal flows (withdraw, emergency, pay, camera, PIN). Close (X) or Back sits
 * top-leading; the main button sits in the bottom slot (R1): full width, 56 pt, 16 pt above the
 * home indicator. A secondary action, if any, goes above it.
 */
export function ModalScreen({
  title,
  onClose,
  back,
  children,
  footer,
  scroll = true,
  headerRight,
  tone = "default",
  hideLeading,
}: {
  title?: string;
  onClose?: () => void;
  /** Show Back instead of Close (steps after the first). */
  back?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  headerRight?: ReactNode;
  tone?: "default" | "paper";
  /** Hide Close/Back on steps that can't be left (e.g. while money is committing). */
  hideLeading?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [footerH, setFooterH] = useState(0);
  const close = onClose ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));
  // Scroll clearance = the measured footer (button, plus any keypad or secondary action) + a gap.
  const footerSpace = footer ? (footerH || layout.ctaHeight + insets.bottom + layout.ctaBottomGap + 28) + space.md : insets.bottom + space.xl;
  const Body = scroll ? ScrollView : View;
  return (
    <View style={[styles.fill, { backgroundColor: tone === "paper" ? c.surface : c.bg }]}>
      <View style={[styles.modalHeader, { paddingTop: insets.top + 6 }]}>
        {hideLeading ? (
          <View style={styles.headerSide} />
        ) : (
          <Press
            accessibilityLabel={back ? "Back" : "Close"}
            onPress={back ?? close}
            hitSlop={12}
            style={[styles.headerBtn, { backgroundColor: c.surfaceRaised }]}
          >
            {back ? <ArrowLeftIcon size={22} color={c.text} weight="bold" /> : <XIcon size={22} color={c.text} weight="bold" />}
          </Press>
        )}
        <View style={styles.headerTitle}>
          {title ? (
            <Txt v="titleM" align="center" numberOfLines={1} accessibilityRole="header">
              {title}
            </Txt>
          ) : null}
        </View>
        <View style={styles.headerSide}>{headerRight}</View>
      </View>
      <Body
        style={styles.fill}
        {...(scroll
          ? { contentContainerStyle: [styles.modalContent, { paddingBottom: footerSpace }], keyboardShouldPersistTaps: "handled" as const }
          : { style: [styles.fill, styles.modalContent, { paddingBottom: footerSpace }] })}
      >
        {children}
      </Body>
      {footer ? <BottomSlot onHeight={setFooterH}>{footer}</BottomSlot> : null}
    </View>
  );
}

/** The bottom action slot: anchored 16 pt above the home indicator, with a fade so content reads beneath. */
export function BottomSlot({ children, onHeight }: { children: ReactNode; onHeight?: (h: number) => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      onLayout={onHeight ? (e) => onHeight(Math.round(e.nativeEvent.layout.height)) : undefined}
      style={[styles.bottomSlot, { paddingBottom: insets.bottom + layout.ctaBottomGap }]}
    >
      <LinearGradient pointerEvents="none" colors={[`${c.bg}00`, c.bg]} style={StyleSheet.absoluteFill} locations={[0, 0.35]} />
      <View style={styles.bottomInner}>{children}</View>
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  raised,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  raised?: boolean;
}) {
  const { c } = useTheme();
  const base = [styles.card, { backgroundColor: raised ? c.surfaceRaised : c.surface, borderColor: c.border }, style];
  if (onPress)
    return (
      <Press onPress={onPress} accessibilityLabel={accessibilityLabel} scaleTo={0.98} style={base}>
        {children}
      </Press>
    );
  return <View style={base}>{children}</View>;
}

export function SectionHeader({ title, action, onAction, actionLabel }: { title: string; action?: string; onAction?: () => void; actionLabel?: string }) {
  return (
    <View style={styles.section}>
      <Txt v="titleL" accessibilityRole="header">
        {title}
      </Txt>
      {action && onAction ? (
        <Press onPress={onAction} hitSlop={10} style={styles.sectionAction} accessibilityLabel={actionLabel ?? `${action}: ${title}`}>
          <Txt v="labelM" color="accent">
            {action}
          </Txt>
        </Press>
      ) : null}
    </View>
  );
}

export function Row({ children, gap = space.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

export function Stack({ children, gap = space.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: layout.gutter, gap: space.lg, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  modalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: layout.gutter, paddingBottom: 8, gap: 8 },
  headerBtn: { width: layout.hit, height: layout.hit, borderRadius: layout.hit / 2, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1 },
  headerSide: { minWidth: layout.hit, alignItems: "flex-end" },
  modalContent: { paddingHorizontal: layout.gutter, gap: space.lg, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  bottomSlot: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 28 },
  bottomInner: { paddingHorizontal: layout.gutter, gap: 12, maxWidth: layout.maxContentWidth, width: "100%", alignSelf: "center" },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.hit, marginTop: space.xs },
  sectionAction: { minHeight: layout.hit, justifyContent: "center", paddingHorizontal: 4 },
});
