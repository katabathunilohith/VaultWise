import { StyleSheet, View } from "react-native";
import { CameraIcon, GearIcon, ImagesIcon } from "@/components/icons";
import { Button, ModalScreen, Txt } from "@/components/ui";
import { space, useTheme } from "@/theme";
import { TextLink } from "../components/Links";
import type { CameraOffReason, StepNav } from "./types";

const COPY: Record<CameraOffReason, { title: string; body: string }> = {
  denied: {
    title: "The camera is off for Vaultwise",
    body: "You can turn it on in Settings, or send a photo of the bill you already have.",
  },
  unavailable: {
    title: "The camera didn't start",
    body: "This device couldn't open the camera. Choose a photo of the bill, or use a sample.",
  },
  web: {
    title: "Scanning works in the app",
    body: "In a browser, choose a photo of the bill or use a sample instead.",
  },
};

/**
 * Camera unavailable, denied or on web: a plain explanation and the other two ways in. While it's
 * denied, the flow re-reads the permission when the app comes back (useCameraAccess).
 */
export function CameraOffStep({
  nav,
  reason,
  canAskAgain,
  busy,
  onAskAgain,
  onSettings,
  onChoose,
  onSamples,
}: {
  nav: StepNav;
  reason: CameraOffReason;
  canAskAgain: boolean;
  busy: boolean;
  onAskAgain: () => void;
  /** Opens Vaultwise in the phone's Settings. */
  onSettings: () => void;
  onChoose: () => void;
  onSamples: () => void;
}) {
  const { c } = useTheme();
  const copy = COPY[reason];
  return (
    <ModalScreen
      title="Scan the bill"
      onClose={nav.onClose}
      back={nav.onBack}
      footer={
        <>
          <Button label="Use a sample" variant="tonal" size="md" onPress={onSamples} disabled={busy} />
          <Button label="Choose a photo" icon={ImagesIcon} armOnMount onPress={onChoose} loading={busy} />
        </>
      }
    >
      <View style={[styles.tile, { backgroundColor: c.surfaceRaised }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <CameraIcon size={40} color={c.textMuted} />
      </View>
      <View style={{ gap: space.xs }}>
        <Txt v="headline" accessibilityRole="header">
          {copy.title}
        </Txt>
        <Txt v="bodyL" color="textMuted">
          {copy.body}
        </Txt>
      </View>
      {reason === "denied" ? (
        canAskAgain ? (
          <TextLink label="Allow the camera" icon={CameraIcon} onPress={onAskAgain} />
        ) : (
          <TextLink label="Open settings" icon={GearIcon} onPress={onSettings} hint="Opens Vaultwise in your phone's settings" />
        )
      ) : null}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  tile: { width: 88, height: 88, borderRadius: 28, alignItems: "center", justifyContent: "center", marginTop: space.md },
});
