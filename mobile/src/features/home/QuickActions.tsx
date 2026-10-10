import { StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { ArrowUpRightIcon, ChatCircleDotsIcon, PlusIcon, QrCodeIcon, type Icon } from "@/components/icons";
import { Press, Txt } from "@/components/ui";
import { radius, space, useTheme } from "@/theme";

const ACTIONS: { label: string; hint: string; icon: Icon; href: Href }[] = [
  { label: "Add money", hint: "Choose a vault to add money to", icon: PlusIcon, href: "/add-money/choose" },
  { label: "Withdraw", hint: "Choose a vault and send proof", icon: ArrowUpRightIcon, href: "/withdraw/choose" },
  { label: "Pay", hint: "Pay a shop from a vault", icon: QrCodeIcon, href: "/pay" },
  { label: "Ask", hint: "Opens the assistant", icon: ChatCircleDotsIcon, href: "/assistant" },
];

/**
 * Four equal 72 pt tiles in the lower-middle band (heatmap §5.1). At accessibility text sizes
 * they become a 2 × 2 grid so labels never truncate. Ordinary navigation: no haptic.
 */
export function QuickActions({ large }: { large: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.row, large && styles.grid]}>
      {ACTIONS.map((a) => (
        <Press
          key={a.label}
          accessibilityLabel={a.label}
          accessibilityHint={a.hint}
          onPress={() => router.push(a.href)}
          style={[styles.tile, large && styles.tileLarge, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <a.icon size={26} color={c.text} />
          <Txt v="caption" numberOfLines={large ? 2 : 1} align="center" maxFontSizeMultiplier={large ? undefined : 1.2}>
            {a.label}
          </Txt>
        </Press>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.xs },
  grid: { flexWrap: "wrap" },
  tile: {
    flex: 1,
    height: 72,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileLarge: { flexBasis: "45%", height: undefined, minHeight: 72, paddingVertical: space.sm },
});
