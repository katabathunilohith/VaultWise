import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useDashboard } from "@/lib/api/hooks";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";
import { TABS } from "./tabs";

/**
 * Five native tabs, ordered by the thumb-reach research (see tabs.ts): Pay sits in the centre — the
 * only bottom slot that's natural for both left and right thumbs, and time-critical at a till.
 * Emergency stays visible (it's the product's safety promise); settings live behind the avatar on
 * each tab root. The bar is the system one (Liquid Glass on iOS 26, Material 3 on Android); never
 * minimises, so Pay and Emergency can't collapse away. Badges only for action-required items.
 */
export default function AppTabs() {
  const { c } = useTheme();
  const dash = useDashboard();
  const todo = dash.data?.emergency.receiptsDue ?? 0;
  return (
    <NativeTabs
      minimizeBehavior="never"
      backgroundColor={c.surface}
      tintColor={c.accent}
      iconColor={{ default: c.textMuted, selected: c.accent }}
      labelStyle={{ default: { color: c.textMuted }, selected: { color: c.text } }}
      indicatorColor={c.accentSoft}
      badgeBackgroundColor={c.accentFill}
      badgeTextColor={c.onAccentFill}
      screenListeners={{ tabPress: () => haptic("tab.change") }}
    >
      {TABS.map((t) => (
        <NativeTabs.Trigger key={t.name} name={t.name}>
          <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={t.sf} md={t.md} selectedColor={t.accentIcon ? c.accent : undefined} />
          {t.name === "index" && todo > 0 ? <NativeTabs.Trigger.Badge>{String(todo)}</NativeTabs.Trigger.Badge> : null}
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
