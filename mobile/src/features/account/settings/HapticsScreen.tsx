import { StyleSheet, View } from "react-native";
import { DeviceMobileIcon, InfoIcon, PlayIcon } from "@/components/icons";
import { Txt } from "@/components/ui";
import { backend, previewHaptic, setHapticLevel, TOKENS, useHapticLevel, type HapticLevel, type TokenName } from "@/lib/haptics";
import { layout, space, useTheme } from "@/theme";
import { Group, IconButton, RadioRow } from "../controls";
import { Page } from "../layout";
import { HAPTIC_CATALOG, HAPTIC_GROUPS, HAPTIC_LEVELS } from "./hapticCatalog";

const BACKEND_LINE = {
  pulsar: "Custom patterns on",
  expo: "System haptics (custom patterns need the full app build)",
  web: "Haptics need a phone",
  none: "Haptics need a phone",
} as const;

/** Off / Subtle / Full, plus a preview of every haptic Vaultwise plays. */
export function HapticsScreen() {
  const level = useHapticLevel();
  const engine = backend();
  const onPhone = engine === "pulsar" || engine === "expo";
  const choose = (next: HapticLevel) => {
    if (next === level) return;
    void setHapticLevel(next);
    // Let people feel the new level; switching off stays silent.
    if (next !== "off") previewHaptic("unlock.success");
  };
  return (
    <Page title="Haptics & sounds">
      <Group title="Haptics">
        {HAPTIC_LEVELS.map((l) => (
          <RadioRow key={l.value} label={l.label} description={l.body} selected={level === l.value} onPress={() => choose(l.value)} tick={false} />
        ))}
      </Group>

      <View style={styles.notes}>
        <Note icon="device" text={`On this phone: ${BACKEND_LINE[engine]}.`} />
        <Note icon="info" text="Your phone's own settings still win — Low Power Mode and the camera mute haptics on iPhone." />
        <Note icon="info" text="Sounds: Vaultwise doesn't play any." />
      </View>

      <View style={{ gap: space.md }}>
        <View style={{ gap: 4 }}>
          <Txt v="titleL" accessibilityRole="header">
            Try them
          </Txt>
          <Txt v="bodyM" color="textMuted">
            {onPhone
              ? "Each one has a single meaning. Previews play even when haptics are off."
              : "Each one has a single meaning. Open Vaultwise on a phone to feel them."}
          </Txt>
        </View>
        {HAPTIC_GROUPS.map((group) => (
          <Group key={group} title={group}>
            {(Object.keys(HAPTIC_CATALOG) as TokenName[])
              .filter((t) => HAPTIC_CATALOG[t].group === group)
              .map((t) => (
                <TokenRow key={t} token={t} needsBuild={TOKENS[t].steps.length === 0 && engine !== "pulsar"} noPhone={!onPhone} />
              ))}
          </Group>
        ))}
      </View>
    </Page>
  );
}

function TokenRow({ token, needsBuild, noPhone }: { token: TokenName; needsBuild: boolean; noPhone: boolean }) {
  const item = HAPTIC_CATALOG[token];
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="labelL">{item.label}</Txt>
        <Txt v="bodyM" color="textMuted">
          {needsBuild && !noPhone ? `${item.body} Needs the full app build.` : item.body}
        </Txt>
      </View>
      <IconButton icon={PlayIcon} label={`Play ${item.label}`} onPress={() => previewHaptic(token)} disabled={needsBuild || noPhone} />
    </View>
  );
}

function Note({ icon, text }: { icon: "device" | "info"; text: string }) {
  const { c } = useTheme();
  const Icon = icon === "device" ? DeviceMobileIcon : InfoIcon;
  return (
    <View style={styles.note}>
      <Icon size={20} color={c.textMuted} />
      <Txt v="bodyM" color="textMuted" style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  notes: { gap: space.sm, paddingHorizontal: 4 },
  note: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  row: { minHeight: layout.rowMin, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },
});
