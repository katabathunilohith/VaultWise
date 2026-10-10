import { StyleSheet, View } from "react-native";
import { CameraIcon, ImagesIcon } from "@/components/icons";
import { Button, Card, ModalScreen, Txt } from "@/components/ui";
import { space, useTheme } from "@/theme";
import type { StepNav } from "./types";

const POINTS = [
  "We only use the camera to photograph the bill you're sending.",
  "Nothing is recorded, and nothing is saved to your photos.",
  "You can turn it off any time in your phone's settings.",
];

/** Explain before the OS prompt (settled decision), so the one-time ask isn't wasted. */
export function CameraPrimerStep({ nav, busy, onAllow, onChoose }: { nav: StepNav; busy: boolean; onAllow: () => void; onChoose: () => void }) {
  const { c } = useTheme();
  return (
    <ModalScreen
      title="Scan the bill"
      onClose={nav.onClose}
      back={nav.onBack}
      footer={
        <>
          <Button label="Choose a photo instead" variant="tonal" size="md" icon={ImagesIcon} onPress={onChoose} disabled={busy} />
          <Button label="Continue" armOnMount onPress={onAllow} loading={busy} accessibilityHint="Your phone will ask to allow the camera" />
        </>
      }
    >
      <View style={[styles.tile, { backgroundColor: c.surfaceRaised }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <CameraIcon size={40} color={c.text} />
      </View>
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          Use your camera for bills
        </Txt>
        <Txt v="bodyL" color="textMuted">
          Next, your phone will ask to let Vaultwise use the camera.
        </Txt>
      </View>
      <Card>
        {POINTS.map((p) => (
          <View key={p} style={styles.point}>
            <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
            <Txt v="bodyM" style={{ flex: 1 }}>
              {p}
            </Txt>
          </View>
        ))}
      </Card>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  tile: { width: 88, height: 88, borderRadius: 28, alignItems: "center", justifyContent: "center", marginTop: space.md },
  point: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
});
