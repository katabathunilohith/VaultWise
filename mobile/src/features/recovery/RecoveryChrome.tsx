import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { router, useSegments } from "expo-router";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { CaretRightIcon } from "@/components/icons";
import { Press, toneColors, Txt } from "@/components/ui";
import { layout, space, useTheme } from "@/theme";
import { ShieldWarningIcon } from "../kyc/icons";
import { statusAfterClaimPending, takeStatusAfterClaim } from "./intent";
import { useRecoveryWatch } from "./queries";
import { RECOVERY_HREF } from "./routes";

/**
 * Screens that cover the whole window (full-screen modals, the sign-in stack). The bar steps aside
 * for them, so their own header gets the real status-bar inset.
 */
const COVERING = new Set(["withdraw", "add-money", "new-vault", "emergency-request", "checkout", "pay", "assistant", "verify-id", "recovery", "auth", "onboarding"]);

function coversWindow(segments: readonly string[]) {
  const [first, second] = segments;
  if (!first) return false;
  if (COVERING.has(first)) return true;
  if (first === "wallet" && second && second !== "index") return true;
  return first === "settings" && second === "security";
}

/**
 * While a recovery request waits for a person, the account is read-only: a bar across the top of
 * every screen says so and opens the request's status. It sits above the app, which then measures
 * its top inset from below the bar. It also opens the status screen right after the request is sent.
 */
export function RecoveryChrome({ active, children }: { active: boolean; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const segments = useSegments() as readonly string[];
  const show = active && !coversWindow(segments);
  useRecoveryWatch(active);

  useEffect(() => {
    if (!active || !statusAfterClaimPending()) return;
    takeStatusAfterClaim();
    router.push(RECOVERY_HREF.status);
  }, [active]);

  return (
    <View style={styles.fill}>
      {show ? <RecoveryBar top={insets.top} /> : null}
      <SafeAreaInsetsContext.Provider value={show ? { ...insets, top: 0 } : insets}>{children}</SafeAreaInsetsContext.Provider>
    </View>
  );
}

function RecoveryBar({ top }: { top: number }) {
  const { c } = useTheme();
  const tone = toneColors(c, "info");
  return (
    <Press
      onPress={() => router.push(RECOVERY_HREF.status)}
      scaleTo={1}
      accessibilityLabel="Your account is being checked. Money can't move until a person confirms it's you."
      accessibilityHint="Opens account recovery"
      style={[styles.bar, { paddingTop: top + space.xs, backgroundColor: tone.bg, borderBottomColor: c.border }]}
    >
      <ShieldWarningIcon size={20} color={tone.fg} weight="fill" />
      <View style={styles.text}>
        <Txt v="labelM" color={tone.fg} numberOfLines={1}>
          Account being checked
        </Txt>
        <Txt v="caption" numberOfLines={2}>
          {"Money can't move until a person confirms it's you."}
        </Txt>
      </View>
      <CaretRightIcon size={18} color={tone.fg} />
    </Press>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.gutter,
    paddingBottom: space.xs,
    minHeight: layout.hit,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 1 },
});
