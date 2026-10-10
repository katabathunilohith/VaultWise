import { StyleSheet, View } from "react-native";
import { CameraView } from "expo-camera";
import { Txt } from "@/components/ui";
import { radius, space } from "@/theme";

const CAMERA_BG = "#000000";
const ON_CAMERA = "#FFFFFF";
const HINT_BG = "rgba(0,0,0,0.55)";

/**
 * Live QR viewfinder. Aiming moves the phone, not the thumb, so this can sit in the top of the
 * screen, with the aiming frame at about 30% of its height. Codes are handled by usePayScanner,
 * which ignores repeats while one is being opened.
 */
export function Viewfinder({
  height,
  aimY,
  active,
  torch,
  notice,
  onCode,
  onMountError,
}: {
  height: number;
  /** Where the aiming frame's centre sits, from the top of the viewfinder (≈30% of the screen). */
  aimY?: number;
  active: boolean;
  torch: boolean;
  notice: string | null;
  onCode: (data: string) => void;
  onMountError: (message: string) => void;
}) {
  const frame = Math.round(Math.min(250, height * 0.62));
  // Keep the frame clear of the top edge and of the hint at the bottom.
  const frameTop = aimY === undefined ? (height - frame) / 2 : Math.max(space.md, Math.min(aimY - frame / 2, height - frame - 64));
  return (
    <View style={[styles.wrap, { height }]}>
      <View style={styles.fill} accessible accessibilityRole="image" accessibilityLabel="Camera viewfinder. Point your phone at the merchant's Vaultwise code to pay.">
        {active ? (
          <CameraView
            style={styles.fill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={(result) => onCode(result.data)}
            onMountError={(e) => onMountError(e.message)}
          />
        ) : null}
      </View>
      <View pointerEvents="none" style={styles.fill} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={[styles.aim, { top: frameTop }]}>
          <AimFrame size={frame} />
        </View>
      </View>
      <View pointerEvents="none" style={styles.hintWrap}>
        <View style={styles.hint}>
          <Txt v="labelM" color={ON_CAMERA} align="center" accessibilityLiveRegion="polite" accessibilityRole={notice ? "alert" : undefined}>
            {notice ?? "Point at the merchant's Vaultwise code"}
          </Txt>
        </View>
      </View>
    </View>
  );
}

function AimFrame({ size }: { size: number }) {
  const arm = Math.round(size * 0.18);
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.corner, { width: arm, height: arm, top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radius.md }]} />
      <View style={[styles.corner, { width: arm, height: arm, top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radius.md }]} />
      <View style={[styles.corner, { width: arm, height: arm, bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radius.md }]} />
      <View style={[styles.corner, { width: arm, height: arm, bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radius.md }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: CAMERA_BG },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  aim: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  corner: { position: "absolute", borderColor: ON_CAMERA },
  hintWrap: { position: "absolute", left: 0, right: 0, bottom: space.md, alignItems: "center", paddingHorizontal: space.md },
  hint: { backgroundColor: HINT_BG, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
});
