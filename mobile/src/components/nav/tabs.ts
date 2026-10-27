import type { MaterialIcon, SFSymbolIcon } from "expo-router/unstable-native-tabs";
import { ChartLineUpIcon, HouseIcon, LifebuoyIcon, QrCodeIcon, VaultIcon, type Icon } from "@/components/icons";

export type TabName = "index" | "vaults" | "pay" | "invest" | "emergency";

export interface TabDef {
  name: TabName;
  href: "/" | "/vaults" | "/pay" | "/invest" | "/emergency";
  label: string;
  /** Web bar icon. */
  icon: Icon;
  /** iOS SF Symbol and Android Material icon for the native bar. */
  sf: SFSymbolIcon["sf"];
  md: MaterialIcon["md"];
  /** Tint the selected icon with the accent (the Pay centre tab). */
  accentIcon?: boolean;
}

/**
 * The five tabs, in thumb-reach order: Pay in the centre, Emergency always visible. The native
 * bar, the web bar and tab swiping all read this one list, so the order can't drift.
 */
export const TABS: readonly TabDef[] = [
  { name: "index", href: "/", label: "Home", icon: HouseIcon, sf: { default: "house", selected: "house.fill" }, md: "home" },
  {
    name: "vaults",
    href: "/vaults",
    label: "Vaults",
    icon: VaultIcon,
    sf: { default: "lock.square.stack", selected: "lock.square.stack.fill" },
    md: "savings",
  },
  { name: "pay", href: "/pay", label: "Pay", icon: QrCodeIcon, sf: "qrcode.viewfinder", md: "qr_code_scanner", accentIcon: true },
  {
    name: "invest",
    href: "/invest",
    label: "Invest",
    icon: ChartLineUpIcon,
    sf: { default: "chart.line.uptrend.xyaxis", selected: "chart.line.uptrend.xyaxis" },
    md: "trending_up",
  },
  {
    name: "emergency",
    href: "/emergency",
    label: "Emergency",
    icon: LifebuoyIcon,
    sf: { default: "lifepreserver", selected: "lifepreserver.fill" },
    md: "emergency",
  },
];

/** The tab `step` places from `name` (−1 previous, +1 next), or null past either end. */
export function neighbourTab(name: TabName, step: -1 | 1): TabDef | null {
  const i = TABS.findIndex((t) => t.name === name);
  return TABS[i + step] ?? null;
}
