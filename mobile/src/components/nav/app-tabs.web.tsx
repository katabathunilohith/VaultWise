import { StyleSheet, View } from "react-native";
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from "expo-router/ui";
import { ChartLineUpIcon, HouseIcon, LifebuoyIcon, QrCodeIcon, VaultIcon, type Icon } from "@/components/icons";
import { Press } from "@/components/ui/Press";
import { Txt } from "@/components/ui/Txt";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

/**
 * Web preview only: a phone-style bottom tab bar that mirrors the native one (same order, Pay in
 * the centre). Native builds use the system tab bar in app-tabs.tsx.
 */
const TABS: { name: string; href: "/" | "/vaults" | "/pay" | "/invest" | "/emergency"; label: string; icon: Icon }[] = [
  { name: "index", href: "/", label: "Home", icon: HouseIcon },
  { name: "vaults", href: "/vaults", label: "Vaults", icon: VaultIcon },
  { name: "pay", href: "/pay", label: "Pay", icon: QrCodeIcon },
  { name: "invest", href: "/invest", label: "Invest", icon: ChartLineUpIcon },
  { name: "emergency", href: "/emergency", label: "Emergency", icon: LifebuoyIcon },
];

export default function AppTabs() {
  const { c } = useTheme();
  return (
    <Tabs style={{ flex: 1, backgroundColor: c.bg }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <View style={StyleSheet.flatten([styles.bar, { backgroundColor: c.surface, borderTopColor: c.border }])}>
          {TABS.map((t) => (
            <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
              <TabButton icon={t.icon} label={t.label} />
            </TabTrigger>
          ))}
        </View>
      </TabList>
    </Tabs>
  );
}

function TabButton({ isFocused, icon: IconCmp, label, onPress, ...rest }: TabTriggerSlotProps & { icon: Icon; label: string }) {
  const { c } = useTheme();
  return (
    <Press
      {...(rest as object)}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      accessibilityLabel={label}
      onPress={(e) => {
        if (!isFocused) haptic("tab.change");
        onPress?.(e);
      }}
      scaleTo={0.94}
      style={styles.item}
    >
      <View style={[styles.pill, isFocused && { backgroundColor: c.accentSoft }]}>
        <IconCmp size={24} color={isFocused ? c.accent : c.textMuted} weight={isFocused ? "fill" : "regular"} />
      </View>
      <Txt v="micro" color={isFocused ? "text" : "textMuted"}>
        {label}
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, paddingBottom: 10 },
  item: { flex: 1, alignItems: "center", gap: 2, minHeight: 52 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
});
