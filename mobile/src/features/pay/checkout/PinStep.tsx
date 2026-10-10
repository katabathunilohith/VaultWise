import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WarningCircleIcon } from "@/components/icons";
import { ModalScreen, PinPad, PracticeBadge, Row, Stack, Txt } from "@/components/ui";
import { DEMO_PIN } from "@/lib/api/demo";
import type { PaymentIntent } from "@/lib/api/pay-types";
import { space, useTheme } from "@/theme";
import { payAmount } from "../format";
import type { CheckoutFlow } from "./useCheckoutFlow";

/** R9: the pad's bottom edge sits ~48 pt above the home indicator (ModalScreen adds 24). */
const PAD_LIFT = 24;

/** PIN step: the fallback when biometrics aren't available or were declined. Auto-submits. */
export function PinStep({ intent, flow }: { intent: PaymentIntent; flow: CheckoutFlow }) {
  const { c } = useTheme();
  const submitting = flow.phase.kind === "submitting";
  const message = flow.phase.kind === "pin" ? flow.phase.message : null;
  return (
    <ModalScreen back={flow.backToReview} scroll={false}>
      <View style={styles.fill}>
        <Stack gap={space.xs}>
          <Txt v="headline" accessibilityRole="header">
            Enter your PIN
          </Txt>
          <Txt v="bodyM" color="textMuted">
            To pay {payAmount(intent.amount, intent.currency)} to {intent.merchant.name}
            {flow.vault ? ` from ${flow.vault.name}` : ""}.
          </Txt>
          <Row gap={space.xs}>
            <PracticeBadge />
            {flow.practice ? (
              <Txt v="caption" color="textMuted">
                Practice PIN: {DEMO_PIN}
              </Txt>
            ) : null}
          </Row>
        </Stack>

        <View style={styles.status} accessibilityLiveRegion="polite">
          {submitting ? (
            <Row gap={space.xs}>
              <ActivityIndicator color={c.textMuted} />
              <Txt v="bodyM" color="textMuted">
                Checking your PIN
              </Txt>
            </Row>
          ) : message ? (
            <Row gap={6} style={styles.top}>
              <WarningCircleIcon size={18} color={c.danger} weight="bold" />
              <Txt v="bodyM" color="danger" style={styles.flex}>
                {message}
              </Txt>
            </Row>
          ) : null}
        </View>

        <View style={styles.pad}>
          <PinPad
            key={flow.pinResets}
            onComplete={(pin) => void flow.submit(pin, "pin")}
            error={flow.pinError}
            biometric={flow.practice ? flow.bio : null}
            onBiometric={() => void flow.retryBiometric()}
            disabled={submitting}
          />
        </View>
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "space-between", gap: space.md },
  status: { minHeight: 28, justifyContent: "center" },
  top: { alignItems: "flex-start" },
  flex: { flex: 1 },
  pad: { marginBottom: PAD_LIFT },
});
