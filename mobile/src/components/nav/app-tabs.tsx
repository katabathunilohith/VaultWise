import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useDashboard } from "@/lib/api/hooks";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

/**
 * Five native tabs, ordered by the thumb-reach research: Pay sits in the centre — the only bottom
 * slot that's natural for both left and right thumbs, and time-critical at a till. Emergency stays
 * visible (it's the product's safety promise); settings live behind the avatar on each tab root.
 * The bar is the system one (Liquid Glass on iOS 26, Material 3 on Android); never minimises, so
 * Pay and Emergency can't collapse away. Badges only for action-required items.
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
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
        {todo > 0 ? <NativeTabs.Trigger.Badge>{String(todo)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="vaults">
        <NativeTabs.Trigger.Label>Vaults</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "lock.square.stack", selected: "lock.square.stack.fill" }} md="savings" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="pay">
        <NativeTabs.Trigger.Label>Pay</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="qrcode.viewfinder" md="qr_code_scanner" selectedColor={c.accent} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="invest">
        <NativeTabs.Trigger.Label>Invest</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "chart.line.uptrend.xyaxis", selected: "chart.line.uptrend.xyaxis" }} md="trending_up" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="emergency">
        <NativeTabs.Trigger.Label>Emergency</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "lifepreserver", selected: "lifepreserver.fill" }} md="emergency" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
