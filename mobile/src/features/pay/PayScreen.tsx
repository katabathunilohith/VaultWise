import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashlightIcon } from "@/components/icons";
import { Card, PracticeBadge, Row, Screen, SectionHeader, ToggleRow, Txt } from "@/components/ui";
import { useDemoIntents } from "@/lib/api/hooks";
import { layout, space } from "@/theme";
import { MerchantCodeEntry } from "./MerchantCodeEntry";
import { PendingCheckouts } from "./PendingCheckouts";
import { ProfileButton } from "./ProfileButton";
import { ScannerArea } from "./scanner/ScannerArea";
import { usePayScanner } from "./scanner/usePayScanner";

const HEADER_HEIGHT = layout.hit + space.xs;
/** The viewfinder ends at ~62% of the screen; the panel (pending, code, torch) starts there. */
const VIEWFINDER_END = 0.62;
const VIEWFINDER_MIN = 240;
/** The aiming frame sits at ~30% of the screen height. */
const AIM_AT = 0.3;

/**
 * Pay tab root, scanner-first. Aiming happens up top (it moves the phone, not the thumb); the
 * things you tap — pending checkouts, the merchant code and the torch — sit in the lower panel.
 */
export function PayScreen() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scanner = usePayScanner();
  const intents = useDemoIntents();
  const viewfinderTop = insets.top + HEADER_HEIGHT + space.lg;
  const viewfinderHeight = Math.max(VIEWFINDER_MIN, Math.round(height * VIEWFINDER_END - viewfinderTop));
  const aimY = Math.round(height * AIM_AT - viewfinderTop);

  return (
    <Screen onRefresh={() => intents.refetch()}>
      <Row style={styles.header}>
        <ProfileButton />
        <Txt v="headline" accessibilityRole="header" style={styles.title}>
          Pay
        </Txt>
        <PracticeBadge compact />
      </Row>

      <ScannerArea scanner={scanner} height={viewfinderHeight} aimY={aimY} />

      <View style={styles.section}>
        <SectionHeader title="Waiting for you" />
        <PendingCheckouts />
      </View>

      <MerchantCodeEntry />

      {scanner.status === "running" ? (
        <ToggleRow
          title="Torch"
          subtitle="Light up the code at a dim counter"
          icon={FlashlightIcon}
          value={scanner.torch}
          onChange={scanner.setTorch}
        />
      ) : null}

      <Card>
        <Txt v="bodyM">Pay straight from the vault that matches. The bill is checked as you pay — nothing to upload later.</Txt>
        <PracticeBadge />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: HEADER_HEIGHT },
  title: { flex: 1 },
  section: { gap: space.xs },
});
