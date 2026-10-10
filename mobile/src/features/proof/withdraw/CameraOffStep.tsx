import { useEffect } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { CameraIcon, GearIcon, ImagesIcon } from "@/components/icons";
import { Button, ModalScreen, Txt } from "@/components/ui";
import { openAppSettings } from "@/lib/session";
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

/** Camera unavailable, denied or on web: a plain explanation and the other two ways in. */
export function CameraOffStep({
  nav,
  reason,
  canAskAgain,
  busy,
  onAskAgain,
  onRecheck,
  onChoose,
  onSamples,
}: {
  nav: StepNav;
  reason: CameraOffReason;
  canAskAgain: boolean;
  busy: boolean;
  onAskAgain: () => void;
  /** Called when the app returns to the foreground (the person may have changed Settings). */
  onRecheck: () => void;
  onChoose: () => void;
  onSamples: () => void;
}) {
  const { c } = useTheme();
  const copy = COPY[reason];
  useEffect(() => {
    if (reason !== "denied") return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") onRecheck();
    });
    return () => sub.remove();
  }, [reason, onRecheck]);
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
          <TextLink label="Open settings" icon={GearIcon} onPress={() => void openAppSettings()} hint="Opens Vaultwise in your phone's settings" />
        )
      ) : null}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  tile: { width: 88, height: 88, borderRadius: 28, alignItems: "center", justifyContent: "center", marginTop: space.md },
});
