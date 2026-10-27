import type { ComponentType } from "react";
import type { StepState, TimelineStep } from "@/components/ui";
import type { IntentStatus, PaymentIntent } from "@/lib/api/pay-types";
import type { TokenName } from "@/lib/haptics";
import { Declined, InReview, Paid } from "./Outcomes";
import { Processing } from "./Processing";
import { Cancelled, Expired } from "./Unavailable";
import type { CheckoutFlow } from "./useCheckoutFlow";
import type { PayVault } from "./vaults";

/** What a status's screen is given. */
export interface OutcomeViewProps {
  intent: PaymentIntent;
  /** The vault paying (or that paid) this checkout. */
  vault: PayVault | null;
  /** The release tracker. */
  steps: TimelineStep[];
  flow: Pick<CheckoutFlow, "paidFrom" | "close" | "done" | "talkToPerson">;
}

/** The tracker's last ("decision") step. Without `state`, the server's state stands. */
export interface DecisionStep {
  title: string;
  state?: StepState;
  detail?: string;
}

export interface Outcome {
  /** The screen for this status; null while it's the customer's turn (the flow's phase picks the step). */
  View: ComponentType<OutcomeViewProps> | null;
  /** Played once when a payment confirmed on this screen reaches this status; null if it isn't an outcome. */
  haptic: TokenName | null;
  decision: (intent: PaymentIntent) => DecisionStep;
}

const notDecided = (intent: PaymentIntent): DecisionStep => ({ title: `Payment to ${intent.merchant.name}` });

/** Everything the checkout does per payment status, in one place. */
const OUTCOMES: Record<IntentStatus, Outcome> = {
  requires_customer: { View: null, haptic: null, decision: notDecided },
  processing: { View: Processing, haptic: null, decision: notDecided },
  succeeded: {
    View: Paid,
    haptic: "pay.success",
    decision: (intent) =>
      intent.dryRun
        ? { title: `Ready to pay ${intent.merchant.name}`, state: "done", detail: "Practice run, so nothing was paid" }
        : { title: `Paid to ${intent.merchant.name}`, state: "done" },
  },
  in_review: {
    View: InReview,
    haptic: "proof.review",
    decision: (intent) =>
      intent.dryRun
        ? { title: "A person would check it", state: "warn", detail: "Practice run, so nothing is set aside" }
        : { title: "A person checks it", state: "active", detail: "Your money is set aside until then" },
  },
  declined: { View: Declined, haptic: "error", decision: () => ({ title: "Not paid", state: "failed" }) },
  expired: { View: Expired, haptic: null, decision: notDecided },
  cancelled: { View: Cancelled, haptic: null, decision: notDecided },
};

/** A status this build doesn't know (a newer server) is treated as expired: nothing to pay here. */
export function outcomeOf(status: IntentStatus): Outcome {
  return OUTCOMES[status] ?? OUTCOMES.expired;
}
