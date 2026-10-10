import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Amount, Button, HoldToConfirm, ModalScreen, PracticeBadge, Txt } from "@/components/ui";
import type { PaymentIntent } from "@/lib/api/pay-types";
import { space } from "@/theme";
import { payAmount } from "../format";
import { Breakdown } from "./Breakdown";
import { InvoiceDisclosure } from "./InvoiceDisclosure";
import { MerchantHeader } from "./MerchantHeader";
import { PayFromCard } from "./PayFromCard";
import type { CheckoutFlow } from "./useCheckoutFlow";
import { VaultPicker } from "./VaultPicker";

/**
 * The checkout before paying: merchant, amount, invoice, paying vault and the full breakdown,
 * then press-and-hold to pay in the main-button slot (deliberate friction for money going out).
 */
export function ReviewStep({ intent, flow }: { intent: PaymentIntent; flow: CheckoutFlow }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const busy = flow.phase.kind === "authenticating" || flow.phase.kind === "submitting";
  const amount = payAmount(intent.amount, intent.currency);
  return (
    <ModalScreen
      title="Checkout"
      onClose={flow.close}
      footer={
        busy ? (
          <Button label={flow.phase.kind === "authenticating" ? "Waiting for confirmation" : "Confirming payment"} loading />
        ) : (
          <HoldToConfirm label={`Hold to pay ${amount}`} onConfirm={() => void flow.start()} disabled={flow.blocked} />
        )
      }
    >
      <MerchantHeader intent={intent} />

      <View style={styles.amount}>
        <Txt v="labelM" color="textMuted">
          Amount to pay
        </Txt>
        <Amount value={intent.amount} currency={intent.currency} size="l" animate={false} />
        <PracticeBadge />
      </View>

      <InvoiceDisclosure intent={intent} />

      <PayFromCard intent={intent} vault={flow.vault} canChange={flow.options.length > 1} onChange={() => setPickerOpen(true)} />

      {flow.vault ? <Breakdown intent={intent} vault={flow.vault} /> : null}

      <VaultPicker
        visible={pickerOpen}
        intent={intent}
        options={flow.options}
        selectedId={flow.vault?.id ?? null}
        onSelect={flow.selectVault}
        onClose={() => setPickerOpen(false)}
      />
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  amount: { gap: space.xxs },
});
