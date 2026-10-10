import { useEffect } from "react";
import { router } from "expo-router";
import { DeviceMobileIcon, MoonIcon, SunIcon, type Icon } from "@/components/icons";
import { appearanceSettingAvailable, useTheme, type AppearancePref } from "@/theme";
import { Group, RadioRow } from "../controls";
import { Page } from "../layout";

const OPTIONS: { value: AppearancePref; label: string; body: string; icon: Icon }[] = [
  { value: "system", label: "System", body: "Follows your phone's light or dark setting.", icon: DeviceMobileIcon },
  { value: "light", label: "Light", body: "Always light.", icon: SunIcon },
  { value: "dark", label: "Dark", body: "Always dark.", icon: MoonIcon },
];

export const appearanceLabel = (p: AppearancePref) => OPTIONS.find((o) => o.value === p)?.label ?? "System";

/**
 * Light / Dark / System. Android and web only: on iPhone Vaultwise follows the system, as Apple
 * asks. (The colour-blind gains and losses switch is on the main settings list, on every platform.)
 */
export function AppearanceScreen() {
  const { pref, setPref } = useTheme();
  useEffect(() => {
    if (!appearanceSettingAvailable) router.replace("/settings");
  }, []);
  return (
    <Page title="Appearance">
      <Group title="Theme" note="Your choice is saved on this device.">
        {OPTIONS.map((o) => (
          <RadioRow key={o.value} label={o.label} description={o.body} icon={o.icon} selected={pref === o.value} onPress={() => setPref(o.value)} />
        ))}
      </Group>
    </Page>
  );
}
