import { StyleSheet, View } from "react-native";
import { DeviceMobileIcon, QrCodeIcon } from "@/components/icons";
import { Button, Card, Row, Skeleton, Txt } from "@/components/ui";
import { radius, space, useTheme } from "@/theme";
import { CameraSlashIcon } from "../icons";
import type { PayScanner } from "./usePayScanner";
import { Viewfinder } from "./Viewfinder";

/** The top of the Pay tab: live viewfinder, the inline camera primer, or a calm fallback. */
export function ScannerArea({ scanner, height, aimY }: { scanner: PayScanner; height: number; aimY?: number }) {
  switch (scanner.status) {
    case "running":
      return (
        <Viewfinder
          height={height}
          aimY={aimY}
          active={scanner.cameraActive}
          torch={scanner.torch}
          notice={scanner.notice}
          onCode={scanner.onCode}
          onMountError={scanner.onMountError}
        />
      );
    case "checking":
      return <Skeleton height={height} r={radius.lg} />;
    case "needs-permission":
    case "blocked":
      return <CameraPrimer height={height} blocked={scanner.status === "blocked"} onAllow={scanner.requestPermission} onSettings={scanner.openSettings} />;
    case "failed":
      return (
        <Fallback
          icon="camera-off"
          title="The camera didn't start"
          body="You can still pick a payment below or type the merchant's code."
          action={{ label: "Try the camera again", onPress: scanner.retryCamera }}
        />
      );
    default:
      return (
        <Fallback
          icon="phone"
          title="Scanning works on your phone"
          body="Open Vaultwise on your phone to scan a merchant's code. Here, pick a payment below or type the merchant's code."
        />
      );
  }
}

/** Ask at the moment of need, and say why first (camera primer). */
function CameraPrimer({ height, blocked, onAllow, onSettings }: { height: number; blocked: boolean; onAllow: () => void; onSettings: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.primer, { minHeight: height, backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={[styles.primerIcon, { backgroundColor: c.surfaceRaised }]}>
        <QrCodeIcon size={36} color={c.text} />
      </View>
      <Txt v="titleL" align="center">
        Scan to pay at the counter
      </Txt>
      <Txt v="bodyM" color="textMuted" align="center">
        {blocked
          ? "Camera access is off for Vaultwise. Turn it on in Settings to scan a merchant's code."
          : "Vaultwise uses the camera only to read the merchant's payment code. Nothing is recorded or saved."}
      </Txt>
      {blocked ? (
        <Button label="Open Settings" variant="tonal" size="md" onPress={onSettings} />
      ) : (
        <Button label="Allow camera" variant="tonal" size="md" onPress={onAllow} />
      )}
      <Txt v="caption" color="textMuted" align="center">
        Or type the merchant&apos;s code below.
      </Txt>
    </View>
  );
}

function Fallback({ icon, title, body, action }: { icon: "phone" | "camera-off"; title: string; body: string; action?: { label: string; onPress: () => void } }) {
  const { c } = useTheme();
  const IconCmp = icon === "phone" ? DeviceMobileIcon : CameraSlashIcon;
  return (
    <Card>
      <Row gap={space.sm}>
        <IconCmp size={26} color={c.text} />
        <Txt v="titleM" style={{ flex: 1 }}>
          {title}
        </Txt>
      </Row>
      <Txt v="bodyM" color="textMuted">
        {body}
      </Txt>
      {action ? <Button label={action.label} variant="tonal" size="md" onPress={action.onPress} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  primer: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  primerIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
});
