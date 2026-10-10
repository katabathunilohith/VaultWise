import { useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from "react-native";
import { CameraView } from "expo-camera";
import { useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashlightIcon, ImagesIcon, XIcon } from "@/components/icons";
import { Press, Txt } from "@/components/ui";
import { layout, radius } from "@/theme";

const WHITE = "#FFFFFF";
const SCRIM = "rgba(0,0,0,0.5)";
const CONTROL_BG = "rgba(255,255,255,0.18)";
const INK = "#0D0A0E";

/**
 * Full-bleed document camera. Guide frame centred over 0.14–0.62 of the height, hint at 0.66,
 * and the control row centred on H − bottom inset − 80: Photos (56) · shutter (72) · torch (56),
 * symmetric for either hand. Close sits top-leading.
 */
export function CameraStep({
  onClose,
  onCaptured,
  onPhotos,
  onUnavailable,
}: {
  onClose: () => void;
  onCaptured: (photo: { uri: string; width: number; height: number }) => void;
  onPhotos: () => void;
  onUnavailable: () => void;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const frameTop = H * 0.14;
  const frameH = H * 0.48;
  const frameW = Math.min(W - 48, frameH / 1.3);
  const frameLeft = (W - frameW) / 2;
  const rowCenter = H - insets.bottom - 80;

  const shoot = async () => {
    if (!ready || busy || !cam.current) return;
    setBusy(true);
    setFailed(false);
    try {
      const photo = await cam.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) onCaptured({ uri: photo.uri, width: photo.width, height: photo.height });
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <CameraView
        ref={cam}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
        active={focused}
        enableTorch={torch}
        onCameraReady={() => setReady(true)}
        onMountError={onUnavailable}
      />

      {/* Dim everything outside the guide frame. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.scrim, { top: 0, left: 0, right: 0, height: frameTop }]} />
        <View style={[styles.scrim, { top: frameTop + frameH, left: 0, right: 0, bottom: 0 }]} />
        <View style={[styles.scrim, { top: frameTop, left: 0, width: frameLeft, height: frameH }]} />
        <View style={[styles.scrim, { top: frameTop, right: 0, width: frameLeft, height: frameH }]} />
        <View style={[styles.frame, { top: frameTop, left: frameLeft, width: frameW, height: frameH }]} />
      </View>

      <View pointerEvents="none" style={[styles.hint, { top: H * 0.66 - 12 }]}>
        <Txt v="labelM" color={WHITE} align="center" accessibilityLiveRegion="polite">
          {failed ? "That photo didn't take. Try again." : ready ? "Fit the whole bill inside the frame" : "Starting the camera…"}
        </Txt>
        <Txt v="caption" color={WHITE} align="center" style={{ opacity: 0.8 }}>
          Flat, in good light, with every corner showing
        </Txt>
      </View>

      <Press accessibilityLabel="Close camera" onPress={onClose} hitSlop={12} style={[styles.close, { top: insets.top + 6 }]}>
        <XIcon size={22} color={WHITE} weight="bold" />
      </Press>

      <View style={[styles.row, { top: rowCenter - 36 }]}>
        <SideControl label="Photos" onPress={onPhotos} accessibilityLabel="Choose a photo instead">
          <ImagesIcon size={26} color={WHITE} />
        </SideControl>
        <Press
          accessibilityLabel="Take photo"
          accessibilityState={{ disabled: !ready || busy, busy }}
          disabled={!ready || busy}
          onPress={shoot}
          scaleTo={0.92}
          style={[styles.shutter, { opacity: ready ? 1 : 0.5 }]}
        >
          <View style={styles.shutterInner}>{busy ? <ActivityIndicator color={INK} /> : null}</View>
        </Press>
        <SideControl
          label={torch ? "Torch on" : "Torch"}
          onPress={() => setTorch((t) => !t)}
          accessibilityLabel={torch ? "Turn torch off" : "Turn torch on"}
          selected={torch}
        >
          <FlashlightIcon size={26} color={torch ? INK : WHITE} weight={torch ? "fill" : "regular"} />
        </SideControl>
      </View>
    </View>
  );
}

function SideControl({
  children,
  label,
  onPress,
  accessibilityLabel,
  selected,
}: {
  children: ReactNode;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  selected?: boolean;
}) {
  return (
    <View style={styles.side}>
      <Press
        accessibilityLabel={accessibilityLabel}
        accessibilityState={selected === undefined ? undefined : { selected }}
        onPress={onPress}
        style={[styles.sideBtn, { backgroundColor: selected ? WHITE : CONTROL_BG }]}
      >
        {children}
      </Press>
      <Txt v="micro" color={WHITE} style={styles.sideLabel} importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  scrim: { position: "absolute", backgroundColor: SCRIM },
  frame: { position: "absolute", borderWidth: 2, borderColor: WHITE, borderRadius: radius.md },
  hint: { position: "absolute", left: 24, right: 24, gap: 2 },
  close: {
    position: "absolute",
    left: layout.gutter,
    width: layout.hit,
    height: layout.hit,
    borderRadius: layout.hit / 2,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  row: { position: "absolute", left: 0, right: 0, height: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-evenly" },
  side: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  sideBtn: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  sideLabel: { position: "absolute", top: 68, width: 80, textAlign: "center" },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: WHITE, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: WHITE, alignItems: "center", justifyContent: "center" },
});
