import { ModalScreen, ScreenSkeleton } from "@/components/ui";
import { ApiError } from "@/lib/api/errors";
import { CalmError } from "../CalmError";
import { Declined, InReview, Paid, PaymentFailed } from "./Outcomes";
import { PinStep } from "./PinStep";
import { Processing } from "./Processing";
import { ReviewStep } from "./ReviewStep";
import { Unavailable } from "./Unavailable";
import { useCheckoutFlow } from "./useCheckoutFlow";

/** Pay with Vaultwise checkout (full-screen modal, calm core). Picks the view for where the payment is. */
export function CheckoutScreen({ intentId }: { intentId: string | undefined }) {
  const flow = useCheckoutFlow(intentId);
  const { q, intent, phase } = flow;

  if (!intentId) return <Unavailable reason="notfound" flow={flow} />;

  if (!intent) {
    if (q.isError) {
      if (q.error instanceof ApiError && q.error.status === 404) return <Unavailable reason="notfound" flow={flow} />;
      return (
        <ModalScreen title="Checkout" onClose={flow.close}>
          <CalmError title="This payment didn't load" error={q.error} onRetry={() => void q.refetch()} />
        </ModalScreen>
      );
    }
    return (
      <ModalScreen title="Checkout" onClose={flow.close}>
        <ScreenSkeleton />
      </ModalScreen>
    );
  }

  if (flow.expired) return <Unavailable reason="expired" merchant={intent.merchant.name} flow={flow} />;

  switch (intent.status) {
    case "requires_customer":
      if (phase.kind === "pin" || (phase.kind === "submitting" && phase.from === "pin")) return <PinStep intent={intent} flow={flow} />;
      if (phase.kind === "failed") return <PaymentFailed error={phase.error} flow={flow} />;
      return <ReviewStep intent={intent} flow={flow} />;
    case "processing":
      return <Processing intent={intent} flow={flow} />;
    case "succeeded":
      return <Paid intent={intent} flow={flow} />;
    case "in_review":
      return <InReview intent={intent} flow={flow} />;
    case "declined":
      return <Declined intent={intent} flow={flow} />;
    case "cancelled":
      return <Unavailable reason="cancelled" merchant={intent.merchant.name} flow={flow} />;
    default:
      return <Unavailable reason="expired" merchant={intent.merchant.name} flow={flow} />;
  }
}
