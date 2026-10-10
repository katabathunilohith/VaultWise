import { Card, ModalScreen, PracticeBadge, Stack, Timeline, Txt } from "@/components/ui";
import type { PaymentIntent } from "@/lib/api/pay-types";
import { space } from "@/theme";
import { payAmount } from "../format";
import { checkoutSteps } from "./stages";
import type { CheckoutFlow } from "./useCheckoutFlow";
import { payingVault } from "./vaults";

/** While the checkout's checks run: where it is and what happens next (the release tracker). */
export function Processing({ intent, flow }: { intent: PaymentIntent; flow: CheckoutFlow }) {
  const vault = payingVault(intent, flow.vault);
  const steps = checkoutSteps(intent, vault?.name ?? null);
  return (
    <ModalScreen title="Checkout" onClose={flow.close}>
      <Stack gap={space.xs}>
        <Txt v="headline" accessibilityRole="header">
          {intent.dryRun ? `Checking the payment to ${intent.merchant.name}` : `Paying ${intent.merchant.name}`}
        </Txt>
        <Txt v="bodyM" color="textMuted" accessibilityLiveRegion="polite">
          {payAmount(intent.amount, intent.currency)}
          {vault ? ` from ${vault.name}` : ""}. This takes a few seconds, and carries on if you close this screen.
          {intent.dryRun ? " It's a practice run, so nothing is paid." : ""}
        </Txt>
        <PracticeBadge />
      </Stack>
      {steps.length ? (
        <Card>
          <Timeline steps={steps} />
        </Card>
      ) : null}
    </ModalScreen>
  );
}
