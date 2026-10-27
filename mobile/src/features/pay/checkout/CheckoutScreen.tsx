import { ModalScreen, ScreenSkeleton } from "@/components/ui";
import { ApiError } from "@/lib/api/errors";
import { CalmError } from "../CalmError";
import { outcomeOf } from "./outcome-table";
import { PaymentFailed } from "./Outcomes";
import { PinStep } from "./PinStep";
import { ReviewStep } from "./ReviewStep";
import { checkoutSteps } from "./stages";
import { Expired, Unavailable } from "./Unavailable";
import { useCheckoutFlow } from "./useCheckoutFlow";
import { payingVault } from "./vaults";

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

  if (flow.expired) return <Expired intent={intent} flow={flow} />;

  const Outcome = outcomeOf(intent.status).View;
  if (Outcome) {
    const vault = payingVault(intent, flow.vault);
    return <Outcome intent={intent} vault={vault} steps={checkoutSteps(intent, vault?.name ?? null)} flow={flow} />;
  }

  // Still the customer's turn: where they are in paying picks the step.
  if (phase.kind === "pin" || (phase.kind === "submitting" && phase.from === "pin")) return <PinStep intent={intent} flow={flow} />;
  if (phase.kind === "failed") return <PaymentFailed error={phase.error} flow={flow} />;
  return <ReviewStep intent={intent} flow={flow} />;
}
